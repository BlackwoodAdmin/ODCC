import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import api from '../services/api';
import { formatDate } from '../utils/formatters';

export default function DashboardProfile() {
  const { user, fetchUser } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [directoryListed, setDirectoryListed] = useState(true);
  const [directoryPhone, setDirectoryPhone] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setDirectoryListed(user.directory_listed !== false);
      setDirectoryPhone(user.directory_phone !== false);
    }
  }, [user]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('avatar', file);
      await api.post('/auth/profile/avatar', form);
      await fetchUser();
      setMessage('Profile photo updated');
    } catch (err) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!name.trim()) { setError('Name is required'); return; }
    if (newPassword && newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    if (newPassword && newPassword.length < 6) { setError('New password must be at least 6 characters'); return; }
    if (newPassword && !currentPassword) { setError('Current password is required to change password'); return; }

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || null,
        directory_listed: directoryListed,
        directory_phone: directoryPhone,
      };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      await api.put('/auth/profile', body);
      await fetchUser();
      setMessage('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom max-w-2xl">
        <div className="mb-8">
          <Link to="/dashboard" className="text-sage hover:underline text-sm">&larr; Back to Dashboard</Link>
          <h1 className="text-4xl font-bold text-charcoal mt-2">My Profile</h1>
        </div>

        <div className="bg-white rounded-xl shadow-md p-8">
          {/* Avatar */}
          <div className="flex items-center gap-5 mb-6 pb-6 border-b border-gray-100">
            <div className="relative group">
              {user?.profile_image ? (
                <img src={user.profile_image} alt={user.name} className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-sage/20 flex items-center justify-center text-sage text-3xl font-bold">
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} className="hidden" />
            </div>
            <div>
              <p className="font-semibold text-charcoal">{user?.name}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">Member since {user?.created_at ? formatDate(user.created_at) : '—'}</p>
              {uploading && <p className="text-xs text-sage mt-1">Uploading...</p>}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Directory checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={directoryListed}
                onChange={e => setDirectoryListed(e.target.checked)}
                className="w-4 h-4 text-sage rounded border-gray-300 focus:ring-sage"
              />
              <span className="text-sm font-medium text-charcoal">Include me in the church directory</span>
            </label>

            <div>
              <label className="block text-sm font-semibold text-charcoal mb-1">Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={255}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-charcoal mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="flex items-center gap-3">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(386) 555-1234"
                  maxLength={20}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
                />
              </div>
              {directoryListed && (
                <label className="flex items-center gap-3 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={directoryPhone}
                    onChange={e => setDirectoryPhone(e.target.checked)}
                    className="w-4 h-4 text-sage rounded border-gray-300 focus:ring-sage"
                  />
                  <span className="text-sm text-gray-600">Include my phone # in the directory</span>
                </label>
              )}
            </div>

            <div className="border-t border-gray-100 pt-5 mt-5">
              <h3 className="text-lg font-bold text-charcoal mb-4">Change Password</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
                  />
                </div>
              </div>
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
            {message && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{message}</div>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-sage text-white font-semibold rounded-lg hover:bg-sage/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
