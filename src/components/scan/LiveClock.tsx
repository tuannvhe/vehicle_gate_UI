import React, { useState, useEffect } from 'react';
import { IconClock } from '../../icons/HeroIcons';
import '../../styles/app.css';

export const LiveClock: React.FC = () => {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <time className="m-clock" dateTime={new Date().toISOString()} aria-label={`Thời gian hiện tại: ${time}`}>
      <IconClock size={16} />
      <span>{time}</span>
    </time>
  );
};
