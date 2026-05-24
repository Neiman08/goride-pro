import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({ baseURL: BASE, timeout: 10000 });

// Attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refreshToken');
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken: refresh });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (d)  => api.post('/auth/register', d),
  login:    (d)  => api.post('/auth/login', d),
  refresh:  (d)  => api.post('/auth/refresh', d),
  logout:   ()   => api.post('/auth/logout'),
  me:       ()   => api.get('/auth/me'),
  updateProfile: (d) => api.patch('/auth/update-profile', d),
  changePassword:(d) => api.patch('/auth/change-password', d),
};

// ── Rides ─────────────────────────────────────────────────────────────────
export const ridesAPI = {
  estimate:     (q)    => api.get('/rides/estimate', { params: q }),
  request:      (d)    => api.post('/rides/request', d),
  active:       ()     => api.get('/rides/active'),
  history:      (p)    => api.get('/rides/history', { params: p }),
  available:    ()     => api.get('/rides/available'),
  accept:       (id)   => api.post(`/rides/${id}/accept`),
  reject:       (id)   => api.post(`/rides/${id}/reject`),
  start:        (id)   => api.post(`/rides/${id}/start`),
  complete:     (id)   => api.post(`/rides/${id}/complete`),
  cancel:       (id,r) => api.post(`/rides/${id}/cancel`, { reason: r }),
  rate:         (id,d) => api.post(`/rides/${id}/rate`, d),
};

// ── Users ─────────────────────────────────────────────────────────────────
export const usersAPI = {
  updateLocation:   (lat, lng) => api.patch('/users/location', { lat, lng }),
  updateAvailability:(isOnline) => api.patch('/users/availability', { isOnline }),
  nearbyDrivers:    (q)         => api.get('/users/drivers/nearby', { params: q }),
};

// ── Admin ─────────────────────────────────────────────────────────────────
export const adminAPI = {
  metrics:        ()    => api.get('/admin/metrics'),
  revenueChart:   (p)   => api.get('/admin/revenue-chart', { params: p }),
  users:          (p)   => api.get('/admin/users', { params: p }),
  user:           (id)  => api.get(`/admin/users/${id}`),
  updateUser:     (id,d)=> api.patch(`/admin/users/${id}`, d),
  drivers:        (p)   => api.get('/admin/drivers', { params: p }),
  liveDrivers:    ()    => api.get('/admin/drivers/live'),
  driverEarnings: (id,p)=> api.get(`/admin/drivers/${id}/earnings`, { params: p }),
  rides:          (p)   => api.get('/admin/rides', { params: p }),
  ride:           (id)  => api.get(`/admin/rides/${id}`),
  commissions:    (p)   => api.get('/admin/commissions', { params: p }),
  tariffs:        ()    => api.get('/admin/tariffs'),
  updateTariff:   (id,d)=> api.patch(`/admin/tariffs/${id}`, d),
};

export default api;
