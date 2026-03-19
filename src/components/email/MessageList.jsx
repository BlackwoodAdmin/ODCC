import React from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parsed = typeof dateStr === 'string' && /^\d+$/.test(dateStr) ? parseInt(dateStr) : dateStr;
  const date = new Date(parsed);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function StarIcon({ filled, onClick }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="p-0.5 hover:text-yellow-500 transition-colors"
      aria-label={filled ? 'Unstar message' : 'Star message'}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  );
}

function AttachmentIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 animate-pulse">
      <div className="w-4 h-4 bg-gray-200 rounded" />
      <div className="w-4 h-4 bg-gray-200 rounded" />
      <div className="w-28 h-4 bg-gray-200 rounded" />
      <div className="flex-1">
        <div className="w-3/4 h-4 bg-gray-200 rounded mb-1" />
        <div className="w-1/2 h-3 bg-gray-100 rounded" />
      </div>
      <div className="w-12 h-4 bg-gray-200 rounded" />
    </div>
  );
}

export default function MessageList({
  messages,
  selectedIds,
  onSelect,
  onSelectAll,
  onMessageClick,
  onStarToggle,
  loading,
}) {
  const allSelected =
    messages && messages.length > 0 && selectedIds && selectedIds.length === messages.length;

  if (loading) {
    return (
      <div className="card overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="card p-12 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        <p>No messages in this folder</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2 bg-cream-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="w-4 h-4 rounded border-gray-300 text-sage-500 focus:ring-sage-500"
        />
        <span className="w-4" />
        <span className="w-36">From</span>
        <span className="flex-1">Subject</span>
        <span className="w-4" />
        <span className="w-20 text-right">Date</span>
      </div>

      {/* Message rows */}
      {messages.map((msg) => {
        const isSelected = selectedIds && selectedIds.includes(msg.id);
        const isUnread = !msg.isRead;
        const isSent = msg.folderType === 'sent' || msg.folder === 'sent';
        const displayName = isSent
          ? `To: ${msg.to?.[0]?.name || msg.to?.[0]?.address || 'Unknown'}`
          : msg.from?.name || msg.from?.address || 'Unknown';

        return (
          <div
            key={msg.id}
            onClick={() => onMessageClick(msg)}
            className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 cursor-pointer transition-colors hover:bg-cream-50 ${
              isSelected ? 'bg-sage-50' : ''
            } ${isUnread ? 'border-l-3 border-l-sage-500' : 'border-l-3 border-l-transparent'}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect(msg.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-gray-300 text-sage-500 focus:ring-sage-500"
            />
            <span className={msg.isStarred ? 'text-yellow-500' : 'text-gray-300'}>
              <StarIcon
                filled={msg.isStarred}
                onClick={() => onStarToggle(msg.id)}
              />
            </span>
            <span className={`w-36 truncate text-sm ${isUnread ? 'font-semibold text-charcoal' : 'text-gray-700'}`}>
              {displayName}
            </span>
            <div className="flex-1 min-w-0">
              <span className={`text-sm truncate ${isUnread ? 'font-semibold text-charcoal' : 'text-gray-800'}`}>
                {msg.subject || '(No subject)'}
              </span>
              {msg.preview && (
                <span className="text-sm text-gray-400 ml-2 truncate">
                  - {msg.preview}
                </span>
              )}
            </div>
            <span className="w-4 flex-shrink-0">
              {msg.hasAttachments && <AttachmentIcon />}
            </span>
            <span className={`w-20 text-right text-xs flex-shrink-0 ${isUnread ? 'font-semibold text-charcoal' : 'text-gray-500'}`}>
              {formatDate(msg.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
