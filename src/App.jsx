import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';
import Home from './pages/Home';
import About from './pages/About';
import OurPastor from './pages/OurPastor';
import Services from './pages/Services';
import Events from './pages/Events';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Give from './pages/Give';
import Contact from './pages/Contact';
import JoyLadiesCircle from './pages/JoyLadiesCircle';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unsubscribe from './pages/Unsubscribe';
import NotFound from './pages/NotFound';

// Dashboard pages are lazy so they (and TipTap/CodeMirror) stay out of the
// public bundle and out of the SSR module graph — they must never be
// imported eagerly from anything a public page reaches.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardPosts = lazy(() => import('./pages/DashboardPosts'));
const DashboardEvents = lazy(() => import('./pages/DashboardEvents'));
const DashboardUsers = lazy(() => import('./pages/DashboardUsers'));
const DashboardComments = lazy(() => import('./pages/DashboardComments'));
const DashboardMessages = lazy(() => import('./pages/DashboardMessages'));
const DashboardEmail = lazy(() => import('./pages/DashboardEmail'));
const DashboardAdminEmail = lazy(() => import('./pages/DashboardAdminEmail'));
const DashboardAdminEmailMonitoring = lazy(() => import('./pages/DashboardAdminEmailMonitoring'));
const DashboardNewsletter = lazy(() => import('./pages/DashboardNewsletter'));
const DashboardDonations = lazy(() => import('./pages/DashboardDonations'));
const DashboardProfile = lazy(() => import('./pages/DashboardProfile'));
const DashboardDirectory = lazy(() => import('./pages/DashboardDirectory'));
const DashboardAdminDonations = lazy(() => import('./pages/DashboardAdminDonations'));
const DashboardBulletin = lazy(() => import('./pages/DashboardBulletin'));
const DashboardBulletinEditor = lazy(() => import('./pages/DashboardBulletinEditor'));

function ScrollToTop() {
  const { pathname } = useLocation();
  const firstRender = useRef(true);
  useEffect(() => {
    // Skip the mount scroll: hydration would otherwise yank a reader who
    // already scrolled the server-rendered page before JS loaded.
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const dashboardFallback = (
  <div className="text-center py-24">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div>
  </div>
);

export default function App() {
  return (
    <>
      <ScrollToTop />
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/our-pastor" element={<OurPastor />} />
              <Route path="/services" element={<Services />} />
              <Route path="/events" element={<Events />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:id" element={<BlogPost />} />
              <Route path="/give" element={<Give />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/joy-ladies-circle" element={<JoyLadiesCircle />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              {/* Routes only accepts Route children, so the Suspense boundary
                  for the lazy dashboard chunk is a pathless layout route. */}
              <Route element={<Suspense fallback={dashboardFallback}><Outlet /></Suspense>}>
                <Route path="/dashboard" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><Dashboard /></ProtectedRoute>} />
                <Route path="/dashboard/posts" element={<ProtectedRoute roles={['admin','contributor']}><DashboardPosts /></ProtectedRoute>} />
                <Route path="/dashboard/events" element={<ProtectedRoute roles={['admin','contributor']}><DashboardEvents /></ProtectedRoute>} />
                <Route path="/dashboard/bulletin" element={<ProtectedRoute roles={['admin','contributor']}><DashboardBulletin /></ProtectedRoute>} />
                <Route path="/dashboard/bulletin/:weekStart" element={<ProtectedRoute roles={['admin','contributor']}><DashboardBulletinEditor /></ProtectedRoute>} />
                <Route path="/dashboard/users" element={<ProtectedRoute roles={['admin']}><DashboardUsers /></ProtectedRoute>} />
                <Route path="/dashboard/comments" element={<ProtectedRoute roles={['admin']}><DashboardComments /></ProtectedRoute>} />
                <Route path="/dashboard/messages" element={<ProtectedRoute roles={['admin']}><DashboardMessages /></ProtectedRoute>} />
                <Route path="/dashboard/newsletter" element={<ProtectedRoute roles={['admin']}><DashboardNewsletter /></ProtectedRoute>} />
                <Route path="/dashboard/email" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><DashboardEmail /></ProtectedRoute>} />
                <Route path="/dashboard/email/:accountId" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><DashboardEmail /></ProtectedRoute>} />
                <Route path="/dashboard/profile" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><DashboardProfile /></ProtectedRoute>} />
                <Route path="/dashboard/directory" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><DashboardDirectory /></ProtectedRoute>} />
                <Route path="/dashboard/donations" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><DashboardDonations /></ProtectedRoute>} />
                <Route path="/dashboard/admin/donations" element={<ProtectedRoute roles={['admin']}><DashboardAdminDonations /></ProtectedRoute>} />
                <Route path="/dashboard/admin/email" element={<ProtectedRoute roles={['admin']}><DashboardAdminEmail /></ProtectedRoute>} />
                <Route path="/dashboard/admin/email/monitoring" element={<ProtectedRoute roles={['admin']}><DashboardAdminEmailMonitoring /></ProtectedRoute>} />
              </Route>
              {/* Catch-all: unknown URLs render the Not Found page inside the normal layout.
                  The server answers these with a 404 status (see server/spa-routes.js). */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </>
  );
}
