const mongoose = require('mongoose');
mongoose.connect(process.env.DB_ENDPOINT);
let db = mongoose.connection;

let Conversation = require('../models/conversation');

db.once('open', () => {
    console.log("Connected to MongoDb");
});

db.on('error', err => {
    console.log(err);
});



module.exports = {
    /**
     * create conversation entry to db
     */
    createConversation: (convId, cust, cs) => {
        let conversation = new Conversation();
        conversation._id = convId;
        conversation.customer.id = cust.id;
        conversation.customer.name = cust.name;
        conversation.custServ.id = cs.id;
        conversation.custServ.name = cs.name;

        conversation.save((err) => {
            if (err) {
                console.log(err);
            }
            return;
        });
    },
    /**
     * add message to conversation
     */
    addMessage: (convId, message) => {
        Conversation.updateOne(
            { _id: convId },
            { $push : { messages: message } },
            (err) => {
                if (err) {
                    console.log(err);
                }
                return;
            }
        );
    }
}