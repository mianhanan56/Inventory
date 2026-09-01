/**
 * Exports every row from the OLD Supabase project to scripts/export.json.
 *
 * Reads credentials from the environment so they are never written to disk:
 *
 *   OLD_URL=https://zrgxrvecxlaxaeaomaqj.supabase.co \
 *   OLD_ANON_KEY=<anon key from Vercel env vars> \
 *   APP_EMAIL=<your app login> \
 *   APP_PASSWORD=<your app password> \
 *   node scripts/export-old.mjs
 *
 * RLS on that project is `TO authenticated`, so this signs in first; an anon
 * key on its own comes back empty.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const { OLD_URL, OLD_ANON_KEY, APP_EMAIL, APP_PASSWORD } = process.env;

for (const [k, v] of Object.entries({ OLD_URL, OLD_ANON_KEY, APP_EMAIL, APP_PASSWORD })) {
  if (!v) {
    console.error(`Missing ${k}. See the comment at the top of this file.`);
    process.exit(1);
  }
}

const supabase = createClient(OLD_URL, OLD_ANON_KEY);

const { error: authError } = await supabase.auth.signInWithPassword({
  email: APP_EMAIL,
  password: APP_PASSWORD,
});
if (authError) {
  console.error('Sign-in failed:', authError.message);
  process.exit(1);
}

// Parents before children, so the import can replay this order directly.
const TABLES = [
  'categories',
  'suppliers',
  'customers',
  'products',
  'sales',
  'sale_items',
  'stock_movements',
  'profiles',
];

// A single response stops at 1000 rows without saying so — page explicitly.
async function fetchAll(table) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

const dump = {};
for (const table of TABLES) {
  try {
    dump[table] = await fetchAll(table);
    console.log(`${table.padEnd(16)} ${dump[table].length} rows`);
  } catch (err) {
    console.error(`${table.padEnd(16)} FAILED — ${err.message}`);
    dump[table] = [];
  }
}

writeFileSync('scripts/export.json', JSON.stringify(dump, null, 2));
console.log('\nWrote scripts/export.json');
