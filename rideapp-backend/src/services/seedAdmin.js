const User = require('../models/User');
const TariffConfig = require('../models/TariffConfig');
const logger = require('../utils/logger');

const seedAdmin = async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  const exists = await User.findOne({ email });
  if (!exists) {
    await User.create({ name, email, password, role: 'admin', isApproved: true, isActive: true });
    logger.info(`Admin user created: ${email}`);
  }

  await TariffConfig.seedDefaults();
};

module.exports = seedAdmin;
