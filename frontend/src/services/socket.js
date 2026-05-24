import { io } from 'socket.io-client';

const URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return socket;
  socket = io(URL, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });
  socket.on('connect',       () => console.log('🔌 Socket connected', socket.id));
  socket.on('disconnect',    (r) => console.log('🔌 Socket disconnected', r));
  socket.on('connect_error', (e) => console.warn('Socket error:', e.message));
  return socket;
};

export const getSocket  = () => socket;
export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
