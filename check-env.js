const keys = Object.keys(process.env).filter(k => k.includes('PG') || k.includes('DATA') || k.includes('DB') || k.includes('POSTGRES'));
console.log('DB-related env vars:', JSON.stringify(keys));
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('PGPASSWORD exists:', !!process.env.PGPASSWORD);
console.log('PGUSER:', process.env.PGUSER || 'not set');
console.log('PGHOST:', process.env.PGHOST || 'not set');
console.log('PGDATABASE:', process.env.PGDATABASE || 'not set');
