import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const error = searchParams.get('error') === 'true';

  return (
    <div className="section-padding bg-cream min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 text-center">
        {success ? (
          <>
            <div className="text-4xl mb-4">&#x2709;</div>
            <h1 className="text-2xl font-bold text-charcoal mb-4">Unsubscribed</h1>
            <p className="text-gray-600 mb-6">
              You have been unsubscribed. You will no longer receive newsletters from us.
            </p>
            <Link to="/" className="text-sage font-semibold hover:underline">
              Return to website
            </Link>
          </>
        ) : error ? (
          <>
            <div className="text-4xl mb-4">&#x26A0;</div>
            <h1 className="text-2xl font-bold text-charcoal mb-4">Invalid Link</h1>
            <p className="text-gray-600 mb-6">
              This unsubscribe link is invalid. If you need help, please contact the church
              at <a href="mailto:info@opendoorchristian.church" className="text-sage hover:underline">info@opendoorchristian.church</a>.
            </p>
            <Link to="/" className="text-sage font-semibold hover:underline">
              Return to website
            </Link>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">&#x1F4E8;</div>
            <h1 className="text-2xl font-bold text-charcoal mb-4">Newsletter</h1>
            <p className="text-gray-600 mb-6">
              To unsubscribe from our newsletter, please use the unsubscribe link in any newsletter email you've received.
            </p>
            <Link to="/" className="text-sage font-semibold hover:underline">
              Return to website
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
