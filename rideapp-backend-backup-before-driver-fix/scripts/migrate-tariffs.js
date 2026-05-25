require('dotenv').config();

const mongoose = require('mongoose');
const TariffConfig = require('../src/models/TariffConfig');

mongoose.connect(process.env.MONGODB_URI)
.then(async () => {

  await TariffConfig.deleteMany({});

  await TariffConfig.insertMany([

    {
      rideType: 'economy',
      label: 'Economy',
      description: 'Affordable everyday rides',
      icon: '🚗',
      maxPassengers: 4,
      estimatedWaitMinutes: 4,

      baseFare: 2,
      ratePerMile: 1.15,
      ratePerMinute: 0.22,
      minimumFare: 5,

      platformCommissionPct: 30,
      driverPayoutPct: 70,

      isActive: true
    },

    {
      rideType: 'comfort',
      label: 'Comfort',
      description: 'Newer cars, extra legroom',
      icon: '🚙',
      maxPassengers: 4,
      estimatedWaitMinutes: 6,

      baseFare: 3.5,
      ratePerMile: 1.75,
      ratePerMinute: 0.32,
      minimumFare: 8,

      platformCommissionPct: 30,
      driverPayoutPct: 70,

      isActive: true
    },

    {
      rideType: 'xl',
      label: 'XL',
      description: 'SUVs for up to 6 passengers',
      icon: '🚐',
      maxPassengers: 6,
      estimatedWaitMinutes: 8,

      baseFare: 5,
      ratePerMile: 2.25,
      ratePerMinute: 0.45,
      minimumFare: 12,

      platformCommissionPct: 30,
      driverPayoutPct: 70,

      isActive: true
    }

  ]);

  console.log('✅ NUEVAS tarifas migradas');

  process.exit();

})
.catch(err => {
  console.error(err);
  process.exit(1);
});