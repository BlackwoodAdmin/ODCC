import { useEffect, useRef } from 'react';

export default function useExitIntent(onExitIntent, { delay = 10000 } = {}) {
  const firedRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    mountTimeRef.current = Date.now();
    firedRef.current = false;

    const fire = () => {
      if (firedRef.current) return;
      if (Date.now() - mountTimeRef.current < delay) return;
      firedRef.current = true;
      onExitIntent();
    };

    const handleMouseLeave = (e) => {
      if (e.clientY <= 0) fire();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') fire();
    };

    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onExitIntent, delay]);
}
