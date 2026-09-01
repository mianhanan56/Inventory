/**
 * Loads scripts/export.json into the NEW Supabase project.
 *
 * The trg_update_product_stock trigger must already be disabled when this runs —
 * otherwise the 288 stock_movements rows replay themselves onto current_stock and
 * wreck the counts. Re-enable it afterwards.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const { NEW_URL, NEW_KEY, APP_EMAIL, APP_PASSWORD } = process.env;
const supabase = createClient(NEW_URL, NEW_KEY);

const { error: authError } = await supabase.auth.signInWithPassword({
  email: APP_EMAIL,
  password: APP_PASSWORD,
});
if (authError) {
  console.error('Sign-in failed:', authError.message);
  process.exit(1);
}

const d = JSON.parse(readFileSync('scripts/export.json', 'utf8'));

// Parents before children. profiles is skipped: the auth trigger already made it.
const ORDER = ['categories', 'suppliers', 'customers', 'products', 'sales', 'sale_items', 'stock_movements'];

let failed = false;
for (const table of ORDER) {
  const rows = d[table];
  if (!rows.length) { console.log(`${table.padEnd(16)} 0 rows (skipped)`); continue; }
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 100));
    if (error) {
      console.error(`${table.padEnd(16)} FAILED at row ${i}: ${error.message}`);
      failed = true;
      break;
    }
  }
  if (!failed) console.log(`${table.padEnd(16)} ${rows.length} rows inserted`);
}
process.exit(failed ? 1 : 0);
