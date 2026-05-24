import client from './client';

export const usersAPI = {
  updateLocation: (lat, lng) => client.patch('/users/location', { lat, lng }),
  updateAvailability: (isOnline) => client.patch('/users/availability', { isOnline }),
  getNearbyDrivers: (lat, lng) => client.get('/users/drivers/nearby', { params: { lat, lng } }),
};
