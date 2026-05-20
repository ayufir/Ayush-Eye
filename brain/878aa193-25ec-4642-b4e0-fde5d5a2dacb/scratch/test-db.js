const mongoose = require('mongoose');
require('dotenv').config({ path: '../../backend-server/.env' });

console.log('Connecting to: ', process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
      console.log('✅ MongoDB connected successfully!');
      process.exit(0);
  })
  .catch((err) => {
      console.error('❌ MongoDB connection failed!');
      console.error(err);
      process.exit(1);
  });
