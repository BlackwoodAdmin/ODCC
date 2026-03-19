import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDate } from '../utils/formatters';

export default function DashboardUsers() {
  const { notify } = useNotification();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const data = await api.get('/users');
      setUsers(data.users || data || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const updateRole = async (id, role) => {
    try {
      await api.put(`/users/${id}`, { role });
      notify('Role updated');
      fetchUsers();
    } catch (err) { notify(err.message, 'error'); }
  };

  const deleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      notify('User deleted');
      fetchUsers();
    } catch (err) { notify(err.message, 'error'); }
  };

  const roleColors = { admin: 'bg-red-50 text-red-600', contributor: 'bg-blue-50 text-blue-600', subscriber: 'bg-gray-100 text-gray-600' };

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
        <h1 className="text-3xl font-bold text-charcoal mt-2 mb-8">Users</h1>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal">Name</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal">Email</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal">Role</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Joined</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-charcoal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-charcoal">{u.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                    <td className="px-6 py-4">
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full font-medium border-0 ${roleColors[u.role] || ''}`}>
                        <option value="subscriber">Subscriber</option>
                        <option value="contributor">Contributor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => deleteUser(u.id)} className="text-red-500 hover:underline text-sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
