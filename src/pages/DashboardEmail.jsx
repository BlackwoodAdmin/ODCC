import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';
import {
  useUserEmailAccounts,
  useFolders,
  useMessages,
  useMessage,
  useThread,
  useContacts,
  useNotifications as useEmailNotifications,
  emailApi,
} from '../hooks/useEmail';

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

function parseAddrs(raw) {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch { return []; }
}

function fmtAddr(a) {
  if (typeof a === 'string') return a;
  if (a?.name && a?.address) return `${a.name} <${a.address}>`;
  return a?.address || a?.email || '';
}

function fmtAddrs(raw) {
  return parseAddrs(raw).map(fmtAddr).filter(Boolean).join(', ') || '';
}

function addrOnly(a) {
  if (typeof a === 'string') return a;
  return a?.address || a?.email || '';
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function IconInbox({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
    </svg>
  );
}

function IconSend({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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

function IconArchive({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function IconStar({ className = 'w-5 h-5', filled }) {
  return filled ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
    </svg>
  ) : (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function IconPaperclip({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function IconReply({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function IconForward({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
    </svg>
  );
}

function IconSearch({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
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

function IconX({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconCog({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconFolder({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function IconPlus({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconDownload({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function folderIcon(folderType) {
  switch (folderType) {
    case 'inbox': return <IconInbox className="w-4 h-4" />;
    case 'sent': return <IconSend className="w-4 h-4" />;
    case 'drafts': return <IconFolder className="w-4 h-4" />;
    case 'trash': return <IconTrash className="w-4 h-4" />;
    case 'archive': return <IconArchive className="w-4 h-4" />;
    default: return <IconFolder className="w-4 h-4" />;
  }
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parsed = typeof dateStr === 'string' && /^\d+$/.test(dateStr) ? parseInt(dateStr) : dateStr;
  const d = new Date(parsed);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const thisYear = d.getFullYear() === now.getFullYear();
  if (thisYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sage" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose Overlay
// ---------------------------------------------------------------------------

function ComposeOverlay({ accountId, accounts, onClose, onSent, prefill }) {
  const { notify } = useNotification();
  const [to, setTo] = useState(prefill?.to || '');
  const [cc, setCc] = useState(prefill?.cc || '');
  const [bcc, setBcc] = useState(prefill?.bcc || '');
  const [showCc, setShowCc] = useState(!!(prefill?.cc));
  const [showBcc, setShowBcc] = useState(!!(prefill?.bcc));
  const [subject, setSubject] = useState(prefill?.subject || '');
  const [body, setBody] = useState(prefill?.body || '');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [activeField, setActiveField] = useState(null);
  const fileInputRef = useRef(null);

  const { contacts } = useContacts(accountId, contactSearch);

  // Find the account to get signature
  const account = accounts.find(a => String(a.id) === String(accountId));
  const signature = account?.signature || '';

  // Auto-append signature for new messages (not replies/forwards which already have prefill body)
  useEffect(() => {
    if (!prefill?.body && signature && !body) {
      setBody('\n\n--\n' + signature);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const parseRecipients = (str) =>
    str.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean).map(address => ({ address }));

  const textToHtml = (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  };

  const handleSend = async () => {
    if (!to.trim()) {
      notify('Please enter a recipient', 'error');
      return;
    }
    setSending(true);
    try {
      const payload = {
        to: parseRecipients(to),
        cc: cc ? parseRecipients(cc) : [],
        bcc: bcc ? parseRecipients(bcc) : [],
        subject,
        body_html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${textToHtml(body)}</div>`,
        body_text: body,
      };

      let result;
      if (prefill?.replyToId && prefill?.mode === 'reply') {
        result = await emailApi.reply(accountId, prefill.replyToId, payload);
      } else if (prefill?.replyToId && prefill?.mode === 'reply-all') {
        result = await emailApi.replyAll(accountId, prefill.replyToId, payload);
      } else if (prefill?.replyToId && prefill?.mode === 'forward') {
        result = await emailApi.forward(accountId, prefill.replyToId, { ...payload, forwardTo: payload.to, forwardCc: payload.cc });
      } else {
        result = await emailApi.sendMessage(accountId, payload);
      }

      onSent(result);
      onClose();
    } catch (err) {
      notify(err.message || 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await emailApi.sendMessage(accountId, {
        to: to ? parseRecipients(to) : [],
        cc: cc ? parseRecipients(cc) : [],
        bcc: bcc ? parseRecipients(bcc) : [],
        subject,
        body_html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${textToHtml(body)}</div>`,
        body_text: body,
        draft: true,
      });
      notify('Draft saved');
      onClose();
    } catch (err) {
      notify(err.message || 'Failed to save draft', 'error');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const filteredContacts = contactSearch.length >= 2 ? contacts : [];

  const selectContact = (email) => {
    if (activeField === 'to') {
      setTo(prev => (prev ? prev + ', ' + email : email));
    } else if (activeField === 'cc') {
      setCc(prev => (prev ? prev + ', ' + email : email));
    } else if (activeField === 'bcc') {
      setBcc(prev => (prev ? prev + ', ' + email : email));
    }
    setContactSearch('');
    setActiveField(null);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center sm:items-center">
      <div className="bg-white w-full max-w-2xl rounded-t-xl sm:rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-charcoal">
            {prefill?.mode === 'reply' ? 'Reply' : prefill?.mode === 'reply-all' ? 'Reply All' : prefill?.mode === 'forward' ? 'Forward' : 'New Message'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-charcoal">
            <IconX />
          </button>
        </div>

        {/* Fields */}
        <div className="px-6 py-3 space-y-2 border-b border-gray-100 relative">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 w-10">To</label>
            <input
              type="text"
              value={to}
              onChange={e => { setTo(e.target.value); setContactSearch(e.target.value.split(',').pop().trim()); setActiveField('to'); }}
              onFocus={() => setActiveField('to')}
              className="flex-1 border-0 outline-none text-sm text-charcoal py-1"
              placeholder="recipient@example.com"
            />
            <div className="flex gap-2 text-xs text-sage">
              {!showCc && <button onClick={() => setShowCc(true)}>CC</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)}>BCC</button>}
            </div>
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-10">CC</label>
              <input
                type="text"
                value={cc}
                onChange={e => { setCc(e.target.value); setContactSearch(e.target.value.split(',').pop().trim()); setActiveField('cc'); }}
                onFocus={() => setActiveField('cc')}
                className="flex-1 border-0 outline-none text-sm text-charcoal py-1"
              />
            </div>
          )}
          {showBcc && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-10">BCC</label>
              <input
                type="text"
                value={bcc}
                onChange={e => { setBcc(e.target.value); setContactSearch(e.target.value.split(',').pop().trim()); setActiveField('bcc'); }}
                onFocus={() => setActiveField('bcc')}
                className="flex-1 border-0 outline-none text-sm text-charcoal py-1"
              />
            </div>
          )}

          {/* Contact autocomplete dropdown */}
          {filteredContacts.length > 0 && activeField && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
              {filteredContacts.map(c => (
                <button
                  key={c.id || c.email}
                  onClick={() => selectContact(c.email)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                >
                  <span className="font-medium text-charcoal">{c.name || c.email}</span>
                  {c.name && <span className="text-gray-400 ml-2">{c.email}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 w-10">Subj</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="flex-1 border-0 outline-none text-sm text-charcoal py-1"
              placeholder="Subject"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={12}
            className="w-full border-0 outline-none text-sm text-charcoal resize-none leading-relaxed"
            placeholder="Write your message..."
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-6 pb-2 flex flex-wrap gap-2">
            {attachments.map((f, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-xs text-charcoal">
                <IconPaperclip className="w-3 h-3" />
                {f.name}
                <button onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-500 ml-1">
                  <IconX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <button onClick={handleSend} disabled={sending} className="btn-primary text-sm px-6 py-2 disabled:opacity-50">
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button onClick={handleSaveDraft} className="text-sm text-gray-500 hover:text-charcoal px-3 py-2">
              Save Draft
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-charcoal p-2" title="Attach files">
              <IconPaperclip className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-2" title="Discard">
              <IconTrash className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Viewer Panel
// ---------------------------------------------------------------------------

function ThreadViewer({ accountId, threadId, threadMessages, threadLoading, onClose, onCompose, onRefresh, formatDateTime }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Auto-expand the latest message
  useEffect(() => {
    if (threadMessages.length > 0) {
      setExpandedIds(new Set([threadMessages[threadMessages.length - 1].id]));
    }
  }, [threadMessages]);

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const latestMsg = threadMessages[threadMessages.length - 1];

  const handleReply = (msg) => {
    onCompose({
      mode: 'reply',
      replyToId: msg.id,
      to: msg.from_address || '',
      subject: msg.subject?.startsWith('Re:') ? msg.subject : 'Re: ' + (msg.subject || ''),
      body: '\n\n--- Original Message ---\nFrom: ' + (msg.from_address || '') + '\nDate: ' + formatDateTime(msg.sent_at || msg.received_at || msg.created_at) + '\n\n' + (msg.body_text || ''),
    });
  };

  if (threadLoading) return <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Loading thread...</p></div>;
  if (threadMessages.length === 0) return <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Thread not found</p></div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="text-gray-400 hover:text-charcoal">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-lg font-semibold text-charcoal truncate">{latestMsg?.subject || '(no subject)'}</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{threadMessages.length} messages</span>
        </div>
        {latestMsg && (
          <button
            onClick={() => handleReply(latestMsg)}
            className="btn-primary text-sm px-4 py-1.5"
          >
            Reply
          </button>
        )}
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {threadMessages.map((msg, i) => {
          const isExpanded = expandedIds.has(msg.id);
          const isLast = i === threadMessages.length - 1;
          return (
            <div key={msg.id} className={`border rounded-lg ${isExpanded ? 'border-gray-200' : 'border-gray-100'}`}>
              {/* Collapsed header - always visible */}
              <div
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'border-b border-gray-100' : ''}`}
                onClick={() => toggleExpand(msg.id)}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${msg.direction === 'outbound' ? 'bg-sage/20 text-sage' : 'bg-blue-50 text-blue-600'}`}>
                  {(msg.from_name || msg.from_address || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${!msg.is_read ? 'font-semibold text-charcoal' : 'text-gray-700'}`}>
                    {msg.direction === 'outbound' ? 'Me' : (msg.from_name || msg.from_address || 'Unknown')}
                  </span>
                  {!isExpanded && msg.body_text && (
                    <span className="text-sm text-gray-400 ml-2 truncate">
                      — {msg.body_text.substring(0, 100)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {formatDateTime(msg.sent_at || msg.received_at || msg.created_at)}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-4 py-4">
                  <div className="text-xs text-gray-500 mb-3">
                    <span>From: {msg.from_name ? `${msg.from_name} <${msg.from_address}>` : msg.from_address}</span>
                    {msg.to_addresses && (
                      <span className="ml-4">To: {fmtAddrs(msg.to_addresses)}</span>
                    )}
                  </div>
                  {msg.body_html ? (
                    <iframe
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={`<base target="_blank"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;margin:0;}</style>${msg.body_html}`}
                      title="Message content"
                      className="w-full border-0"
                      style={{ minHeight: '100px' }}
                      onLoad={(e) => { try { e.target.style.height = e.target.contentDocument.body.scrollHeight + 'px'; } catch {} }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-charcoal font-sans leading-relaxed">{msg.body_text || ''}</pre>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => handleReply(msg)} className="text-xs text-sage hover:text-sage/80 font-medium">Reply</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MessageViewer({ accountId, messageId, onClose, onCompose, onRefresh }) {
  const { notify } = useNotification();
  const { message, loading } = useMessage(accountId, messageId);

  const handleStar = async () => {
    if (!message) return;
    try {
      await emailApi.updateMessage(accountId, messageId, { starred: !message.starred });
      onRefresh();
    } catch (err) {
      notify(err.message || 'Failed to update', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Move this message to trash?')) return;
    try {
      await emailApi.deleteMessage(accountId, messageId);
      notify('Message deleted');
      onClose();
      onRefresh();
    } catch (err) {
      notify(err.message || 'Failed to delete', 'error');
    }
  };

  const handleArchive = async () => {
    try {
      await emailApi.updateMessage(accountId, messageId, { action: 'archive' });
      notify('Archived');
      onClose();
      onRefresh();
    } catch (err) {
      notify(err.message || 'Failed to archive', 'error');
    }
  };

  const handleReply = () => {
    if (!message) return;
    onCompose({
      mode: 'reply',
      replyToId: messageId,
      to: message.from_address || '',
      subject: message.subject?.startsWith('Re:') ? message.subject : 'Re: ' + (message.subject || ''),
      body: '\n\n--- Original Message ---\nFrom: ' + (message.from_address || '') + '\nDate: ' + formatDateTime(message.sent_at || message.received_at || message.created_at) + '\n\n' + (message.body_text || ''),
    });
  };

  const handleReplyAll = () => {
    if (!message) return;
    const allRecipients = [message.from_address, ...parseAddrs(message.to_addresses).map(addrOnly)].filter(Boolean).join(', ');
    onCompose({
      mode: 'reply-all',
      replyToId: messageId,
      to: allRecipients,
      cc: parseAddrs(message.cc_addresses).map(addrOnly).filter(Boolean).join(', '),
      subject: message.subject?.startsWith('Re:') ? message.subject : 'Re: ' + (message.subject || ''),
      body: '\n\n--- Original Message ---\nFrom: ' + (message.from_address || '') + '\nDate: ' + formatDateTime(message.sent_at || message.received_at || message.created_at) + '\n\n' + (message.body_text || ''),
    });
  };

  const handleForward = () => {
    if (!message) return;
    onCompose({
      mode: 'forward',
      replyToId: messageId,
      to: '',
      subject: message.subject?.startsWith('Fwd:') ? message.subject : 'Fwd: ' + (message.subject || ''),
      body: '\n\n--- Forwarded Message ---\nFrom: ' + (message.from_address || '') + '\nDate: ' + formatDateTime(message.sent_at || message.received_at || message.created_at) + '\nSubject: ' + (message.subject || '') + '\n\n' + (message.body_text || ''),
    });
  };

  if (loading) return <Spinner />;
  if (!message) return <div className="p-8 text-center text-gray-500">Message not found</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Message header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="text-sage hover:underline text-sm">Back to list</button>
          <div className="flex items-center gap-2">
            <button onClick={handleStar} className={message.starred ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'} title="Star">
              <IconStar className="w-5 h-5" filled={message.starred} />
            </button>
            <button onClick={handleArchive} className="text-gray-400 hover:text-charcoal" title="Archive">
              <IconArchive className="w-5 h-5" />
            </button>
            <button onClick={handleDelete} className="text-gray-400 hover:text-red-500" title="Delete">
              <IconTrash className="w-5 h-5" />
            </button>
          </div>
        </div>
        <h2 className="text-xl font-semibold text-charcoal mb-2">{message.subject || '(no subject)'}</h2>
        <div className="text-sm text-gray-500 space-y-1">
          <div><span className="font-medium text-charcoal">From:</span> {message.from_name ? `${message.from_name} <${message.from_address}>` : message.from_address}</div>
          <div><span className="font-medium text-charcoal">To:</span> {fmtAddrs(message.to_addresses)}</div>
          {parseAddrs(message.cc_addresses).length > 0 && (
            <div><span className="font-medium text-charcoal">CC:</span> {fmtAddrs(message.cc_addresses)}</div>
          )}
          <div><span className="font-medium text-charcoal">Date:</span> {formatDateTime(message.sent_at || message.received_at || message.created_at)}</div>
        </div>
      </div>

      {/* Message body */}
      <div className="flex-1 overflow-auto p-6">
        {message.body_html ? (
          <iframe
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={`<base target="_blank">${message.body_html}`}
            title="Email content"
            className="w-full border-0 min-h-[300px]"
            style={{ height: '100%' }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-charcoal font-sans leading-relaxed">{message.body_text || ''}</pre>
        )}
      </div>

      {/* Attachments */}
      {message.attachments?.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">Attachments ({message.attachments.length})</p>
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att, idx) => (
              <a
                key={idx}
                href={att.url || '#'}
                download={att.filename}
                className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-xs text-charcoal"
              >
                <IconDownload className="w-3.5 h-3.5 text-sage" />
                <span>{att.filename}</span>
                {att.size && <span className="text-gray-400">({Math.round(att.size / 1024)}KB)</span>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Reply actions */}
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
        <button onClick={handleReply} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-charcoal hover:bg-gray-50">
          <IconReply className="w-4 h-4" /> Reply
        </button>
        <button onClick={handleReplyAll} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-charcoal hover:bg-gray-50">
          <IconReply className="w-4 h-4" /> Reply All
        </button>
        <button onClick={handleForward} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-charcoal hover:bg-gray-50">
          <IconForward className="w-4 h-4" /> Forward
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Settings Panel
// ---------------------------------------------------------------------------

function AccountSettings({ accountId, account, onClose, onUpdated }) {
  const { notify } = useNotification();
  const [forwarding, setForwarding] = useState(account?.forwarding_address || '');
  const [forwardMode, setForwardMode] = useState(account?.forwarding_mode || 'none');
  const [sig, setSig] = useState(account?.signature || '');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplySubject, setAutoReplySubject] = useState('');
  const [autoReplyBody, setAutoReplyBody] = useState('');
  const [autoReplyStart, setAutoReplyStart] = useState('');
  const [autoReplyEnd, setAutoReplyEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingAR, setLoadingAR] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    emailApi.getAutoReply(accountId)
      .then(data => {
        if (data) {
          setAutoReplyEnabled(data.enabled || false);
          setAutoReplySubject(data.subject || '');
          setAutoReplyBody(data.body || '');
          setAutoReplyStart(data.start_date || '');
          setAutoReplyEnd(data.end_date || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAR(false));
  }, [accountId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update forwarding and signature
      await emailApi.updateAccount(accountId, {
        forwarding_address: forwarding || null,
        forwarding_mode: forwardMode,
        signature: sig,
      });

      // Update auto-reply if allowed
      if (account?.auto_reply_allowed) {
        await emailApi.updateAutoReply(accountId, {
          enabled: autoReplyEnabled,
          subject: autoReplySubject,
          body: autoReplyBody,
          start_date: autoReplyStart || null,
          end_date: autoReplyEnd || null,
        });
      }

      notify('Settings saved');
      onUpdated();
    } catch (err) {
      notify(err.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-charcoal">Account Settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-charcoal">
          <IconX />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Forwarding */}
        <div>
          <h4 className="text-sm font-semibold text-charcoal mb-3">Forwarding</h4>
          <div className="space-y-3">
            <input
              type="email"
              value={forwarding}
              onChange={e => setForwarding(e.target.value)}
              placeholder="Forward to address"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
            />
            <div className="flex gap-4">
              {['none', 'copy', 'forward_only'].map(mode => (
                <label key={mode} className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
                  <input
                    type="radio"
                    name="forwardMode"
                    value={mode}
                    checked={forwardMode === mode}
                    onChange={() => setForwardMode(mode)}
                    className="text-sage focus:ring-sage"
                  />
                  {mode === 'none' ? 'Disabled' : mode === 'copy' ? 'Keep copy' : 'Forward only'}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Signature */}
        <div>
          <h4 className="text-sm font-semibold text-charcoal mb-3">Signature</h4>
          <textarea
            value={sig}
            onChange={e => setSig(e.target.value)}
            rows={5}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm resize-none"
            placeholder="Your email signature (HTML supported)"
          />
        </div>

        {/* Auto-reply */}
        {account?.auto_reply_allowed && (
          <div>
            <h4 className="text-sm font-semibold text-charcoal mb-3">Auto-Reply</h4>
            {loadingAR ? (
              <div className="text-sm text-gray-400">Loading...</div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoReplyEnabled}
                    onChange={e => setAutoReplyEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
                  />
                  Enable auto-reply
                </label>
                {autoReplyEnabled && (
                  <>
                    <input
                      type="text"
                      value={autoReplySubject}
                      onChange={e => setAutoReplySubject(e.target.value)}
                      placeholder="Auto-reply subject"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
                    />
                    <textarea
                      value={autoReplyBody}
                      onChange={e => setAutoReplyBody(e.target.value)}
                      rows={4}
                      placeholder="Auto-reply message body"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm resize-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Start date</label>
                        <input
                          type="date"
                          value={autoReplyStart}
                          onChange={e => setAutoReplyStart(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">End date</label>
                        <input
                          type="date"
                          value={autoReplyEnd}
                          onChange={e => setAutoReplyEnd(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-6 py-2 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Undo Send Toast
// ---------------------------------------------------------------------------

function UndoSendToast({ messageResult, accountId, onDismiss }) {
  const { notify } = useNotification();
  const [countdown, setCountdown] = useState(10);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [onDismiss]);

  const handleUndo = async () => {
    clearInterval(timerRef.current);
    try {
      await emailApi.cancelSend(accountId, messageResult.messageId || messageResult.id);
      notify('Send cancelled');
    } catch (err) {
      notify(err.message || 'Could not cancel send', 'error');
    }
    onDismiss();
  };

  return (
    <div className="fixed bottom-6 right-6 bg-charcoal text-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4 z-50">
      <span className="text-sm">Message sent</span>
      <span className="text-xs text-gray-300">{countdown}s</span>
      <button onClick={handleUndo} className="text-sm font-semibold text-sage hover:text-white underline">
        Undo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Email Dashboard
// ---------------------------------------------------------------------------

export default function DashboardEmail() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const { accountId: paramAccountId } = useParams();

  // Accounts
  const { accounts, loading: accountsLoading, refetch: refetchAccounts } = useUserEmailAccounts();

  // Determine active account
  const accountId = paramAccountId || (accounts.length > 0 ? String(accounts[0].id) : null);

  // Redirect to first account if none specified
  useEffect(() => {
    if (!paramAccountId && accounts.length > 0 && !accountsLoading) {
      navigate(`/dashboard/email/${accounts[0].id}`, { replace: true });
    }
  }, [paramAccountId, accounts, accountsLoading, navigate]);

  // Folders
  const { folders, loading: foldersLoading, refetch: refetchFolders } = useFolders(accountId);

  // Message list state
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Auto-select inbox folder
  useEffect(() => {
    if (folders.length > 0 && !selectedFolderId) {
      const inbox = folders.find(f => f.type === 'inbox' || f.name?.toLowerCase() === 'inbox');
      setSelectedFolderId(inbox ? inbox.id : folders[0].id);
    }
  }, [folders, selectedFolderId]);

  // Reset folder selection when account changes
  useEffect(() => {
    setSelectedFolderId(null);
    setPage(1);
    setSearchQuery('');
    setSearchInput('');
  }, [accountId]);

  // Determine current folder type for threading
  const currentFolder = folders.find(f => f.id === selectedFolderId);
  const isThreadableFolder = !currentFolder || ['inbox', 'sent', 'archive'].includes(currentFolder?.type);

  // Messages
  const { messages, total, loading: messagesLoading, refetch: refetchMessages } = useMessages(accountId, {
    folderId: selectedFolderId,
    page,
    limit,
    search: searchQuery || undefined,
    threaded: isThreadableFolder,
  });

  // Notifications polling
  useEmailNotifications(accountId, true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewingMessageId, setViewingMessageId] = useState(null);
  const [viewingThreadId, setViewingThreadId] = useState(null);
  const [composePrefill, setComposePrefill] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [undoToast, setUndoToast] = useState(null);
  const [moveFolderDropdown, setMoveFolderDropdown] = useState(false);

  // Thread messages
  const { messages: threadMessages, loading: threadLoading, refetch: refetchThread } = useThread(accountId, viewingThreadId);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Clear selections on list change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedFolderId, page, searchQuery]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map(m => m.id)));
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  // Bulk actions
  const handleBulkAction = async (action, extra) => {
    if (selectedIds.size === 0) return;
    try {
      await emailApi.bulkAction(accountId, {
        messageIds: Array.from(selectedIds),
        action,
        ...extra,
      });
      notify(`${action} applied to ${selectedIds.size} message(s)`);
      setSelectedIds(new Set());
      refetchMessages();
      refetchFolders();
    } catch (err) {
      notify(err.message || 'Bulk action failed', 'error');
    }
  };

  const handleStarToggle = async (msg) => {
    try {
      await emailApi.updateMessage(accountId, msg.id, { starred: !msg.starred });
      refetchMessages();
    } catch (err) {
      notify(err.message || 'Failed to update', 'error');
    }
  };

  const openCompose = (prefill = null) => {
    setComposePrefill(prefill);
    setShowCompose(true);
  };

  const handleSent = (result) => {
    notify('Message sent');
    refetchMessages();
    refetchFolders();
    if (result?.messageId || result?.id) {
      setUndoToast(result);
    }
  };

  const activeAccount = accounts.find(a => String(a.id) === String(accountId));

  if (accountsLoading) {
    return (
      <div className="section-padding bg-cream">
        <div className="container-custom">
          <Spinner />
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="section-padding bg-cream">
        <div className="container-custom">
          <Link to="/dashboard" className="text-sage text-sm hover:underline">Back to Dashboard</Link>
          <div className="text-center py-16">
            <IconInbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-charcoal mb-2">No Email Accounts</h2>
            <p className="text-gray-500">You do not have any email accounts assigned. Contact your administrator.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-padding bg-cream min-h-screen">
      <div className="container-custom">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link to="/dashboard" className="text-sage text-sm hover:underline">Back to Dashboard</Link>
            <h1 className="text-2xl font-bold text-charcoal mt-1">Email</h1>
          </div>
        </div>

        <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
          {/* ===================== LEFT SIDEBAR ===================== */}
          <div className="w-64 flex-shrink-0">
            {/* Compose */}
            <button
              onClick={() => openCompose()}
              className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
            >
              <IconPlus className="w-4 h-4" />
              Compose
            </button>

            {/* Account selector */}
            {accounts.length > 1 && (
              <div className="mb-4">
                <select
                  value={accountId || ''}
                  onChange={e => navigate(`/dashboard/email/${e.target.value}`)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-charcoal"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.address}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Folders */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Folders</span>
              </div>
              {foldersLoading ? (
                <div className="p-4">
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-6 bg-gray-100 rounded" />)}
                  </div>
                </div>
              ) : (
                <nav className="py-1">
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => { setSelectedFolderId(folder.id); setPage(1); setViewingMessageId(null); setViewingThreadId(null); refetchMessages(); refetchFolders(); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        selectedFolderId === folder.id
                          ? 'bg-sage/10 text-sage font-medium'
                          : 'text-charcoal hover:bg-gray-50'
                      }`}
                    >
                      {folderIcon(folder.type || folder.name?.toLowerCase())}
                      <span className="flex-1 text-left truncate">{folder.name}</span>
                      {folder.unread_count > 0 && (
                        <span className="bg-sage text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                          {folder.unread_count}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              )}
            </div>

            {/* Settings link */}
            <button
              onClick={() => { setShowSettings(true); setViewingMessageId(null); }}
              className="w-full flex items-center gap-2 text-sm text-gray-500 hover:text-charcoal mt-3 px-4 py-2"
            >
              <IconCog className="w-4 h-4" />
              Account Settings
            </button>
          </div>

          {/* ===================== MAIN AREA ===================== */}
          <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
            {showSettings ? (
              <AccountSettings
                accountId={accountId}
                account={activeAccount}
                onClose={() => setShowSettings(false)}
                onUpdated={() => { refetchAccounts(); setShowSettings(false); }}
              />
            ) : viewingThreadId ? (
              <ThreadViewer
                accountId={accountId}
                threadId={viewingThreadId}
                threadMessages={threadMessages}
                threadLoading={threadLoading}
                onClose={() => { setViewingThreadId(null); refetchMessages(); }}
                onCompose={(prefill) => openCompose(prefill)}
                onRefresh={() => { refetchThread(); refetchMessages(); refetchFolders(); }}
                formatDateTime={formatDateTime}
              />
            ) : viewingMessageId ? (
              <MessageViewer
                accountId={accountId}
                messageId={viewingMessageId}
                onClose={() => { setViewingMessageId(null); refetchMessages(); refetchFolders(); }}
                onCompose={(prefill) => openCompose(prefill)}
                onRefresh={() => { refetchMessages(); refetchFolders(); }}
              />
            ) : (
              <>
                {/* Search bar */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder="Search messages..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-sage/10 text-sage rounded-lg text-sm font-medium hover:bg-sage/20">
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => { refetchMessages(); refetchFolders(); }}
                      className="p-2 text-gray-400 hover:text-sage rounded-lg hover:bg-gray-50"
                      title="Refresh"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                    </button>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}
                        className="text-xs text-gray-400 hover:text-charcoal"
                      >
                        Clear
                      </button>
                    )}
                  </form>
                </div>

                {/* Bulk actions toolbar */}
                {selectedIds.size > 0 && (
                  <div className="px-4 py-2 bg-sage/5 border-b border-gray-100 flex items-center gap-3 text-sm">
                    <span className="text-gray-500">{selectedIds.size} selected</span>
                    <button onClick={() => handleBulkAction('delete')} className="text-red-500 hover:text-red-700 font-medium">
                      Delete
                    </button>
                    <button onClick={() => handleBulkAction('archive')} className="text-charcoal hover:text-sage font-medium">
                      Archive
                    </button>
                    <button onClick={() => handleBulkAction('read')} className="text-charcoal hover:text-sage font-medium">
                      Mark Read
                    </button>
                    <button onClick={() => handleBulkAction('unread')} className="text-charcoal hover:text-sage font-medium">
                      Mark Unread
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setMoveFolderDropdown(!moveFolderDropdown)}
                        className="text-charcoal hover:text-sage font-medium flex items-center gap-1"
                      >
                        Move to <IconChevronDown className="w-3 h-3" />
                      </button>
                      {moveFolderDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                          {folders.filter(f => f.id !== selectedFolderId).map(f => (
                            <button
                              key={f.id}
                              onClick={() => { handleBulkAction('move', { folderId: f.id }); setMoveFolderDropdown(false); }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-charcoal"
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Message list */}
                <div className="flex-1 overflow-auto">
                  {messagesLoading ? (
                    <Spinner />
                  ) : messages.length === 0 ? (
                    <div className="text-center py-16">
                      <IconInbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">
                        {searchQuery ? 'No messages match your search' : 'No messages in this folder'}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="w-10 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.size === messages.length && messages.length > 0}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
                            />
                          </th>
                          <th className="w-8" />
                          <th />
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {messages.map(msg => {
                          const threadCount = parseInt(msg.thread_count) || 1;
                          const threadUnread = parseInt(msg.thread_unread) || 0;
                          const hasThread = threadCount > 1;
                          const handleClick = () => {
                            if (hasThread) {
                              setViewingThreadId(msg.thread_id || msg.message_id || String(msg.id));
                            } else {
                              setViewingMessageId(msg.id);
                            }
                          };
                          return (
                          <tr
                            key={msg.id}
                            className={`border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${
                              !msg.is_read || threadUnread > 0 ? 'bg-sage/5' : ''
                            }`}
                            onClick={handleClick}
                          >
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(msg.id)}
                                onChange={() => toggleSelect(msg.id)}
                                className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
                              />
                            </td>
                            <td className="py-3 pr-1" onClick={e => { e.stopPropagation(); handleStarToggle(msg); }}>
                              <IconStar
                                className={`w-4 h-4 ${msg.starred ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
                                filled={msg.starred}
                              />
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`text-sm truncate w-40 flex-shrink-0 ${!msg.is_read || threadUnread > 0 ? 'font-semibold text-charcoal' : 'text-gray-600'}`}>
                                  {msg.from_name || msg.from_address || 'Unknown'}
                                </span>
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className={`text-sm truncate ${!msg.is_read || threadUnread > 0 ? 'font-semibold text-charcoal' : 'text-gray-700'}`}>
                                    {msg.subject || '(no subject)'}
                                  </span>
                                  {hasThread && (
                                    <span className="text-xs font-semibold text-sage bg-sage/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                      {threadCount}
                                    </span>
                                  )}
                                  {msg.snippet && (
                                    <span className="text-sm text-gray-400 truncate hidden lg:inline">
                                      - {msg.snippet}
                                    </span>
                                  )}
                                </div>
                                {msg.has_attachments && (
                                  <IconPaperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {formatShortDate(msg.sent_at || msg.received_at || msg.created_at)}
                              </span>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compose overlay */}
      {showCompose && (
        <ComposeOverlay
          accountId={accountId}
          accounts={accounts}
          onClose={() => setShowCompose(false)}
          onSent={handleSent}
          prefill={composePrefill}
        />
      )}

      {/* Undo send toast */}
      {undoToast && (
        <UndoSendToast
          messageResult={undoToast}
          accountId={accountId}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  );
}
