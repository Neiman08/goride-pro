import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

// Subscribes to a socket event and cleans up on unmount.
// Usage: useSocketEvent('ride:accepted', (data) => handleAccepted(data));
const useSocketEvent = (event, handler) => {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !event || !handler) return;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, handler]);
};

export default useSocketEvent;
