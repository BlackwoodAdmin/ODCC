import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';
import Home from './pages/Home';
import About from './pages/About';
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
import Dashboard from './pages/Dashboard';
import DashboardPosts from './pages/DashboardPosts';
import DashboardEvents from './pages/DashboardEvents';
import DashboardUsers from './pages/DashboardUsers';
import DashboardComments from './pages/DashboardComments';
import DashboardMessages from './pages/DashboardMessages';
import DashboardEmail from './pages/DashboardEmail';
import DashboardAdminEmail from './pages/DashboardAdminEmail';
import DashboardAdminEmailMonitoring from './pages/DashboardAdminEmailMonitoring';
import DashboardNewsletter from './pages/DashboardNewsletter';
import DashboardDonations from './pages/DashboardDonations';
import DashboardProfile from './pages/DashboardProfile';
import DashboardDirectory from './pages/DashboardDirectory';
import DashboardAdminDonations from './pages/DashboardAdminDonations';
import Unsubscribe from './pages/Unsubscribe';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
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
              <Route path="/dashboard" element={<ProtectedRoute roles={['admin','contributor','subscriber']}><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/posts" element={<ProtectedRoute roles={['admin','contributor']}><DashboardPosts /></ProtectedRoute>} />
              <Route path="/dashboard/events" element={<ProtectedRoute roles={['admin','contributor']}><DashboardEvents /></ProtectedRoute>} />
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
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
