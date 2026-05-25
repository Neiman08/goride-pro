import client from './client';

export const ridesAPI = {
  getEstimate: (originLat, originLng, destLat, destLng) =>
    client.get('/rides/estimate', { params: { originLat, originLng, destLat, destLng } }),

  requestRide: (data) => client.post('/rides/request', data),
  getActive: () => client.get('/rides/active'),
  getHistory: (params) => client.get('/rides/history', { params }),
  getAvailable: () => client.get('/rides/available'),

  accept: (id) => client.post(`/rides/${id}/accept`),
  reject: (id) => client.post(`/rides/${id}/reject`),
  start: (id) => client.post(`/rides/${id}/start`),
  complete: (id) => client.post(`/rides/${id}/complete`),
  cancel: (id, reason) => client.post(`/rides/${id}/cancel`, { reason }),
  rate: (id, rating, comment) => client.post(`/rides/${id}/rate`, { rating, comment }),
};
