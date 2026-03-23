import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { useEmailAccounts, emailApi } from '../hooks/useEmail';
import { formatDateTime } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconPlus({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconX({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconTrash({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function IconPencil({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function IconChartBar({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quota bar
// ---------------------------------------------------------------------------

function QuotaBar({ usedMb, quotaMb }) {
  const pct = quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-sage';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{usedMb}/{quotaMb} MB</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Account Modal
// ---------------------------------------------------------------------------

function AccountModal({ account, users, onClose, onSaved }) {
  const { notify } = useNotification();
  const isEdit = !!account;
  const DOMAIN = '@opendoorchristian.church';
  const [form, setForm] = useState({
    address_prefix: account?.address ? account.address.replace(DOMAIN, '') : '',
    display_name: account?.display_name || '',
    user_id: account?.user_id || '',
    quota_mb: account?.quota_mb || 500,
    daily_send_limit: account?.daily_send_limit || 200,
    auto_reply_allowed: account?.auto_reply_allowed || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { address_prefix, ...rest } = form;
      const payload = {
        ...rest,
        address: address_prefix.toLowerCase().trim() + DOMAIN,
        user_id: form.user_id || null,
        quota_mb: parseInt(form.quota_mb) || 500,
        daily_send_limit: parseInt(form.daily_send_limit) || 200,
      };
      if (isEdit) {
        await emailApi.updateAccount(account.id, payload);
        notify('Account updated');
      } else {
        await emailApi.createAccount(payload);
        notify('Account created');
      }
      onSaved();
      onClose();
    } catch (err) {
      notify(err.message || 'Failed to save account', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-charcoal">{isEdit ? 'Edit Account' : 'Create Account'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-charcoal"><IconX /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Email Address *</label>
            <div className="flex items-center gap-0">
              <input
                type="text"
                value={form.address_prefix}
                onChange={e => setForm({ ...form, address_prefix: e.target.value.replace(/[@\s]/g, '') })}
                required
                disabled={isEdit}
                placeholder="pastor"
                className="w-40 border border-gray-200 rounded-l-lg px-4 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span className="bg-gray-50 border border-l-0 border-gray-200 rounded-r-lg px-3 py-2.5 text-sm text-gray-500 whitespace-nowrap">
                @opendoorchristian.church
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
              placeholder="John Smith"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Assign to User</label>
            <select
              value={form.user_id}
              onChange={e => setForm({ ...form, user_id: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
            >
              <option value="">-- Unassigned --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Quota (MB)</label>
              <input
                type="number"
                value={form.quota_mb}
                onChange={e => setForm({ ...form, quota_mb: e.target.value })}
                min="1"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Daily Send Limit</label>
              <input
                type="number"
                value={form.daily_send_limit}
                onChange={e => setForm({ ...form, daily_send_limit: e.target.value })}
                min="1"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
            <input
              type="checkbox"
              checked={form.auto_reply_allowed}
              onChange={e => setForm({ ...form, auto_reply_allowed: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
            />
            Allow auto-reply
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------

function DeleteModal({ account, onClose, onDeleted }) {
  const { notify } = useNotification();
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await emailApi.deleteAccount(account.id);
      notify('Account deleted');
      onDeleted();
      onClose();
    } catch (err) {
      notify(err.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-charcoal mb-3">Delete Email Account</h3>
        <p className="text-sm text-gray-600 mb-2">
          This will permanently delete the account <strong className="text-charcoal">{account.address}</strong> and all its messages, folders, and contacts.
        </p>
        <p className="text-sm text-red-600 mb-4">This action cannot be undone.</p>
        <div className="mb-4">
          <label className="block text-sm text-gray-500 mb-1">Type the email address to confirm:</label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={account.address}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={confirmText !== account.address || deleting}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : 'Delete Account'}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alias Manager (inline per-account)
// ---------------------------------------------------------------------------

function AliasManager({ account, onUpdated }) {
  const { notify } = useNotification();
  const [newAlias, setNewAlias] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newAlias.trim()) return;
    setAdding(true);
    try {
      await emailApi.addAlias(account.id, { alias: newAlias.trim() });
      notify('Alias added');
      setNewAlias('');
      onUpdated();
    } catch (err) {
      notify(err.message || 'Failed to add alias', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (aliasId) => {
    try {
      await emailApi.removeAlias(account.id, aliasId);
      notify('Alias removed');
      onUpdated();
    } catch (err) {
      notify(err.message || 'Failed to remove alias', 'error');
    }
  };

  const aliases = account.aliases || [];

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {aliases.length === 0 && <span className="text-xs text-gray-400">No aliases</span>}
        {aliases.map(a => (
          <span key={a.id || a.alias} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-0.5 text-xs text-charcoal">
            {a.alias || a}
            <button onClick={() => handleRemove(a.id)} className="text-gray-400 hover:text-red-500">
              <IconX className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newAlias}
          onChange={e => setNewAlias(e.target.value)}
          placeholder="new-alias@domain.com"
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs flex-1"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newAlias.trim()}
          className="text-xs text-sage hover:text-sage/80 font-medium disabled:opacity-40"
        >
          {adding ? '...' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Log Tab
// ---------------------------------------------------------------------------

function AuditLogTab({ accounts }) {
  const { notify } = useNotification();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterAccount, setFilterAccount] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const accountId = filterAccount || (accounts.length > 0 ? accounts[0].id : null);
      if (!accountId) { setLogs([]); setLoading(false); return; }
      const params = { page, limit };
      if (filterAction) params.action = filterAction;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await emailApi.getAuditLog(accountId, params);
      setLogs(res.entries || res.logs || []);
      setTotal(res.total || 0);
    } catch (err) {
      notify(err.message || 'Failed to load audit log', 'error');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterAccount, filterAction, dateFrom, dateTo, page, accounts, notify]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const actionTypes = ['login', 'send', 'receive', 'delete', 'forward', 'settings_change', 'alias_add', 'alias_remove'];

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Account</label>
          <select
            value={filterAccount}
            onChange={e => { setFilterAccount(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.address}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action</label>
          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {actionTypes.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sage mx-auto" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-500 text-sm">No audit entries found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Details</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(log.created_at || log.timestamp)}</td>
                  <td className="px-4 py-3 text-xs text-charcoal">{log.account_address || log.account_id || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-charcoal px-2 py-0.5 rounded-full font-medium">
                      {(log.action || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{log.details || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{log.ip_address || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">{total} entries</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-200 rounded-lg text-charcoal hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-200 rounded-lg text-charcoal hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DashboardAdminEmail() {
  const { notify } = useNotification();
  const { accounts, loading: accountsLoading, refetch: refetchAccounts } = useEmailAccounts();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('accounts');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [expandedAliases, setExpandedAliases] = useState(null);

  // Fetch users for assignment dropdown
  useEffect(() => {
    api.get('/users')
      .then(data => setUsers(data.users || data || []))
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, []);

  const handleToggleActive = async (account) => {
    try {
      await emailApi.updateAccount(account.id, { is_active: !account.is_active });
      notify(account.is_active ? 'Account deactivated' : 'Account activated');
      refetchAccounts();
    } catch (err) {
      notify(err.message || 'Failed to update', 'error');
    }
  };

  const handleToggleAutoReply = async (account) => {
    try {
      await emailApi.updateAccount(account.id, { auto_reply_allowed: !account.auto_reply_allowed });
      notify('Auto-reply permission updated');
      refetchAccounts();
    } catch (err) {
      notify(err.message || 'Failed to update', 'error');
    }
  };

  const getUserName = (userId) => {
    if (!userId) return '-';
    const u = users.find(u => String(u.id) === String(userId));
    return u ? u.name : 'Unknown';
  };

  const tabs = [
    { key: 'accounts', label: 'Accounts' },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/dashboard" className="text-sage text-sm hover:underline">Back to Dashboard</Link>
            <h1 className="text-3xl font-bold text-charcoal mt-2">Email Administration</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/admin/email/monitoring"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-charcoal hover:bg-gray-50"
            >
              <IconChartBar className="w-4 h-4" />
              Monitoring
            </Link>
            {activeTab === 'accounts' && (
              <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                <IconPlus className="w-4 h-4" />
                Create Account
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-sage text-white'
                  : 'text-gray-500 hover:text-charcoal hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <>
            {accountsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl">
                <p className="text-gray-500 mb-4">No email accounts configured</p>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">Create First Account</button>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Address</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Display Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Assigned User</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Quota</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-charcoal">Active</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-charcoal">Catch-All</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-charcoal">Auto-Reply</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-charcoal">Send Limit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Aliases</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-charcoal">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accounts.map(account => (
                      <React.Fragment key={account.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-charcoal">{account.address}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{account.display_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{getUserName(account.user_id)}</td>
                          <td className="px-4 py-3">
                            <QuotaBar usedMb={account.used_mb || 0} quotaMb={account.quota_mb || 500} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleToggleActive(account)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                account.is_active ? 'bg-sage' : 'bg-gray-200'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                                account.is_active ? 'translate-x-4' : 'translate-x-0'
                              }`} />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {account.is_catch_all ? (
                              <span className="bg-sage/10 text-sage text-xs font-semibold px-2 py-0.5 rounded-full">Catch-All</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleToggleAutoReply(account)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                account.auto_reply_allowed ? 'bg-sage' : 'bg-gray-200'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                                account.auto_reply_allowed ? 'translate-x-4' : 'translate-x-0'
                              }`} />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {account.daily_send_limit || '-'}/day
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExpandedAliases(expandedAliases === account.id ? null : account.id)}
                              className="text-xs text-sage hover:underline"
                            >
                              {(account.aliases || []).length} alias{(account.aliases || []).length !== 1 ? 'es' : ''}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingAccount(account)}
                                className="text-sage hover:text-sage/80 p-1"
                                title="Edit"
                              >
                                <IconPencil />
                              </button>
                              <button
                                onClick={() => setDeletingAccount(account)}
                                className="text-red-400 hover:text-red-600 p-1"
                                title="Delete"
                              >
                                <IconTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Expanded alias row */}
                        {expandedAliases === account.id && (
                          <tr>
                            <td colSpan={10} className="px-4 py-3 bg-gray-50">
                              <AliasManager account={account} onUpdated={refetchAccounts} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <AuditLogTab accounts={accounts} />
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <AccountModal
          users={users}
          onClose={() => setShowCreateModal(false)}
          onSaved={refetchAccounts}
        />
      )}

      {editingAccount && (
        <AccountModal
          account={editingAccount}
          users={users}
          onClose={() => setEditingAccount(null)}
          onSaved={refetchAccounts}
        />
      )}

      {deletingAccount && (
        <DeleteModal
          account={deletingAccount}
          onClose={() => setDeletingAccount(null)}
          onDeleted={refetchAccounts}
        />
      )}
    </div>
  );
}
