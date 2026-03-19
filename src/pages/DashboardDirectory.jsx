import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch';

export default function DashboardDirectory() {
  const { data, loading } = useFetch('/directory');
  const [search, setSearch] = useState('');

  const members = (data?.members || []).filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom max-w-4xl">
        <div className="mb-8">
          <Link to="/dashboard" className="text-sage hover:underline text-sm">&larr; Back to Dashboard</Link>
          <h1 className="text-4xl font-bold text-charcoal mt-2">Church Directory</h1>
          <p className="text-gray-500 mt-1">Members who have opted in to the directory</p>
        </div>

        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div>
          </div>
        ) : members.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <p className="text-gray-500">{search ? 'No members match your search.' : 'No members in the directory yet.'}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map(member => (
              <div key={member.id} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
                {member.profile_image ? (
                  <img src={member.profile_image} alt={member.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-sage/20 flex items-center justify-center text-sage text-xl font-bold flex-shrink-0">
                    {member.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal truncate">{member.name}</p>
                  <a href={`mailto:${member.email}`} className="text-sm text-sage hover:underline truncate block">{member.email}</a>
                  {member.phone && (
                    <a href={`tel:${member.phone}`} className="text-sm text-gray-500 hover:text-charcoal">{member.phone}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
