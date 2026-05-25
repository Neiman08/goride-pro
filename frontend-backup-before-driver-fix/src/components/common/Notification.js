import React from 'react';

const COLORS = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#7c4dff',
};

const Notification = ({ notification }) => {
  if (!notification) return null;
  const color = COLORS[notification.type] || COLORS.info;

  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      background: color, color: '#fff', borderRadius: 12,
      padding: '12px 24px', fontSize: 14, fontWeight: 500,
      zIndex: 9999, whiteSpace: 'nowrap',
      boxShadow: `0 8px 24px ${color}44`,
      animation: 'slideDown 0.3s ease',
    }}>
      {notification.message}
      <style>{`@keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
};

export default Notification;
