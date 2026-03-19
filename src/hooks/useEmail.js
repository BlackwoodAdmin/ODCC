import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

export function useEmailAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/email/accounts');
      setAccounts(res.accounts || []);
    } catch { setAccounts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { accounts, loading, refetch: fetch };
}

export function useUserEmailAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/email/my-accounts');
      setAccounts(res.accounts || []);
    } catch { setAccounts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { accounts, loading, refetch: fetch };
}

export function useFolders(accountId) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await api.get(`/email/accounts/${accountId}/folders`);
      setFolders(res.folders || []);
    } catch { setFolders([]); }
    finally { setLoading(false); }
  }, [accountId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { folders, loading, refetch: fetch };
}

export function useMessages(accountId, { folderId, page = 1, limit = 50, search, threaded } = {}) {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      params.set('page', page);
      params.set('limit', limit);
      if (search) params.set('search', search);
      if (threaded) params.set('threaded', 'true');
      const res = await api.get(`/email/accounts/${accountId}/messages?${params}`);
      setMessages(res.messages || []);
      setTotal(res.total || 0);
    } catch { setMessages([]); setTotal(0); }
    finally { setLoading(false); }
  }, [accountId, folderId, page, limit, search, threaded]);

  useEffect(() => { fetch(); }, [fetch]);
  return { messages, total, loading, refetch: fetch };
}

export function useMessage(accountId, messageId) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!accountId || !messageId) return;
    setLoading(true);
    try {
      const res = await api.get(`/email/accounts/${accountId}/messages/${messageId}`);
      setMessage(res.message || null);
    } catch { setMessage(null); }
    finally { setLoading(false); }
  }, [accountId, messageId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { message, loading, refetch: fetch };
}

export function useContacts(accountId, search) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/email/accounts/${accountId}/contacts${params}`);
      setContacts(res.contacts || []);
    } catch { setContacts([]); }
    finally { setLoading(false); }
  }, [accountId, search]);

  useEffect(() => { fetch(); }, [fetch]);
  return { contacts, loading, refetch: fetch };
}

export function useNotifications(accountId, enabled = true) {
  const [notifications, setNotifications] = useState(null);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await api.get(`/email/accounts/${accountId}/notifications`);
      setNotifications(res);
    } catch {}
  }, [accountId]);

  useEffect(() => {
    if (!enabled || !accountId) return;
    fetch();
    intervalRef.current = setInterval(fetch, 60000);
    return () => clearInterval(intervalRef.current);
  }, [fetch, enabled, accountId]);

  return { notifications, refetch: fetch };
}

export function useThread(accountId, threadId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!accountId || !threadId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get(`/email/accounts/${accountId}/threads/${encodeURIComponent(threadId)}`);
      setMessages(res.messages || []);
    } catch { setMessages([]); }
    finally { setLoading(false); }
  }, [accountId, threadId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { messages, loading, refetch: fetch };
}

export const emailApi = {
  // Accounts (admin)
  createAccount: (data) => api.post('/email/accounts', data),
  updateAccount: (id, data) => api.put(`/email/accounts/${id}`, data),
  deleteAccount: (id) => api.delete(`/email/accounts/${id}`),
  getQuota: (id) => api.get(`/email/accounts/${id}/quota`),
  addAlias: (id, data) => api.post(`/email/accounts/${id}/aliases`, data),
  removeAlias: (id, aliasId) => api.delete(`/email/accounts/${id}/aliases/${aliasId}`),

  // Messages
  sendMessage: (accountId, data) => api.post(`/email/accounts/${accountId}/messages`, data),
  updateMessage: (accountId, msgId, data) => api.put(`/email/accounts/${accountId}/messages/${msgId}`, data),
  deleteMessage: (accountId, msgId) => api.delete(`/email/accounts/${accountId}/messages/${msgId}`),
  bulkAction: (accountId, data) => api.post(`/email/accounts/${accountId}/messages/bulk`, data),
  reply: (accountId, msgId, data) => api.post(`/email/accounts/${accountId}/messages/${msgId}/reply`, data),
  replyAll: (accountId, msgId, data) => api.post(`/email/accounts/${accountId}/messages/${msgId}/reply-all`, data),
  forward: (accountId, msgId, data) => api.post(`/email/accounts/${accountId}/messages/${msgId}/forward`, data),
  cancelSend: (accountId, msgId) => api.post(`/email/accounts/${accountId}/messages/${msgId}/cancel-send`),

  // Folders
  createFolder: (accountId, data) => api.post(`/email/accounts/${accountId}/folders`, data),
  updateFolder: (accountId, folderId, data) => api.put(`/email/accounts/${accountId}/folders/${folderId}`, data),
  deleteFolder: (accountId, folderId) => api.delete(`/email/accounts/${accountId}/folders/${folderId}`),

  // Contacts
  addContact: (accountId, data) => api.post(`/email/accounts/${accountId}/contacts`, data),
  updateContact: (accountId, cid, data) => api.put(`/email/accounts/${accountId}/contacts/${cid}`, data),
  deleteContact: (accountId, cid) => api.delete(`/email/accounts/${accountId}/contacts/${cid}`),

  // Auto-reply
  getAutoReply: (accountId) => api.get(`/email/accounts/${accountId}/auto-reply`),
  updateAutoReply: (accountId, data) => api.put(`/email/accounts/${accountId}/auto-reply`, data),

  // Audit (admin)
  getAuditLog: (accountId, params) => api.get(`/email/accounts/${accountId}/audit?${new URLSearchParams(params)}`),

  // Admin logs
  getLogs: (params) => api.get(`/email/admin/logs?${new URLSearchParams(params)}`),
  deleteLogs: (data) => api.delete('/email/admin/logs'),
  deleteLogsPost: (data) => api.post('/email/admin/logs/delete', data),
  getLogsSummary: () => api.get('/email/admin/logs/summary'),
};
