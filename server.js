const io = require('socket.io')();
require('dotenv').config()


const customerPool = new Object;
const csPool = new Object;
const waitingCustomers = new Object;
const activeChats = new Object;

const socketPool = new Object;

let uuidv4 = require('uuid/v4');
const dbContext = require('./modules/dbConnection');

/**
 * Put customers and servants to proper pools
 */
io.use((socket, next) => {
    const query = socket.handshake.query;
    if (query['type'] == 'customer') {
        // if customer is already in pool, just continue
        if (customerPool[socket.id]) {
            next();
        } else { // otherwise create new customer to put to customer pool and to waiting customers pool
            const cust = {
                id: uuidv4(),
                socket: socket.id,
                name:query['name'],
                custServId: null,
                chatStarted: Date.now()
            };
            socketPool[cust.id] = socket.id;
            waitingCustomers[socket.id] = cust;
            customerPool[socket.id] = cust;
            next();
        }
    } else if (query['type'] == 'customerService') {
        if (socketPool[query.id]) {
            let oldSocket = socketPool[query.id];
            let cs = csPool[oldSocket];
            cs.socket = socket.id;
            csPool[socket.id] = cs;
            socketPool[query.id] = socket.id;
            delete csPool[oldSocket];

            // TODO: acknowledge client from possible open chats

            next();
        } else {
            csPool[socket.id] = { // otherwise create new customer servant to put to customer servant pool to wait for customers
                id: query.id,
                socket: socket.id, 
                name: query.name,
                maxChats:3,
                activeChats:[],
                onBreak: false,
                lastActivatedChat: null
            };
            socketPool[query.id] = socket.id;
            next();
        }
    } else {
        next(new Error('Authentication error'));
    }
});

io.on('connection', client => {
    console.log();
    console.log('----------------------------------------------------------------------------');
    console.log(client.id + ' connected');
    console.log('----------------------------------------------------------------------------');
    console.log();
    consoleLogPools();

    connectCustomersToCustServ();

    /**
     * forward messages to correct receivers
     */
    client.on('message', message => {
        // TODO: save messages to db
        if (client.handshake.query.type == 'customer') {
            message.timeStamp = Date.now();
            message.from = customerPool[client.id].name;
            message.custId = customerPool[client.id].id;
            if (Object.prototype.hasOwnProperty.call(activeChats, client.id)) {
                let csSocket = socketPool[activeChats[client.id].custServ];
                const messageToDb = {
                    timeStamp: message.timeStamp,
                    from: message.from,
                    text: message.text
                }
                io.to(`${csSocket}`).emit('message', message);
                message.from = 'Me';
                io.to(`${client.id}`).emit('message', message);
                dbContext.addMessage(activeChats[client.id].convId, messageToDb);
            }
        } else if (client.handshake.query.type == 'customerService') {
            message.timeStamp = Date.now();
            message.from = csPool[client.id].name;
            let custSocket = socketPool[message.to];
            if (Object.prototype.hasOwnProperty.call(activeChats, custSocket)) {
                const messageToDb = {
                    timeStamp: message.timeStamp,
                    from: message.from,
                    text: message.text
                }
                io.to(`${custSocket}`).emit('message', message);
                message.from = 'Me';
                io.to(`${client.id}`).emit('message', message);
                dbContext.addMessage(activeChats[custSocket].convId, messageToDb);
            }
        } else {

        }
    });

    /**
     * delete client from pools
     */
    client.on('disconnect', () => {
        if (client.handshake.query.type == 'customer') {
            if (waitingCustomers[client.id]) {
                delete waitingCustomers[client.id];
                delete socketPool[customerPool[client.id].id];
                delete customerPool[client.id];
            } else if (activeChats[client.id]) {
                const activeChat = activeChats[client.id];
                const custServId = activeChat.custServ;
                const custServSocket = socketPool[custServId];
                delete socketPool[customerPool[client.id].id];
                delete customerPool[client.id];
                delete csPool[custServSocket]['activeChats'][client.id];
                delete activeChats[client.id];
            }
        } else if (client.handshake.query.type == 'customerService') {
            if (csPool[client.id]) {
                if (Object.keys(csPool[client.id]['activeChats']).length < 1) {
                    delete socketPool[csPool[client.id].id];
                    delete csPool[client.id];
                } else {
                    csPool[client.id].onBreak = true;
                }
            }
        } else {

        }

        connectCustomersToCustServ();
        
        console.log();
        console.log('----------------------------------------------------------------------------');
        console.log(client.id + " disconnected");
        console.log('----------------------------------------------------------------------------');
        console.log();
        consoleLogPools();
    });
});

/**
 * loop through waiting customers, and if there are available customer servants, connect
 * customer with one
 */
connectCustomersToCustServ = () => {
    for (let custSocket in waitingCustomers) {
        if (Object.prototype.hasOwnProperty.call(waitingCustomers, custSocket)) {
            // find available customer servant
            let custServ = findNextCS();
            if (custServ != null) {
                // find customer from pool
                let cust = waitingCustomers[custSocket];
                // set customer's customer servant id
                cust['custServId'] = custServ.id;
                // add customer to customer servant
                custServ['activeChats'][custSocket] = cust;
                // update last activated chat info
                custServ.lastActivatedChat = Date.now();
                // create id to conversation
                let convId = uuidv4();
                // create active chat
                activeChats[custSocket] = {
                    convId: convId,
                    custServ: custServ.id
                };
                // delete customer from waiting pool
                delete waitingCustomers[custSocket];
                // acknowledge clients that connection has been made
                const csAcknowledgement = {
                    type: 'newChat',
                    custId: cust.id
                }
                io.to(`${custServ.socket}`).emit('acknowledgement', csAcknowledgement);
                const cuAcknowledgement = {
                    type: 'connectedToCs'
                }
                io.to(`${custSocket}`).emit('acknowledgement', cuAcknowledgement);
                // create conversation to db
                dbContext.createConversation(convId, cust, custServ);
            }
        }
    }
    consoleLogPools();
}

/**
 * finds available customer servant from pool, whose latest activated chat is oldest
 * return null if any of servants are available
 */
findNextCS = () => {
    let custServ = null;
    for (let csSocket in csPool) {
        if (Object.prototype.hasOwnProperty.call(csPool, csSocket)) {
            // if servant is on break, continue to next
            if (csPool[csSocket].onBreak) {
                continue;
            }
            // check if current servant has fewer chats than the servant can handle
            if (Object.keys(csPool[csSocket].activeChats).length < csPool[csSocket].maxChats) {
                if (custServ == null) {
                    custServ = csPool[csSocket];
                } else {
                    // check which servants has fewer chats
                    if (csPool[csSocket].activeChats.length < custServ.activeChats.length) {
                        custServ = csPool[csSocket];                    
                    } else if (csPool[csSocket].activeChats.length == custServ.activeChats.length) {
                        // if amount of chats are equal, compare last activated chat
                        if (csPool[csSocket].lastActivatedChat < custServ.lastActivatedChat) {
                            custServ = csPool[csSocket];
                        }
                    }
                }
            }
        }
    }
    return custServ;
}

consoleLogPools = () => {
    console.log();
    console.log('----------------------------------------------------------------------------');
    console.log("waitingCustomers");
    console.log(waitingCustomers);
    console.log();
    console.log("active chats");
    console.log(activeChats);
    console.log();
    console.log("csPool");
    console.log(csPool);
    console.log();
    console.log("customerPool");
    console.log(customerPool);
    console.log();
    console.log("socketPool");
    console.log(socketPool);
    console.log('----------------------------------------------------------------------------');
    console.log();
}

io.listen(4000);