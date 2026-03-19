import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import Notification from '../common/Notification';
import ExitPopup from '../common/ExitPopup';
import useExitIntent from '../../hooks/useExitIntent';
import useAuth from '../../hooks/useAuth';

export default function MainLayout() {
  const { user } = useAuth();
  const [showExitPopup, setShowExitPopup] = useState(false);

  useExitIntent(
    useCallback(() => {
      if (!user) setShowExitPopup(true);
    }, [user]),
    { delay: 2000 }
  );

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      <Notification />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ExitPopup open={showExitPopup} onClose={() => setShowExitPopup(false)} />
    </div>
  );
}
