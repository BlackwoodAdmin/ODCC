import React, { useState, useRef, useCallback, useEffect } from 'react';
import ContactPicker from './ContactPicker';

function buildQuotedText(msg, prefix) {
  const dateParsed = msg.date && typeof msg.date === 'string' && /^\d+$/.test(msg.date) ? parseInt(msg.date) : msg.date;
  const date = dateParsed ? new Date(dateParsed).toLocaleString() : '';
  const from = msg.from?.name || msg.from?.address || '';
  const header = `\n\n---------- ${prefix} ----------\nFrom: ${from}\nDate: ${date}\nSubject: ${msg.subject || ''}\n\n`;
  return header + (msg.bodyText || '');
}

export default function Compose({
  accountId,
  replyTo,
  forwardMsg,
  onSend,
  onSaveDraft,
  onCancel,
  signature,
  contacts,
}) {
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Pre-fill from replyTo or forwardMsg
  useEffect(() => {
    if (replyTo) {
      setTo([{ address: replyTo.from?.address, name: replyTo.from?.name }]);
      setSubject(
        replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`
      );
      setBody(buildQuotedText(replyTo, 'Original Message'));
    } else if (forwardMsg) {
      setSubject(
        forwardMsg.subject?.startsWith('Fwd:')
          ? forwardMsg.subject
          : `Fwd: ${forwardMsg.subject || ''}`
      );
      setBody(buildQuotedText(forwardMsg, 'Forwarded Message'));
    }
  }, [replyTo, forwardMsg]);

  const handleFileAdd = useCallback((files) => {
    const fileArray = Array.from(files);
    setAttachments((prev) => [...prev, ...fileArray]);
  }, []);

  const handleRemoveAttachment = useCallback((index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileAdd(e.dataTransfer.files);
      }
    },
    [handleFileAdd]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (to.length === 0) return;

      setSending(true);
      try {
        const formData = new FormData();
        formData.append('to', JSON.stringify(to));
        if (cc.length > 0) formData.append('cc', JSON.stringify(cc));
        if (bcc.length > 0) formData.append('bcc', JSON.stringify(bcc));
        formData.append('subject', subject);

        const fullBody = signature ? body + '\n\n-- \n' + signature : body;
        formData.append('body', fullBody);

        attachments.forEach((file) => {
          formData.append('attachments', file);
        });

        if (replyTo) {
          formData.append('inReplyTo', replyTo.id);
        }

        await onSend(formData);
      } finally {
        setSending(false);
      }
    },
    [to, cc, bcc, subject, body, signature, attachments, replyTo, onSend]
  );

  const handleSaveDraft = useCallback(() => {
    const fullBody = signature ? body + '\n\n-- \n' + signature : body;
    onSaveDraft({
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      body: fullBody,
    });
  }, [to, cc, bcc, subject, body, signature, onSaveDraft]);

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-charcoal">
          {replyTo ? 'Reply' : forwardMsg ? 'Forward' : 'New Message'}
        </h2>
        <div className="flex items-center gap-2">
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="text-xs text-sage-600 hover:text-sage-700"
            >
              CC
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              onClick={() => setShowBcc(true)}
              className="text-xs text-sage-600 hover:text-sage-700"
            >
              BCC
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-2 space-y-2 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <label className="text-sm text-gray-500 pt-2 w-12">To</label>
          <div className="flex-1">
            <ContactPicker
              contacts={contacts || []}
              value={to}
              onChange={setTo}
              placeholder="Add recipients..."
            />
          </div>
        </div>

        {showCc && (
          <div className="flex items-start gap-3">
            <label className="text-sm text-gray-500 pt-2 w-12">CC</label>
            <div className="flex-1">
              <ContactPicker
                contacts={contacts || []}
                value={cc}
                onChange={setCc}
                placeholder="Add CC..."
              />
            </div>
          </div>
        )}

        {showBcc && (
          <div className="flex items-start gap-3">
            <label className="text-sm text-gray-500 pt-2 w-12">BCC</label>
            <div className="flex-1">
              <ContactPicker
                contacts={contacts || []}
                value={bcc}
                onChange={setBcc}
                placeholder="Add BCC..."
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 w-12">Subj</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
            placeholder="Subject"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full h-full min-h-[200px] p-3 border border-gray-200 rounded-md text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
          placeholder="Write your message..."
        />

        {signature && (
          <div className="mt-2 p-2 bg-cream-50 border border-cream-300 rounded text-xs text-gray-500">
            <p className="font-medium mb-1">Signature:</p>
            <pre className="whitespace-pre-wrap font-sans">{signature}</pre>
          </div>
        )}
      </div>

      {/* Attachments drop zone */}
      <div
        className={`mx-4 mb-2 border-2 border-dashed rounded-md p-3 transition-colors ${
          dragOver
            ? 'border-sage-500 bg-sage-50'
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
          <span>Drag files here or</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sage-600 hover:text-sage-700 font-medium"
          >
            browse
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files.length > 0) handleFileAdd(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>

        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded text-xs"
              >
                <span className="truncate max-w-[120px]">{file.name}</span>
                <span className="text-gray-400">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(i)}
                  className="text-gray-400 hover:text-red-500 ml-1"
                  aria-label={`Remove ${file.name}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
        <button
          type="submit"
          disabled={sending || to.length === 0}
          className="btn-primary px-6 py-2 text-sm disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md text-charcoal hover:bg-gray-50 transition-colors"
        >
          Save Draft
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Discard
        </button>
      </div>
    </form>
  );
}
