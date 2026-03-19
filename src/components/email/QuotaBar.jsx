import React from 'react';

function getBarColor(percentage) {
  if (percentage > 90) return 'bg-red-500';
  if (percentage > 80) return 'bg-yellow-500';
  return 'bg-sage-500';
}

function getTextColor(percentage) {
  if (percentage > 90) return 'text-red-600';
  if (percentage > 80) return 'text-yellow-600';
  return 'text-gray-600';
}

export default function QuotaBar({ usedMb, quotaMb }) {
  const used = usedMb || 0;
  const quota = quotaMb || 1;
  const percentage = Math.min((used / quota) * 100, 100);

  return (
    <div className="px-3 py-2">
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${getBarColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className={`text-xs mt-1 ${getTextColor(percentage)}`}>
        {used.toFixed(1)} MB of {quota.toFixed(0)} MB used
      </p>
    </div>
  );
}
