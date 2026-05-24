import client from './client';

export const adminAPI = {
  getMetrics: () => client.get('/admin/metrics'),
  getRevenueChart: (days = 30) => client.get('/admin/revenue-chart', { params: { days } }),

  listUsers: (params) => client.get('/admin/users', { params }),
  getUser: (id) => client.get(`/admin/users/${id}`),
  updateUser: (id, data) => client.patch(`/admin/users/${id}`, data),

  listDrivers: (params) => client.get('/admin/drivers', { params }),
  getLiveDrivers: () => client.get('/admin/drivers/live'),
  getDriverEarnings: (id, params) => client.get(`/admin/drivers/${id}/earnings`, { params }),

  listRides: (params) => client.get('/admin/rides', { params }),
  getRide: (id) => client.get(`/admin/rides/${id}`),

  listCommissions: (params) => client.get('/admin/commissions', { params }),

  getTariffs: () => client.get('/admin/tariffs'),
  updateTariff: (id, data) => client.patch(`/admin/tariffs/${id}`, data),
};
