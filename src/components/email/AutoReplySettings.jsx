import React, { useState, useEffect } from 'react';
import { emailApi } from '../../hooks/useEmail';

export default function AutoReplySettings({ accountId, autoReplyAllowed }) {
  const [config, setConfig] = useState({
    is_enabled: false,
    subject: 'Out of Office',
    body_html: '',
    start_date: '',
    end_date: '',
    reply_once_per_sender: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!accountId || !autoReplyAllowed) return;
    (async () => {
      setLoading(true);
      try {
        const res = await emailApi.getAutoReply(accountId);
        if (res.autoReply) {
          setConfig({
            is_enabled: res.autoReply.is_enabled || false,
            subject: res.autoReply.subject || 'Out of Office',
            body_html: res.autoReply.body_html || '',
            start_date: res.autoReply.start_date ? new Date(Number(res.autoReply.start_date)).toISOString().slice(0, 10) : '',
            end_date: res.autoReply.end_date ? new Date(Number(res.autoReply.end_date)).toISOString().slice(0, 10) : '',
            reply_once_per_sender: res.autoReply.reply_once_per_sender !== false,
          });
        }
      } catch {}
      setLoading(false);
    })();
  }, [accountId, autoReplyAllowed]);

  if (!autoReplyAllowed) {
    return (
      <div className="text-sm text-gray-400 italic">
        Auto-reply is not enabled for this account. Contact your administrator.
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await emailApi.updateAutoReply(accountId, {
        is_enabled: config.is_enabled,
        subject: config.subject,
        body_html: config.body_html,
        start_date: config.start_date ? new Date(config.start_date).getTime() : null,
        end_date: config.end_date ? new Date(config.end_date).getTime() : null,
        reply_once_per_sender: config.reply_once_per_sender,
      });
      setMessage('Auto-reply settings saved.');
    } catch (err) {
      setMessage(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-gray-400">Loading...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-charcoal">Auto-Reply / Out of Office</h3>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.is_enabled}
          onChange={(e) => setConfig({ ...config, is_enabled: e.target.checked })}
          className="w-4 h-4 text-sage rounded"
        />
        <span className="text-sm font-medium text-charcoal">Enable auto-reply</span>
      </label>

      {config.is_enabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Subject</label>
            <input
              type="text"
              value={config.subject}
              onChange={(e) => setConfig({ ...config, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Message</label>
            <textarea
              value={config.body_html}
              onChange={(e) => setConfig({ ...config, body_html: e.target.value })}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="I'm currently out of the office..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Start Date (optional)</label>
              <input
                type="date"
                value={config.start_date}
                onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">End Date (optional)</label>
              <input
                type="date"
                value={config.end_date}
                onChange={(e) => setConfig({ ...config, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.reply_once_per_sender}
              onChange={(e) => setConfig({ ...config, reply_once_per_sender: e.target.checked })}
              className="w-4 h-4 text-sage rounded"
            />
            <span className="text-sm text-gray-600">Only reply once per sender</span>
          </label>
        </>
      )}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm !py-2 !px-4">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {message && <span className="text-sm text-sage">{message}</span>}
      </div>
    </div>
  );
}
