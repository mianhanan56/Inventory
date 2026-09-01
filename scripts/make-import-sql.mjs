import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const d = JSON.parse(readFileSync('scripts/export.json', 'utf8'));

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};

// created_by points at profiles(id); the new auth user does not exist yet, so
// park it as NULL and stitch it up once the account is created.
const NULL_OUT = {};

function insertsFor(table, rows) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const nulled = NULL_OUT[table] || [];
  const out = [];
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows.slice(i, i + CHUNK).map((r) =>
      '(' + cols.map((c) => (nulled.includes(c) ? 'NULL' : lit(r[c]))).join(', ') + ')'
    );
    out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values.join(',\n')};`);
  }
  return out;
}

// Parents before children.
const ORDER = ['categories', 'suppliers', 'customers', 'products', 'sales', 'sale_items', 'stock_movements'];

mkdirSync('scripts/import', { recursive: true });
let n = 0;
const manifest = [];

const write = (label, sql) => {
  const file = `scripts/import/${String(++n).padStart(2, '0')}_${label}.sql`;
  writeFileSync(file, sql);
  manifest.push(file);
};

// The trigger would replay all 288 movements onto current_stock. Turn it off.
write('disable_trigger', 'ALTER TABLE stock_movements DISABLE TRIGGER trg_update_product_stock;');

for (const table of ORDER) {
  insertsFor(table, d[table]).forEach((sql, i) =>
    write(`${table}_${String(i + 1).padStart(2, '0')}`, sql)
  );
}

write('enable_trigger', 'ALTER TABLE stock_movements ENABLE TRIGGER trg_update_product_stock;');

console.log(`${manifest.length} SQL files, ${ORDER.reduce((s, t) => s + d[t].length, 0)} rows`);
