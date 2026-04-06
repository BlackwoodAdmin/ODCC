import React, { useState, useEffect } from 'react';
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
};

export default function DashboardAdminDonations() {
  const { data: summary, loading: summaryLoading } = useFetch('/donations/admin/summary');
  const [donations, setDonations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchList = async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (filterType) params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const res = await api.get(`/donations/admin/list?${params}`);
      setDonations(res.donations);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      // ignore
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, [page, filterType, filterStatus]);

  const handleExportCsv = () => {
    const header = 'Date,Name,Email,Amount,Type,Status,Receipt\n';
    const rows = donations.map(d =>
      `"${formatDate(d.created_at)}","${d.donor_name}","${d.donor_email}","${formatCents(d.amount_cents)}","${d.type}","${d.status}","${d.receipt_number || ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="mb-8">
          <Link to="/dashboard" className="text-sage hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
          <h1 className="text-3xl font-bold text-charcoal">Donation Reports</h1>
        </div>

        {/* Summary cards */}
        {!summaryLoading && summary && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">This Month</p>
              <p className="text-2xl font-bold text-charcoal">{formatCents(summary.thisMonth?.total_cents || 0)}</p>
              <p className="text-xs text-gray-400">{summary.thisMonth?.count || 0} donations</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Last Month</p>
              <p className="text-2xl font-bold text-charcoal">{formatCents(summary.lastMonth?.total_cents || 0)}</p>
              <p className="text-xs text-gray-400">{summary.lastMonth?.count || 0} donations</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">All Time</p>
              <p className="text-2xl font-bold text-charcoal">{formatCents(summary.allTime?.total_cents || 0)}</p>
              <p className="text-xs text-gray-400">{summary.allTime?.count || 0} donations</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Active Recurring</p>
              <p className="text-2xl font-bold text-charcoal">{formatCents(summary.recurring?.mrr_cents || 0)}<span className="text-sm font-normal text-gray-400">/mo equiv</span></p>
              <p className="text-xs text-gray-400">{summary.recurring?.active_count || 0} active</p>
            </div>
          </div>
        )}

        {/* Filters + export */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center gap-3">
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            <option value="one_time">One-Time</option>
            <option value="recurring">Recurring</option>
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="canceled">Canceled</option>
          </select>
          <div className="flex-1"></div>
          <span className="text-sm text-gray-500">{total} total</span>
          <button onClick={handleExportCsv} className="px-4 py-2 bg-sage text-white rounded-lg text-sm font-semibold hover:bg-sage/90">
            Export CSV
          </button>
        </div>

        {/* Donations table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {listLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : donations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No donations found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Donor</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.map(d => (
                    <tr key={d.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 text-charcoal whitespace-nowrap">{formatDate(d.created_at)}</td>
                      <td className="px-4 py-3 text-charcoal font-medium">{d.donor_name}</td>
                      <td className="px-4 py-3 text-gray-500">{d.donor_email}</td>
                      <td className="px-4 py-3 font-semibold text-charcoal">{formatCents(d.amount_cents)}</td>
                      <td className="px-4 py-3 text-gray-600">{d.type === 'recurring' ? 'Recurring' : 'One-time'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${statusColors[d.status] || 'bg-gray-100'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{d.receipt_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}

          {/* Recent donations from summary */}
          {!summaryLoading && summary?.recent?.length > 0 && (
            <div className="border-t p-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Recent Activity</h3>
              <div className="space-y-2">
                {summary.recent.slice(0, 10).map(d => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-charcoal">{d.donor_name}</span>
                      <span className="text-gray-400 ml-2">{formatDate(d.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[d.status] || 'bg-gray-100'}`}>{d.status}</span>
                      <span className="font-semibold text-charcoal">{formatCents(d.amount_cents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
