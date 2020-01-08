const io = require('socket.io')();
require('dotenv').config()

const {
    consLog,
    addUser, 
    findCustomer, 
    isWaitingCustomers,
    findAndMoveNextWaitingCustomer, 
    findCustomerServant,
    findAvailableCustomerServant,
    deleteUser
} = require('./modules/users');

let uuidv4 = require('uuid/v4');
const dbContext = require('./modules/dbConnection');

/**
 * Put customers and servants to proper pools
 */
io.use((socket, next) => {
    const query = socket.handshake.query;

    query.socketId = socket.id;

    const { user, error, notification, warning } = addUser(query);

    if (error) console.log(error);
    if (notification) console.log(notification);
    if (warning) console.log(warning);
    if (user) { 
        return next();
    } else {
        socket.disconnect();
        return;
    }
});

io.on('connection', client => {
    console.log();
    console.log('----------------------------------------------------------------------------');
    console.log(client.id + ' connected');
    console.log('----------------------------------------------------------------------------');
    console.log();

    connectCustomersToCustServ();

    
    //forward messages to correct receivers
    client.on('message', message => {
        message.timeStamp = Date.now();
        if (client.handshake.query.type == 'customer') {
            const cust = findCustomer(null, client.id);
            const cs = findCustomerServant(cust.custServId, null);
            if (cs != null && io.sockets.connected[cs.socketId]) {
                const messageToDb = {
                    timeStamp: message.timeStamp,
                    from: cust.name,
                    text: message.text
                };
                message.from = 'Me';
                io.to(`${cust.socketId}`).emit('message', message);
                message.from = cust.name;
                message.custId = cust.id;
                io.to(`${cs.socketId}`).emit('message', message);
                dbContext.addMessage(cust.convId, messageToDb);
            } else {
                const notification = {
                    type:"csNotConnected"
                };
                io.to(`${cs.socketId}`).emit('notification', notification);
            }
            dbContext.addMessage(cust.convId, messageToDb);
        } else if (client.handshake.query.type == 'customerService') {
            const cs = findCustomerServant(null, client.id);
            const cust = findCustomer(message.to, null);
            if (cust != null && io.sockets.connected[cust.socketId]) {
                const messageToDb = {
                    timeStamp: message.timeStamp,
                    from: cs.name,
                    text: message.text
                };
                io.to(`${cust.socketId}`).emit('message', message);
                message.from = 'Me';
                message.custId = cust.id;
                io.to(`${cs.socketId}`).emit('message', message);
                dbContext.addMessage(cust.convId, messageToDb);
            } else {
                const notification = {
                    type: "custNotConnected"
                }
                io.to(`${cs.socketId}`).emit('notification', notification);
            }
            
        } else {

        }
    });


    //delete client from pools
    client.on('disconnect', () => {
        if (client.handshake.query.type == 'customer') {
            const cust = findCustomer(null, client.id);
            const custServ = findCustomerServant(cust.custServId, null);
            if (custServ || io.sockets.connected[custServ.socketId]) {
                const notification = {
                    type: 'custDisconnected',
                    custId: cust.id
                }
                io.to(`${custServ.socketId}`).emit('notification', notification);
            }
        } else if (client.handshake.query.type == 'customerService') {

        } else {

        }

        const { warning } = deleteUser(null, client.id);
        if (warning) console.log(warning);
        connectCustomersToCustServ();
        consLog();
        
        console.log();
        console.log('----------------------------------------------------------------------------');
        console.log(client.id + " disconnected");
        console.log('----------------------------------------------------------------------------');
        console.log();
    });
});

/**
 * loop through waiting customers, and if there are available customer servants, connect
 * customer with one
 */
connectCustomersToCustServ = () => {
    while (isWaitingCustomers()) {
        const custServ = findAvailableCustomerServant();
        if (custServ != null) {
            const { notification, cust } = findAndMoveNextWaitingCustomer();
            if (cust) {
                custServ.activeChats.push(cust.id);
                cust.custServId = custServ.id;
                // notify clients that connection has been made
                const csNotification = {
                    type: 'newChat',
                    custId: cust.id
                }
                io.to(`${custServ.socketId}`).emit('notification', csNotification);
                const cuNotification = {
                    type: 'connectedToCs'
                }
                io.to(`${cust.socketId}`).emit('notification', cuNotification);
                // create conversation to db
                const convId = uuidv4();
                cust.convId = convId;
                dbContext.createConversation(convId, cust, custServ);
                consLog();
            }
        } else {
            break;
        }
    }

}

io.listen(4000);