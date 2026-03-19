import React from 'react';
import useNotification from '../../hooks/useNotification';

export default function Notification() {
  const { notification, clearNotification } = useNotification();
  if (!notification) return null;

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-yellow-600'
  };

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className={`${colors[notification.type] || colors.info} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3`}>
        <span>{notification.message}</span>
        <button onClick={clearNotification} className="ml-2 hover:opacity-75">&times;</button>
      </div>
    </div>
  );
}
