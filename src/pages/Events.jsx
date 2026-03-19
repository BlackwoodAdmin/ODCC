import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { formatTime, todayET, nowET } from '../utils/formatters';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Events() {
  const now = nowET();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/events?month=${month}&year=${year}`);
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  // Build calendar grid
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = lastOfMonth.getDate();

  // Previous month trailing days
  const prevMonthLast = new Date(year, month - 1, 0).getDate();
  const leadingDays = [];
  for (let i = startDay - 1; i >= 0; i--) {
    leadingDays.push({ day: prevMonthLast - i, inMonth: false });
  }

  // Current month days
  const currentDays = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentDays.push({ day: i, inMonth: true });
  }

  // Trailing days
  const totalCells = leadingDays.length + currentDays.length;
  const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const trailingDays = [];
  for (let i = 1; i <= trailingCount; i++) {
    trailingDays.push({ day: i, inMonth: false });
  }

  const allDays = [...leadingDays, ...currentDays, ...trailingDays];

  // Group events by date string
  const eventsByDate = {};
  for (const event of events) {
    const key = event.event_date;
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(event);
  }

  const todayStr = todayET();

  // Get the date string for a calendar cell
  const getDateStr = (cell, idx) => {
    if (cell.inMonth) {
      return `${year}-${String(month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    }
    // Leading days = previous month
    if (idx < startDay) {
      const pm = month === 1 ? 12 : month - 1;
      const py = month === 1 ? year - 1 : year;
      return `${py}-${String(pm).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    }
    // Trailing days = next month
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    return `${ny}-${String(nm).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
  };

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  return (
    <div>
      <section className="relative py-16 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">Events</h1>
          <p className="text-xl text-gray-300">What's happening at Open Door Christian Church</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom max-w-5xl">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg text-charcoal text-xl font-bold">&larr;</button>
            <h2 className="text-2xl font-bold text-charcoal">{MONTHS[month - 1]} {year}</h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg text-charcoal text-xl font-bold">&rarr;</button>
          </div>

          {loading ? (
            <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
          ) : (
            <div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 border-t border-l border-gray-200 rounded-t-xl overflow-hidden">
                {/* Day headers */}
                {DAYS.map(d => (
                  <div key={d} className="bg-charcoal text-white text-center py-3 text-sm font-semibold border-r border-b border-gray-700">
                    {d}
                  </div>
                ))}
                {/* Day cells */}
                {allDays.map((cell, idx) => {
                  const dateStr = getDateStr(cell, idx);
                  const dayEvents = eventsByDate[dateStr] || [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;

                  return (
                    <div
                      key={idx}
                      onClick={() => dayEvents.length > 0 && setSelectedDate(isSelected ? null : dateStr)}
                      className={`min-h-[90px] md:min-h-[110px] border-r border-b border-gray-200 p-1.5 transition-colors
                        ${cell.inMonth ? 'bg-white' : 'bg-gray-50'}
                        ${dayEvents.length > 0 ? 'cursor-pointer hover:bg-sage/5' : ''}
                        ${isSelected ? 'bg-sage/10 ring-2 ring-sage ring-inset' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full
                        ${!cell.inMonth ? 'text-gray-300' : isToday ? 'bg-sage text-white' : 'text-charcoal'}
                      `}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev, i) => (
                          <div
                            key={i}
                            className="text-xs px-1.5 py-0.5 rounded bg-sage/15 text-sage font-medium truncate"
                            title={`${ev.title} ${ev.event_time ? formatTime(ev.event_time) : ''}`}
                          >
                            {ev.event_time ? formatTime(ev.event_time).replace(':00 ', ' ') : ''} {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-gray-400 px-1.5">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected day detail */}
              {selectedDate && selectedEvents.length > 0 && (
                <div className="mt-6 bg-cream rounded-xl p-6">
                  <h3 className="text-xl font-bold text-charcoal mb-4">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <div className="space-y-4">
                    {selectedEvents.map((ev, i) => (
                      <div key={i} className="bg-white rounded-lg p-5 shadow-sm">
                        <h4 className="text-lg font-bold text-charcoal">{ev.title}</h4>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1 mb-2">
                          {ev.event_time && <span>🕐 {formatTime(ev.event_time)}{ev.end_time ? ` - ${formatTime(ev.end_time)}` : ''}</span>}
                          {ev.location && <span>📍 {ev.location}</span>}
                        </div>
                        <p className="text-gray-600">{ev.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
