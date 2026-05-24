import React from 'react';

const Spinner = ({ size = 40, color = '#7c4dff', fullScreen = false }) => {
  const spinner = (
    <div style={{
      width: size, height: size, border: `3px solid rgba(255,255,255,0.1)`,
      borderTop: `3px solid ${color}`, borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!fullScreen) return spinner;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0a0a0f',
    }}>
      {spinner}
    </div>
  );
};

export default Spinner;
