// scripts/backup_supabase.js
// Node.js script to fetch all data from Supabase REST API and save to backups/ directory

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eqwmodrhorcbwsshbepg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('Error: SUPABASE_KEY environment variable is required.');
  process.exit(1);
}

const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

async function fetchData(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function jsonToCsv(items) {
  if (!items || items.length === 0) return '';
  const headers = Object.keys(items[0]);
  const csvRows = [headers.join(',')];
  for (const item of items) {
    const row = headers.map(header => {
      const val = item[header];
      if (val === null || val === undefined) return '""';
      const escaped = String(val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(row.join(','));
  }
  return csvRows.join('\n');
}

async function runBackup() {
  const dateStr = new Date().toISOString().split('T')[0];
  console.log(`Starting Supabase backup for date: ${dateStr}`);

  try {
    const bookings = await fetchData('bookings');
    console.log(`Fetched ${bookings.length} bookings.`);
    fs.writeFileSync(path.join(backupsDir, `bookings_${dateStr}.json`), JSON.stringify(bookings, null, 2));
    fs.writeFileSync(path.join(backupsDir, `bookings_${dateStr}.csv`), jsonToCsv(bookings));
    fs.writeFileSync(path.join(backupsDir, `latest_bookings.json`), JSON.stringify(bookings, null, 2));

    const transactions = await fetchData('transactions');
    console.log(`Fetched ${transactions.length} transactions.`);
    fs.writeFileSync(path.join(backupsDir, `transactions_${dateStr}.json`), JSON.stringify(transactions, null, 2));
    fs.writeFileSync(path.join(backupsDir, `transactions_${dateStr}.csv`), jsonToCsv(transactions));
    fs.writeFileSync(path.join(backupsDir, `latest_transactions.json`), JSON.stringify(transactions, null, 2));

    console.log('Backup completed successfully!');
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  }
}

runBackup();
