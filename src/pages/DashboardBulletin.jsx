import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime, todayET } from '../utils/formatters';
import { getSundayOf, addWeeks, formatWeekRange } from '../utils/week';

export default function DashboardBulletin() {
  const { notify } = useNotification();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const thisSunday = getSundayOf(todayET());
  const nextSunday = addWeeks(thisSunday, 1);

  useEffect(() => {
    api.get('/bulletin-notes')
      .then(d => setNotes(d.notes || []))
      .catch(err => notify(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  const noteFor = (week) => notes.find(n => n.week_start === week);

  const upcomingCard = (sunday, label) => {
    const existing = noteFor(sunday);
    return (
      <Link
        to={`/dashboard/bulletin/${sunday}`}
        className="block bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow"
      >
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs uppercase tracking-wide font-semibold text-sage">{label}</span>
          {existing?.has_content && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Drafted</span>
          )}
        </div>
        <h3 className="text-xl font-bold text-charcoal">{formatWeekRange(sunday)}</h3>
        {existing?.preview ? (
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">{existing.preview}</p>
        ) : (
          <p className="text-sm text-gray-400 mt-2">No notes yet — click to start writing.</p>
        )}
        {existing?.updated_at && (
          <p className="text-xs text-gray-400 mt-3">Last edited {formatDateTime(existing.updated_at)}{existing.updated_by_name ? ` by ${existing.updated_by_name}` : ''}</p>
        )}
      </Link>
    );
  };

  const pastNotes = notes.filter(n => n.week_start < thisSunday);

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="mb-8">
          <Link to="/dashboard" className="text-sm text-sage hover:underline">← Dashboard</Link>
          <h1 className="text-4xl font-bold text-charcoal mt-2">Bulletin Notes</h1>
          <p className="text-gray-500">Weekly notes for whoever assembles the bulletin. One page per week.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mb-10">
          {upcomingCard(thisSunday, 'This week')}
          {upcomingCard(nextSunday, 'Next week')}
        </div>

        <h2 className="text-2xl font-bold text-charcoal mb-4">Past weeks</h2>
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : pastNotes.length === 0 ? (
          <p className="text-gray-500">No past bulletin notes yet.</p>
        ) : (
          <div className="bg-white rounded-xl shadow-md divide-y divide-gray-100">
            {pastNotes.map(n => (
              <Link
                key={n.week_start}
                to={`/dashboard/bulletin/${n.week_start}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-cream/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-charcoal">{formatWeekRange(n.week_start)}</span>
                    {!n.has_content && (
                      <span className="text-xs text-gray-400">(empty)</span>
                    )}
                  </div>
                  {n.preview && <p className="text-sm text-gray-600 mt-1 line-clamp-1">{n.preview}</p>}
                </div>
                <div className="text-right text-xs text-gray-400 shrink-0">
                  {n.updated_at && <div>{formatDateTime(n.updated_at)}</div>}
                  {n.updated_by_name && <div>by {n.updated_by_name}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
