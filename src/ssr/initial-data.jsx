import React, { createContext, useContext, useEffect } from 'react';

// Server-preloaded API responses, keyed by the exact URL the client would
// fetch (e.g. '/posts?limit=3'). On the server the provider carries the
// loader's data; in the browser it carries window.__INITIAL_DATA__.
const InitialDataContext = createContext(null);

export function InitialDataProvider({ data, children }) {
  return <InitialDataContext.Provider value={data || null}>{children}</InitialDataContext.Provider>;
}

// Returns the preloaded response for this URL, or undefined. The key is
// deleted after mount so the hydration render uses it exactly once and any
// later visit to the page fetches fresh data.
export function useInitialData(url) {
  const store = useContext(InitialDataContext);
  const value = store && url in store ? store[url] : undefined;
  useEffect(() => {
    if (store && url in store) delete store[url];
  }, [store, url]);
  return value;
}
