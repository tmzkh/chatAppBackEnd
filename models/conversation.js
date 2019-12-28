var mongoose = require('mongoose');
//require('mongoose-uuid2')(mongoose);
//var UUID = mongoose.Types.UUID;


// conversation schema
let conversationSchema = mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    customer: {
        id: {
            type: String,
            required: true
        },
        name: String
    },
    custServ: {
        id: {
            type: String,
            required: true
        },
        name: String
    },
    messages: {
        type: Array,
        default: []
    }
}, { collection: 'conversations', _id: false });

let Conversation = module.exports = mongoose.model('Conversation', conversationSchema);