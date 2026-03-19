import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import useNotification from '../hooks/useNotification';
import { emailApi } from '../hooks/useEmail';
import { formatDateTime } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconTrash({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function IconRefresh({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  );
}

function IconChevronDown({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function IconChevronRight({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function IconExclamation({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function IconClock({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconInboxArrowDown({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
    </svg>
  );
}

function IconPaperAirplane({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function IconDatabase({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Level badge
// ---------------------------------------------------------------------------

function LevelBadge({ level }) {
  const colors = {
    error: 'bg-red-50 text-red-700 border-red-200',
    warn: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    debug: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors[level] || colors.info}`}>
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({ icon, label, value, color = 'text-charcoal' }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex items-start gap-4">
      <div className="p-2.5 bg-gray-50 rounded-lg text-gray-400">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation Modal
// ---------------------------------------------------------------------------

function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-charcoal mb-3">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : confirmLabel}
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
// Main Component
// ---------------------------------------------------------------------------

export default function DashboardAdminEmailMonitoring() {
  const { notify } = useNotification();

  // Summary
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Logs
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filters
  const [filterLevel, setFilterLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterSearchInput, setFilterSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Expanded rows
  const [expandedId, setExpandedId] = useState(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef(null);

  // Modals
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Build filter params
  const buildParams = useCallback(() => {
    const params = { page, limit };
    if (filterLevel) params.level = filterLevel;
    if (filterCategory) params.category = filterCategory;
    if (filterSearch) params.search = filterSearch;
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    return params;
  }, [page, limit, filterLevel, filterCategory, filterSearch, dateFrom, dateTo]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const data = await emailApi.getLogsSummary();
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await emailApi.getLogs(buildParams());
      setLogs(data.logs || data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      notify(err.message || 'Failed to load logs', 'error');
      setLogs([]);
      setTotal(0);
    } finally {
      setLogsLoading(false);
    }
  }, [buildParams, notify]);

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchLogs();
  }, [fetchSummary, fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        fetchSummary();
        fetchLogs();
      }, 60000);
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [autoRefresh, fetchSummary, fetchLogs]);

  // Clear selection on filter/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, filterLevel, filterCategory, filterSearch, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === logs.length && logs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map(l => l.id)));
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setFilterSearch(filterSearchInput);
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await emailApi.deleteLogsPost({ logIds: Array.from(selectedIds) });
      notify(`Deleted ${selectedIds.size} log(s)`);
      setSelectedIds(new Set());
      fetchLogs();
      fetchSummary();
    } catch (err) {
      notify(err.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Delete all matching filters
  const handleDeleteAllMatching = async () => {
    setDeleting(true);
    try {
      const params = buildParams();
      delete params.page;
      delete params.limit;
      await emailApi.deleteLogsPost({ deleteAll: true, filters: params });
      notify('Deleted all matching logs');
      setShowDeleteAllModal(false);
      fetchLogs();
      fetchSummary();
    } catch (err) {
      notify(err.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Purge all
  const handlePurgeAll = async () => {
    setDeleting(true);
    try {
      await emailApi.deleteLogsPost({ deleteAll: true });
      notify('All logs purged');
      setShowPurgeModal(false);
      fetchLogs();
      fetchSummary();
    } catch (err) {
      notify(err.message || 'Failed to purge', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Format details JSON
  const formatDetails = (details) => {
    if (!details) return null;
    if (typeof details === 'string') {
      try {
        return JSON.stringify(JSON.parse(details), null, 2);
      } catch {
        return details;
      }
    }
    return JSON.stringify(details, null, 2);
  };

  const levels = ['error', 'warn', 'info', 'debug'];
  const categories = ['inbound', 'outbound', 'auth', 'system', 'delivery', 'spam', 'dns', 'tls'];

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 text-sm">
              <Link to="/dashboard" className="text-sage hover:underline">Dashboard</Link>
              <span className="text-gray-300">/</span>
              <Link to="/dashboard/admin/email" className="text-sage hover:underline">Email Admin</Link>
              <span className="text-gray-300">/</span>
              <span className="text-gray-500">Monitoring</span>
            </div>
            <h1 className="text-3xl font-bold text-charcoal mt-2">Email Monitoring</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  autoRefresh ? 'bg-sage' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  autoRefresh ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
              Auto-refresh
            </label>
            {/* Manual refresh */}
            <button
              onClick={() => { fetchSummary(); fetchLogs(); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-charcoal hover:bg-gray-50"
            >
              <IconRefresh className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {summaryLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-20 mb-2" />
                <div className="h-7 bg-gray-100 rounded w-12" />
              </div>
            ))
          ) : (
            <>
              <SummaryCard
                icon={<IconExclamation className="w-5 h-5" />}
                label="Errors (24h)"
                value={summary?.errorCount24h ?? 0}
                color={summary?.errorCount24h > 0 ? 'text-red-600' : 'text-charcoal'}
              />
              <SummaryCard
                icon={<IconExclamation className="w-5 h-5" />}
                label="Warnings (24h)"
                value={summary?.warnCount24h ?? 0}
                color={summary?.warnCount24h > 0 ? 'text-yellow-600' : 'text-charcoal'}
              />
              <SummaryCard
                icon={<IconInboxArrowDown className="w-5 h-5" />}
                label="Last Inbound"
                value={summary?.last_inbound ? formatDateTime(summary.lastInbound) : 'None'}
              />
              <SummaryCard
                icon={<IconPaperAirplane className="w-5 h-5" />}
                label="Last Outbound"
                value={summary?.last_outbound ? formatDateTime(summary.lastOutbound) : 'None'}
              />
              <SummaryCard
                icon={<IconDatabase className="w-5 h-5" />}
                label="Total Logs"
                value={summary?.totalLogs ?? 0}
              />
            </>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Level</label>
              <select
                value={filterLevel}
                onChange={e => { setFilterLevel(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[120px]"
              >
                <option value="">All levels</option>
                {levels.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[120px]"
              >
                <option value="">All categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
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
            <form onSubmit={handleSearch} className="flex items-end gap-2 flex-1 min-w-[200px]">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Search</label>
                <input
                  type="text"
                  value={filterSearchInput}
                  onChange={e => setFilterSearchInput(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-sage/10 text-sage rounded-lg text-sm font-medium hover:bg-sage/20">
                Search
              </button>
            </form>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
                >
                  <IconTrash className="w-4 h-4" />
                  Delete Selected
                </button>
              </>
            )}
            <button
              onClick={() => setShowDeleteAllModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              Delete All Matching
            </button>
            <button
              onClick={() => setShowPurgeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              Purge All
            </button>
          </div>
          <span className="text-sm text-gray-400">
            {total} total log{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Log table */}
        {logsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sage mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl">
            <p className="text-gray-500 text-sm">No logs found matching your filters</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === logs.length && logs.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
                    />
                  </th>
                  <th className="w-8 px-1 py-3" />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Level</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => {
                  const isExpanded = expandedId === log.id;
                  const hasDetails = log.details || log.metadata || log.stack_trace;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(log.id)}
                            onChange={() => toggleSelect(log.id)}
                            className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
                          />
                        </td>
                        <td className="px-1 py-3">
                          {hasDetails && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              className="text-gray-400 hover:text-charcoal p-0.5"
                            >
                              {isExpanded ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(log.timestamp || log.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <LevelBadge level={log.level} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-charcoal px-2 py-0.5 rounded-full font-medium">
                            {log.category || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-charcoal max-w-md">
                          <span className="line-clamp-2">{log.message || '-'}</span>
                        </td>
                      </tr>
                      {/* Expanded details row */}
                      {isExpanded && hasDetails && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3 bg-gray-50">
                            <div className="max-w-full overflow-x-auto">
                              <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-4 whitespace-pre-wrap font-mono leading-relaxed">
                                {formatDetails(log.details || log.metadata || log.stack_trace)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-gray-500">
              {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 border border-gray-200 rounded-lg text-charcoal hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-200 rounded-lg text-charcoal hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete All Matching Modal */}
      {showDeleteAllModal && (
        <ConfirmModal
          title="Delete All Matching Logs"
          message={`This will permanently delete all logs matching your current filters (${total} log${total !== 1 ? 's' : ''}). This cannot be undone.`}
          confirmLabel="Delete All Matching"
          loading={deleting}
          onConfirm={handleDeleteAllMatching}
          onClose={() => setShowDeleteAllModal(false)}
        />
      )}

      {/* Purge All Modal */}
      {showPurgeModal && (
        <ConfirmModal
          title="Purge All Logs"
          message="This will permanently delete ALL email system logs regardless of filters. This cannot be undone."
          confirmLabel="Purge Everything"
          loading={deleting}
          onConfirm={handlePurgeAll}
          onClose={() => setShowPurgeModal(false)}
        />
      )}
    </div>
  );
}
