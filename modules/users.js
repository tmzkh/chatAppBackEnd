const customers = [];
const custServants = [];

const addUser = ({type, id, socketId, name}) => {
    if (type === 'customer') {
        const existingUser = customers.find((customer) => customer.id === id);
        if (!name) return { error: 'Name must be specified!'};
        if (existingUser) return { error: 'Client already exists!'};

        const cust = {
            id: id,
            socket: socketId,
            name: name,
            custServId: null,
            chatStarted: Date.now()
        };

        customers.push(cust);

    } else if (type === 'customerService') {

    } else if (type === 'admin') {
        
    } else {
        return { error: 'Not proper client type!'};
    }
}