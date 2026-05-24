import client from './client';

export const authAPI = {
  register: (data) => client.post('/auth/register', data),
  login: (data) => client.post('/auth/login', data),
  logout: () => client.post('/auth/logout'),
  getMe: () => client.get('/auth/me'),
  updateProfile: (data) => client.patch('/auth/update-profile', data),
  changePassword: (data) => client.patch('/auth/change-password', data),
};
