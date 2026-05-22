const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://ayushshrivastava:yw6xYvn9ApkCGA3I@cluster0.xsezbow.mongodb.net/sentinel';

mongoose.connect(MONGODB_URI).then(async () => {
    console.log('Connected to DB');
    const Screenshot = require('./models/Screenshot');
    
    // Update all screenshots that have the OLD default ID to the NEW user ID
    const result = await Screenshot.updateMany(
        { adminId: "6a08156c659055093275400a" },
        { $set: { adminId: "6a06fa324239414a07c306ff" } }
    );
    
    console.log(`Updated ${result.modifiedCount} screenshots.`);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
