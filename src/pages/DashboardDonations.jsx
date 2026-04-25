import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import api from '../services/api';

function formatCents(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function formatDate(ts) {
  return new Date(Number(ts)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const statusColors = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-600',
  canceled: 'bg-gray-100 text-gray-500',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-red-100 text-red-700',
  incomplete: 'bg-yellow-100 text-yellow-700',
};

export default function DashboardDonations() {
  const { data, loading, error, refetch } = useFetch('/donations/my-donations');
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const handleDownloadReceipt = async (donation) => {
    setDownloadingId(donation.id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/donations/receipt/${donation.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${donation.receipt_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to download receipt');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCancelPending = async (donationId) => {
    if (!confirm('Cancel this pending donation?')) return;
    setCancelingId(donationId);
    try {
      await api.delete(`/donations/cancel-pending/${donationId}`);
      refetch();
    } catch (err) {
      alert(err.message || 'Failed to cancel donation');
    } finally {
      setCancelingId(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await api.post('/donations/customer-portal');
      window.location.href = res.url;
    } catch (err) {
      alert(err.message || 'Failed to open subscription management');
      setPortalLoading(false);
    }
  };

  if (loading) return <div className="section-padding bg-cream"><div className="container-custom"><p className="text-gray-500">Loading...</p></div></div>;
  if (error) return <div className="section-padding bg-cream"><div className="container-custom"><p className="text-red-600">Error: {error}</p></div></div>;

  const { donations = [], subscriptions = [], summary = {} } = data || {};
  const activeSubscriptions = subscriptions.filter(s => ['active', 'past_due'].includes(s.status));

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="mb-8">
          <Link to="/dashboard" className="text-sage hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
          <h1 className="text-3xl font-bold text-charcoal">My Donations</h1>
        </div>

        {/* Summary cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Total Given</p>
            <p className="text-2xl font-bold text-charcoal">{formatCents(summary.total_cents || 0)}</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Donations</p>
            <p className="text-2xl font-bold text-charcoal">{summary.total_count || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Active Recurring</p>
            <p className="text-2xl font-bold text-charcoal">{activeSubscriptions.length}</p>
          </div>
        </div>

        {/* Active subscriptions */}
        {activeSubscriptions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h2 className="text-lg font-bold text-charcoal mb-4">Active Recurring Donations</h2>
            {activeSubscriptions.map(sub => (
              <div key={sub.id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <p className="font-semibold text-charcoal">{formatCents(sub.amount_cents)}/{sub.interval === 'week' ? 'week' : 'month'}</p>
                  <p className="text-sm text-gray-500">Since {formatDate(sub.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${statusColors[sub.status] || 'bg-gray-100'}`}>
                    {sub.status}
                  </span>
                </div>
              </div>
            ))}
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="mt-4 px-4 py-2 bg-sage text-white rounded-lg font-semibold text-sm hover:bg-sage/90 transition-colors disabled:opacity-50"
            >
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </button>
          </div>
        )}

        {/* Donation history */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-charcoal">Donation History</h2>
          </div>
          {donations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No donations yet.</p>
              <Link to="/give" className="text-sage font-semibold hover:underline mt-2 inline-block">Make your first gift</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-gray-500 font-medium">Date</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-medium">Amount</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-medium">Type</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.map(d => (
                    <tr key={d.id} className="border-t hover:bg-gray-50">
                      <td className="px-6 py-3 text-charcoal">{formatDate(d.created_at)}</td>
                      <td className="px-6 py-3 font-semibold text-charcoal">{formatCents(d.amount_cents)}</td>
                      <td className="px-6 py-3 text-gray-600">{d.type === 'recurring' ? 'Recurring' : 'One-time'}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${statusColors[d.status] || 'bg-gray-100'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {d.status === 'pending' ? (
                          <button
                            onClick={() => handleCancelPending(d.id)}
                            disabled={cancelingId === d.id}
                            className="text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-50"
                          >
                            {cancelingId === d.id ? 'Canceling...' : 'Cancel'}
                          </button>
                        ) : d.receipt_number && d.status === 'completed' ? (
                          <button
                            onClick={() => handleDownloadReceipt(d)}
                            disabled={downloadingId === d.id}
                            className="text-sage hover:underline font-mono disabled:opacity-50"
                            title="Download PDF receipt"
                          >
                            {downloadingId === d.id ? 'Downloading...' : d.receipt_number}
                          </button>
                        ) : (
                          d.receipt_number || '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
