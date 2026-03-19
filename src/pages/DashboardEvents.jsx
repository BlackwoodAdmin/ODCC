import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDate, formatTime } from '../utils/formatters';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th'];

export default function DashboardEvents() {
  const { notify } = useNotification();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', event_date: '', event_time: '', end_time: '', location: '', recurrence: 'none' });

  const fetchEvents = async () => {
    try {
      const data = await api.get('/events/all');
      setEvents(data.events || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEvents(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: form.title,
        description: form.description,
        event_date: form.event_date,
        event_time: form.event_time || null,
        end_time: form.end_time || null,
        location: form.location,
      };

      if (form.recurrence !== 'none' && form.event_date) {
        const d = new Date(form.event_date + 'T12:00:00');
        payload.recurrence = form.recurrence;
        payload.day_of_week = d.getDay();
        if (form.recurrence === 'monthly') {
          payload.week_of_month = Math.ceil(d.getDate() / 7);
        } else {
          payload.week_of_month = null;
        }
      } else {
        payload.recurrence = null;
        payload.day_of_week = null;
        payload.week_of_month = null;
      }

      if (editing) {
        await api.put(`/events/${editing}`, payload);
        notify('Event updated!');
      } else {
        await api.post('/events', payload);
        notify('Event created!');
      }
      resetForm();
      fetchEvents();
    } catch (err) { notify(err.message, 'error'); }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await api.delete(`/events/${id}`);
      notify('Event deleted');
      fetchEvents();
    } catch (err) { notify(err.message, 'error'); }
  };

  const editEvent = (event) => {
    setForm({
      title: event.title,
      description: event.description || '',
      event_date: event.event_date?.split('T')[0] || '',
      event_time: event.event_time?.slice(0, 5) || '',
      end_time: event.end_time?.slice(0, 5) || '',
      location: event.location || '',
      recurrence: event.recurrence || 'none',
    });
    setEditing(event.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ title: '', description: '', event_date: '', event_time: '', end_time: '', location: '', recurrence: 'none' });
    setEditing(null);
    setShowForm(false);
  };

  // Compute recurrence hint when a date is selected
  const recurrenceHint = (() => {
    if (form.recurrence === 'none' || !form.event_date) return null;
    const d = new Date(form.event_date + 'T12:00:00');
    const dayName = DAY_NAMES[d.getDay()];
    if (form.recurrence === 'weekly') return `Every ${dayName}`;
    const nth = Math.ceil(d.getDate() / 7);
    return `Every ${ORDINALS[nth]} ${dayName} of the month`;
  })();

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
            <h1 className="text-3xl font-bold text-charcoal mt-2">Events</h1>
          </div>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="btn-primary">
            {showForm ? 'Cancel' : '+ New Event'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-md p-8 mb-8">
            <h2 className="text-xl font-bold text-charcoal mb-6">{editing ? 'Edit Event' : 'New Event'}</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={5} className="w-full border border-gray-200 rounded-lg px-4 py-3 resize-none" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">Date *</label>
                  <input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">Start Time</label>
                  <input type="time" value={form.event_time} onChange={e => setForm({ ...form, event_time: e.target.value })} className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">End Time</label>
                  <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">Location</label>
                  <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                </div>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <span className="text-sm font-medium text-charcoal">Repeats:</span>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.recurrence === 'weekly'}
                    onChange={e => setForm({ ...form, recurrence: e.target.checked ? 'weekly' : 'none' })}
                    className="w-5 h-5 rounded border-gray-300 text-sage focus:ring-sage cursor-pointer"
                  />
                  <span className="ml-2 text-sm text-charcoal">Weekly</span>
                </label>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.recurrence === 'monthly'}
                    onChange={e => setForm({ ...form, recurrence: e.target.checked ? 'monthly' : 'none' })}
                    className="w-5 h-5 rounded border-gray-300 text-sage focus:ring-sage cursor-pointer"
                  />
                  <span className="ml-2 text-sm text-charcoal">Monthly</span>
                </label>
                {recurrenceHint && (
                  <span className="text-sm text-sage font-medium">— {recurrenceHint}</span>
                )}
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
                <button type="button" onClick={resetForm} className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : events.length > 0 ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal">Event</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Time</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Schedule</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Location</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-charcoal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map(event => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-charcoal">{event.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">
                      {event.event_time ? formatTime(event.event_time) : '-'}
                      {event.end_time ? ` - ${formatTime(event.end_time)}` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm hidden md:table-cell">
                      {event.recurrence === 'weekly' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="bg-sage/10 text-sage px-2 py-0.5 rounded-full text-xs font-semibold">Weekly</span>
                          <span className="text-gray-500">{event.day_of_week !== null ? DAY_NAMES[event.day_of_week] + 's' : ''}</span>
                        </span>
                      ) : event.recurrence === 'monthly' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs font-semibold">Monthly</span>
                          <span className="text-gray-500">{event.week_of_month && event.day_of_week !== null ? `${ORDINALS[event.week_of_month]} ${DAY_NAMES[event.day_of_week]}` : ''}</span>
                        </span>
                      ) : (
                        <span className="text-gray-500">{formatDate(event.event_date)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">{event.location || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => editEvent(event)} className="text-sage hover:underline text-sm mr-3">Edit</button>
                      <button onClick={() => deleteEvent(event.id)} className="text-red-500 hover:underline text-sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">No events yet. Create your first event!</p>
          </div>
        )}
      </div>
    </div>
  );
}
