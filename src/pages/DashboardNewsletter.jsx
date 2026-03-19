import React, { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';

const HtmlCodeEditor = lazy(() => import('../components/editors/HtmlCodeEditor'));
const EmailPreview = lazy(() => import('../components/editors/EmailPreview'));
const AiAssistant = lazy(() => import('../components/editors/AiAssistant'));

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function DashboardNewsletter() {
  const { notify } = useNotification();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [view, setView] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [editorTab, setEditorTab] = useState('code');
  const [saving, setSaving] = useState(false);
  const [sendConfirmId, setSendConfirmId] = useState(null);
  const [sendConfirmCount, setSendConfirmCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const pollRef = useRef(null);

  // Check AI availability
  useEffect(() => {
    api.get('/ai/status').then(data => setAiAvailable(data.available)).catch(() => {});
  }, []);

  // Unsaved changes warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const fetchCampaigns = async () => {
    try {
      const data = await api.get('/newsletter/campaigns');
      setCampaigns(data);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const fetchSubscriberCount = async () => {
    try {
      const data = await api.get('/newsletter/subscribers/count');
      setSubscriberCount(data.count);
    } catch {}
  };

  useEffect(() => {
    fetchCampaigns();
    fetchSubscriberCount();
  }, []);

  // Poll while any campaign is in 'sending' status
  useEffect(() => {
    const hasSending = campaigns.some(c => c.status === 'sending');
    if (hasSending && !pollRef.current) {
      pollRef.current = setInterval(() => { fetchCampaigns(); }, 5000);
    } else if (!hasSending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [campaigns]);

  const openCompose = (campaign = null) => {
    if (campaign) {
      setEditingId(campaign.id);
      setSubject(campaign.subject);
      setBodyHtml(campaign.body_html);
    } else {
      setEditingId(null);
      setSubject('');
      setBodyHtml('');
    }
    setEditorTab('preview');
    setDirty(false);
    setShowAi(false);
    setView('compose');
  };

  const handleSave = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      notify('Subject and body are required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/newsletter/campaigns/${editingId}`, { subject, body_html: bodyHtml });
        notify('Campaign updated');
      } else {
        const created = await api.post('/newsletter/campaigns', { subject, body_html: bodyHtml });
        setEditingId(created.id);
        notify('Campaign saved as draft');
      }
      setDirty(false);
      fetchCampaigns();
    } catch (err) { notify(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await api.delete(`/newsletter/campaigns/${id}`);
      notify('Campaign deleted');
      fetchCampaigns();
    } catch (err) { notify(err.message, 'error'); }
  };

  const handleTestSend = async (id) => {
    try {
      const data = await api.post(`/newsletter/campaigns/${id}/test`);
      notify(data.message);
    } catch (err) { notify(err.message, 'error'); }
  };

  const openSendConfirm = async (id) => {
    try {
      const data = await api.get(`/newsletter/campaigns/${id}`);
      setSendConfirmId(id);
      setSendConfirmCount(data.subscriber_count);
    } catch (err) { notify(err.message, 'error'); }
  };

  const handleSend = async () => {
    try {
      await api.post(`/newsletter/campaigns/${sendConfirmId}/send`);
      notify('Newsletter send started!');
      setSendConfirmId(null);
      fetchCampaigns();
    } catch (err) { notify(err.message, 'error'); }
  };

  const isStuck = (campaign) => {
    return campaign.status === 'sending' && (Date.now() - Number(campaign.updated_at)) > 30 * 60 * 1000;
  };

  const handleBodyChange = useCallback((val) => {
    setBodyHtml(val);
    setDirty(true);
  }, []);

  const handleAiInsert = useCallback((html) => {
    setBodyHtml(prev => prev + html);
    setDirty(true);
  }, []);

  const handleAiReplace = useCallback((html) => {
    setBodyHtml(html);
    setDirty(true);
  }, []);

  const handleImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('image', file);
      const data = await api.post('/uploads/image', formData);
      const siteUrl = window.location.origin;
      const imgUrl = data.url.startsWith('/') ? `${siteUrl}${data.url}` : data.url;
      const imgHtml = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0;"><img src="${imgUrl}" alt="" width="560" style="max-width:100%;height:auto;display:block;" /></td></tr></table>`;
      setBodyHtml(prev => prev + imgHtml);
      setDirty(true);
      notify('Image inserted');
    } catch (err) {
      notify(err.message || 'Upload failed', 'error');
    }
    // Reset file input
    e.target.value = '';
  }, [notify]);

  // --- Compose / Edit View ---
  if (view === 'compose') {
    return (
      <div className="section-padding bg-cream">
        <div className="container-custom">
          <div className="mb-6">
            <button onClick={() => setView('list')} className="text-sage text-sm hover:underline">
              &larr; Back to campaigns
            </button>
            <h1 className="text-3xl font-bold text-charcoal mt-2">
              {editingId ? 'Edit Campaign' : 'New Campaign'}
            </h1>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="mb-4">
              <label className="block text-sm font-semibold text-charcoal mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => { setSubject(e.target.value); setDirty(true); }}
                placeholder="Newsletter subject line..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-sage focus:border-sage outline-none"
              />
            </div>

            <div className="mb-4">
              {/* Tab bar */}
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setEditorTab('code')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${editorTab === 'code' ? 'bg-sage text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('preview')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${editorTab === 'preview' ? 'bg-sage text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Preview
                </button>
                <span className="flex-1" />
                {/* Insert Image */}
                <label className="px-3 py-1.5 rounded text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer">
                  Insert Image
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="hidden" />
                </label>
                {aiAvailable && (
                  <button
                    type="button"
                    onClick={() => setShowAi(!showAi)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${showAi ? 'bg-sage text-white' : 'border border-sage text-sage hover:bg-sage/10'}`}
                  >
                    AI Assistant
                  </button>
                )}
              </div>

              <Suspense fallback={<div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">Loading editor...</div>}>
                {editorTab === 'code' ? (
                  <HtmlCodeEditor
                    value={bodyHtml}
                    onChange={handleBodyChange}
                    placeholder="<p>Your newsletter content...</p>"
                    minHeight="350px"
                  />
                ) : (
                  <EmailPreview bodyHtml={bodyHtml} onChange={handleBodyChange} />
                )}
              </Suspense>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              {editingId && (
                <>
                  <button
                    onClick={() => handleTestSend(editingId)}
                    className="px-4 py-2 border border-sage text-sage rounded-lg hover:bg-sage/10 transition-colors"
                  >
                    Send Test
                  </button>
                  <button
                    onClick={() => openSendConfirm(editingId)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Send Newsletter
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {sendConfirmId && (
          <SendConfirmModal
            count={sendConfirmCount}
            onConfirm={handleSend}
            onCancel={() => setSendConfirmId(null)}
          />
        )}

        {showAi && (
          <Suspense fallback={null}>
            <AiAssistant type="newsletter" currentContent={bodyHtml} onInsert={handleAiInsert} onReplace={handleAiReplace} onClose={() => setShowAi(false)} />
          </Suspense>
        )}
      </div>
    );
  }

  // --- Campaign List View ---
  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/dashboard" className="text-sage text-sm hover:underline">&larr; Dashboard</Link>
            <h1 className="text-3xl font-bold text-charcoal mt-2">Newsletter</h1>
            <p className="text-gray-500 text-sm mt-1">{subscriberCount} active subscriber{subscriberCount !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => openCompose()} className="btn-primary">
            New Campaign
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <p className="text-gray-500 mb-4">No campaigns yet. Create your first newsletter!</p>
            <button onClick={() => openCompose()} className="btn-primary">
              New Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(campaign => (
              <div key={campaign.id} className="bg-white rounded-xl shadow-md p-5 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-charcoal truncate">{campaign.subject}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[campaign.status]}`}>
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                    {isStuck(campaign) && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 whitespace-nowrap">
                        Stuck
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    {campaign.status === 'sent' || campaign.status === 'failed'
                      ? `${campaign.sent_count} sent, ${campaign.failed_count} failed — ${formatDateTime(campaign.sent_at || campaign.updated_at)}`
                      : campaign.status === 'sending'
                      ? `${campaign.sent_count} sent so far...`
                      : `Last edited ${formatDateTime(campaign.updated_at)}`
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {campaign.status === 'draft' && (
                    <>
                      <button onClick={() => openCompose(campaign)} className="text-sm text-sage hover:underline">Edit</button>
                      <button onClick={() => handleTestSend(campaign.id)} className="text-sm text-blue-600 hover:underline">Test</button>
                      <button onClick={() => openSendConfirm(campaign.id)} className="text-sm text-green-600 hover:underline">Send</button>
                      <button onClick={() => handleDelete(campaign.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                    </>
                  )}
                  {campaign.status === 'sending' && !isStuck(campaign) && (
                    <span className="text-sm text-yellow-600">Sending...</span>
                  )}
                  {(campaign.status === 'failed' || isStuck(campaign)) && (
                    <>
                      {campaign.status === 'failed' && (
                        <button onClick={() => openCompose(campaign)} className="text-sm text-sage hover:underline">Edit</button>
                      )}
                      <button onClick={() => openSendConfirm(campaign.id)} className="text-sm text-green-600 hover:underline">Retry</button>
                      {campaign.status === 'failed' && (
                        <button onClick={() => handleDelete(campaign.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                      )}
                    </>
                  )}
                  {campaign.status === 'sent' && (
                    <span className="text-sm text-gray-400">Delivered</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {sendConfirmId && (
        <SendConfirmModal
          count={sendConfirmCount}
          onConfirm={handleSend}
          onCancel={() => setSendConfirmId(null)}
        />
      )}
    </div>
  );
}

function SendConfirmModal({ count, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <h2 className="text-xl font-bold text-charcoal mb-3">Send Newsletter?</h2>
        <p className="text-gray-600 mb-6">
          This will send the newsletter to <strong>{count}</strong> subscriber{count !== 1 ? 's' : ''}. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            Send Now
          </button>
        </div>
      </div>
    </div>
  );
}
