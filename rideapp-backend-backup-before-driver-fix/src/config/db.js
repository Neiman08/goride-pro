const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not defined in environment');

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  let retries = 5;
  while (retries > 0) {
    try {
      await mongoose.connect(uri, options);
      logger.info(`MongoDB connected: ${mongoose.connection.host}`);
      return;
    } catch (err) {
      retries--;
      logger.error(`MongoDB connection failed. Retries left: ${retries}. Error: ${err.message}`);
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

module.exports = connectDB;
