const uuidv4 = require('uuid/v4');

const waitingCustomers = [];
const customersInConversation = [];
const custServants = [];

/**
 * Adds client to proper pool
 * Customer client must contain type, socketId and name
 * Customer servant client must contain type, id, socketId, name and maxChats
 * @param {object} client 
 */
const addUser = (client) => {
    // extract client type
    const { type } = client;
    if (type === 'customer') {
        const {socketId, name} = client;
        if (!name) return { error: 'Name must be specified!' };
        const existingSocket = customersInConversation.find(cust => cust.socketId === socketId);
        if (existingSocket) return { error: 'Socket already taken' };
        const user = {
            id: uuidv4(),
            socketId: socketId,
            name: name,
            custServId: null,
            chatStarted: Date.now()
        };
        waitingCustomers.push(user);
        consLog();
        return { user };
    } else if (type === 'customerService') {
        const { id, socketId, name, maxChats } = client;
        if (!id || !name || !maxChats) return { error: 'Invalid custServant object!' };
        const existingCs = custServants.find((cs) => cs.id === id);
        if (existingCs) {
            existingCs.socketId = socketId;
            return { notification: 'cs was already connected', user: existingCs };
        }
        const user = {
            id: id,
            socketId: socketId, 
            name: name,
            maxChats: maxChats,
            activeChats:[],
            onBreak: false,
            lastActivatedChat: null
        };
        custServants.push(user);
        consLog();
        return { user };
    } else if (type === 'admin') {
        return { warning: 'not implemented yet' };
    } else {
        return { error: 'Not proper client type!' };
    }
}

/**
 * Finds customer by id or socketId
 * @param {string} id 
 * @param {string} socketId 
 */
const findCustomer = (id, socketId) => {
    if (socketId || id) {
        const waitC = customersInConversation.find(cust => cust.socketId === socketId || cust.id === id);
        const actC = waitingCustomers.find(cust => cust.socketId === socketId || cust.id === id);
        if (waitC) {
            const cust = waitC;
            return cust;
        } else if (actC) {
            const cust = actC;
            return cust;
        }
    }
    return null;
}

const isWaitingCustomers = () => {
    return waitingCustomers.length > 0;
}

/**
 * Returns oldest waiting customer and moves it to active chat
 */
const findAndMoveNextWaitingCustomer = () => {
    if (!isWaitingCustomers) {
        return { notification: 'no waiting customers' };
    }
    const cust = waitingCustomers.shift();
    customersInConversation.push(cust);
    consLog();
    return { cust };
}

const findCustomerServant = (id, socketId) => {
    if (socketId) {
        const cs = custServants.find(custServ => custServ.socketId === socketId);
        if (cs) {
            const custServ = cs;
            return custServ;
        }
    } else if (id) {
        const cs = custServants.find(custServ => custServ.id === id);
        if (cs) {
            const custServ = cs;
            return custServ;
        }
    }
    return null;
}

const findAvailableCustomerServant = () => {
    let custServ = null;
    for (let i = 0; i < custServants.length; i++) {
        const cs = custServants[i];
        if (cs.activeChats.length >= cs.maxChats || cs.onBreak) {
            continue;
        }
        if (custServ == null) {
            custServ = cs;
        } else if (cs.activeChats.length < custServ.activeChats.length) {
            custServ = cs;
        } else if (cs.activeChats.length == custServ.activeChats.length &&
            cs.lastActivatedChat < custServ.lastActivatedChat) {
            custServ = cs;
        }
    }
    return custServ;
}

/**
 * deletes user by id or socketId
 * @param {string} id 
 * @param {string} socketId 
 */
const deleteUser = (id, socketId) => {
    if (socketId || id) {
        let ind = customersInConversation.findIndex(cust => cust.socketId === socketId || cust.id === id);
        if (ind !== -1) {
            const cust = customersInConversation[ind];
            const cs = findCustomerServant(cust.custServId, null);
            if (cs) {
                let i = cs.activeChats.findIndex(c => c === cust.id);
                cs.activeChats.splice(i, 1);
            }
            return customersInConversation.splice(ind, 1)[0];
        }
        ind = waitingCustomers.findIndex(cust => cust.socketId === socketId || cust.id === id);
        if (ind !== -1) return waitingCustomers.splice(ind, 1)[0];
        ind = custServants.findIndex(custS => custS.socketId === socketId || custS.id === id);
        if (ind !== -1) {
            if (custServants[ind].activeChats.length > 0) {
                custServants[ind].onBreak = true;
                return { notification: 'cs not deleted, put onBreak' }
            }
            return custServants.splice(ind, 1)[0];
        }
    }
    return { warning: 'no user deleted' };
}

consLog = () => {
    console.log();
    console.log('----------------------------------------------------------------------------');
    console.log();
    console.log("waitingCustomers");
    console.log(waitingCustomers);
    console.log();
    console.log("customersInConversation");
    console.log(customersInConversation);
    console.log();
    console.log("custServants");
    console.log(custServants);
    console.log();
    console.log('----------------------------------------------------------------------------');
    console.log();
}

module.exports = {
    consLog,
    addUser, 
    findCustomer, 
    isWaitingCustomers,
    findAndMoveNextWaitingCustomer, 
    findCustomerServant,
    findAvailableCustomerServant,
    deleteUser
};