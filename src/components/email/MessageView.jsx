import React, { useRef, useCallback } from 'react';

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const parsed = typeof dateStr === 'string' && /^\d+$/.test(dateStr) ? parseInt(dateStr) : dateStr;
  const date = new Date(parsed);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function StarIcon({ filled, onClick }) {
  return (
    <button
      onClick={onClick}
      className="p-1 hover:text-yellow-500 transition-colors"
      aria-label={filled ? 'Unstar message' : 'Star message'}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  );
}

export default function MessageView({ message, onReply, onReplyAll, onForward, onDelete, onBack, onStar }) {
  const iframeRef = useRef(null);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc && doc.body) {
        iframe.style.height = doc.body.scrollHeight + 'px';
      }
    } catch {
      // cross-origin restriction fallback
      iframe.style.height = '500px';
    }
  }, []);

  if (!message) {
    return (
      <div className="card p-12 text-center text-gray-500">
        <p>Select a message to view</p>
      </div>
    );
  }

  const hasHtml = message.bodyHtml && message.bodyHtml.trim().length > 0;

  return (
    <div className="card flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          aria-label="Back to message list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>

        <h2 className="flex-1 text-lg font-semibold text-charcoal truncate ml-2">
          {message.subject || '(No subject)'}
        </h2>

        <span className={message.isStarred ? 'text-yellow-500' : 'text-gray-400'}>
          <StarIcon filled={message.isStarred} onClick={onStar} />
        </span>

        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
          aria-label="Delete message"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>

      {/* Message meta */}
      <div className="px-6 py-4 border-b border-gray-100 bg-cream-50">
        <div className="flex items-start justify-between">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-gray-500">From:</span>{' '}
              <span className="font-medium text-charcoal">
                {message.from?.name || message.from?.address}
              </span>
              {message.from?.name && (
                <span className="text-gray-400 ml-1">&lt;{message.from.address}&gt;</span>
              )}
            </p>
            <p>
              <span className="text-gray-500">To:</span>{' '}
              <span className="text-charcoal">
                {(message.to || []).map((r) => r.name || r.address).join(', ')}
              </span>
            </p>
            {message.cc && message.cc.length > 0 && (
              <p>
                <span className="text-gray-500">CC:</span>{' '}
                <span className="text-charcoal">
                  {message.cc.map((r) => r.name || r.address).join(', ')}
                </span>
              </p>
            )}
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
            {formatFullDate(message.date)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {hasHtml ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={`<base target="_blank">${message.bodyHtml}`}
            onLoad={handleIframeLoad}
            title="Email content"
            style={{ width: '100%', border: 'none', minHeight: '200px' }}
          />
        ) : (
          <pre className="text-sm text-charcoal whitespace-pre-wrap font-sans leading-relaxed">
            {message.bodyText || ''}
          </pre>
        )}
      </div>

      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Attachments ({message.attachments.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={`/api/email/attachments/${att.id}`}
                download={att.filename}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-charcoal hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                <span className="truncate max-w-[150px]">{att.filename}</span>
                <span className="text-xs text-gray-400">{formatFileSize(att.size)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-t border-gray-200 bg-cream-50">
        <button onClick={onReply} className="btn-primary text-sm px-4 py-1.5">
          Reply
        </button>
        <button
          onClick={onReplyAll}
          className="text-sm px-4 py-1.5 border border-gray-300 rounded-md text-charcoal hover:bg-gray-50 transition-colors"
        >
          Reply All
        </button>
        <button
          onClick={onForward}
          className="text-sm px-4 py-1.5 border border-gray-300 rounded-md text-charcoal hover:bg-gray-50 transition-colors"
        >
          Forward
        </button>
      </div>
    </div>
  );
}
