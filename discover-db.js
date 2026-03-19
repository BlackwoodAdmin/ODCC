import fs from 'fs';
import { execSync } from 'child_process';

// Check env vars
const dbVars = Object.keys(process.env).filter(k => 
  k.includes('PG') || k.includes('DATA') || k.includes('DB') || k.includes('POSTGRES')
);
console.log('DB env vars:', JSON.stringify(dbVars));
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('PGPASSWORD:', process.env.PGPASSWORD ? 'SET' : 'NOT SET');
console.log('PGUSER:', process.env.PGUSER || 'not set');
console.log('PGHOST:', process.env.PGHOST || 'not set');
console.log('PGDATABASE:', process.env.PGDATABASE || 'not set');

// Check files
const files = ['/home/appuser/.pgpass', '/home/appuser/.database_url', '/home/appuser/.env.local', '/home/appuser/.env.database'];
for (const f of files) {
  try {
    const content = fs.readFileSync(f, 'utf8').trim();
    console.log(`${f}: EXISTS (${content.length} chars)`);
    // Mask passwords but show structure
    if (f.includes('pgpass')) console.log('  structure:', content.replace(/:[^:]+$/, ':***'));
    if (f.includes('database_url') || f.includes('env')) console.log('  prefix:', content.substring(0, 30) + '...');
  } catch { console.log(`${f}: NOT FOUND`); }
}

// Check pg_hba.conf
try {
  const hba = fs.readFileSync('/etc/postgresql/16/main/pg_hba.conf', 'utf8');
  const lines = hba.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  console.log('pg_hba.conf active lines:', JSON.stringify(lines));
} catch (e) { console.log('Cannot read pg_hba.conf:', e.message); }

// Try psql
try {
  const result = execSync('psql -U appuser -d appdb -c "SELECT 1" 2>&1', { encoding: 'utf8', timeout: 5000 });
  console.log('psql works:', result.trim().substring(0, 100));
} catch (e) {
  console.log('psql failed:', e.message?.substring(0, 200));
}

// Check pg_ident
try {
  const ident = fs.readFileSync('/etc/postgresql/16/main/pg_ident.conf', 'utf8');
  const lines = ident.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  console.log('pg_ident.conf:', JSON.stringify(lines));
} catch (e) { console.log('Cannot read pg_ident.conf:', e.message); }
