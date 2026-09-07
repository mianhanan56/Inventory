/**
 * Driver for print-test.html - a synthetic invoice through the real print path.
 *
 * The point of it is that nothing here is a mock: the HTML comes from
 * generateInvoiceHTML(), the bitmap from renderReceiptBitmap(), and printing
 * goes through printSaleReceipt() exactly as the Print button does. Only the
 * sale is invented, so the path can be exercised on a machine with no Supabase
 * session and no real invoices.
 *
 * Open it on the dev server:  http://localhost:5173/tools/qz-test/print-test.html
 */
import type { Sale, SaleItem } from '../../src/types';
import { generateInvoiceHTML } from '../../src/lib/invoices';
import { PAPER_WIDTH_MM, renderReceiptBitmap } from '../../src/lib/qz';
import { printSaleReceipt } from '../../src/lib/printReceipt';

const SHORT_NAMES = [
  'EKOL F92 Black',
  'EKOL P29 Fume',
  'PEPPER SPRAY 50ML',
  'Taser 1101',
  'VELVET HOLSTER',
  'CKB Cartridge Blank P.A.K 9mm',
  'Akas AK22 Glock FDE',
];

const LONG_NAMES = [
  'EKOL Viper 2.5 Shiny Chrome Compact Blank Firing Pistol',
  'Akas AK22 Glock Black Blank Firing Pistol With Holster Kit',
  'Pepper Spray 100ML Breathable Small Holster Combination Pack',
  'Legend Cartridge Blank P.A.K 9mm Box Of Fifty Rounds',
];

const log = document.getElementById('log') as HTMLPreElement;
const countInput = document.getElementById('count') as HTMLInputElement;
const longNames = document.getElementById('longNames') as HTMLInputElement;

function say(line: string) {
  log.textContent = `${log.textContent === 'Ready.' ? '' : `${log.textContent}\n`}${line}`;
  log.scrollTop = log.scrollHeight;
}

function buildSale(n: number): { sale: Sale; items: SaleItem[] } {
  const names = longNames.checked ? LONG_NAMES : SHORT_NAMES;

  const items = Array.from({ length: n }, (_, i) => ({
    id: `test-item-${i}`,
    sale_id: 'test-sale',
    product_id: `test-product-${i}`,
    product_name: `${String(i + 1).padStart(2, '0')}. ${names[i % names.length]}`,
    quantity: 1,
    unit_price: 2000,
    vat_rate: 0,
    line_total: 2000,
  })) as unknown as SaleItem[];

  const sale = {
    id: 'test-sale',
    invoice_number: `TEST-${String(n).padStart(3, '0')}`,
    created_at: new Date().toISOString(),
    subtotal: 2000 * n,
    vat_amount: 0,
    total: 2000 * n,
    payment_method: 'cash',
  } as unknown as Sale;

  return { sale, items };
}

async function measure(n: number) {
  const { sale, items } = buildSale(n);
  const raster = await renderReceiptBitmap(
    generateInvoiceHTML(sale, items, PAPER_WIDTH_MM),
    PAPER_WIDTH_MM,
  );
  const dpi = Math.round((raster.widthPx / PAPER_WIDTH_MM) * 25.4);
  say(
    `measure  ${String(n).padStart(3)} items  ${raster.heightMm.toFixed(1)}mm  ` +
      `${raster.widthPx}x${raster.heightPx}px  ${dpi}dpi`,
  );
  return raster.heightMm;
}

async function print(n: number) {
  const { sale, items } = buildSale(n);
  const outcome = await printSaleReceipt(sale, items);

  if (outcome.route === 'thermal') {
    say(
      `PRINT    ${String(n).padStart(3)} items  THERMAL  ${outcome.heightMm?.toFixed(1)}mm  ` +
        `cut=${outcome.cut}  renderer=${outcome.renderer}  printer=${outcome.printer}`,
    );
  } else {
    say(
      `PRINT    ${String(n).padStart(3)} items  BROWSER FALLBACK  (${outcome.fallbackReason})\n` +
        '         QZ Tray is not reachable - this went through the print dialog, ' +
        'so the length is the driver’s and not ours.',
    );
  }
}

async function run(label: string, task: () => Promise<unknown>) {
  const buttons = Array.from(document.querySelectorAll('button'));
  buttons.forEach((b) => (b.disabled = true));
  try {
    await task();
  } catch (err) {
    say(`ERROR    ${label}: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

const count = () => Math.max(1, Math.min(200, Number(countInput.value) || 1));

document.getElementById('measure')!.addEventListener('click', () => {
  void run('measure', () => measure(count()));
});

document.getElementById('print')!.addEventListener('click', () => {
  void run('print', () => print(count()));
});

document.getElementById('sweep')!.addEventListener('click', () => {
  void run('sweep', async () => {
    let previous = 0;
    for (const n of [1, 3, 15, 16, 30]) {
      const mm = await measure(n);
      // The 15 -> 16 step is the one that matters: on the browser route the
      // page widens there and the driver shrinks it, so a 16-item slip comes
      // out shorter than a 15-item one. On this route it must only grow.
      if (mm <= previous) say(`         ^^ NOT MONOTONIC: ${n} items is not longer than the previous step`);
      previous = mm;
    }
    say('sweep    done - every step must be longer than the one before it');
  });
});

document.getElementById('clear')!.addEventListener('click', () => {
  log.textContent = 'Ready.';
});

/*
 * Auto-run, so the same page can be driven from a headless Chrome without a
 * click: ?run=sweep, ?run=measure&items=30, ?run=print&items=3. The log ends
 * with a DONE line, which is what a script waits for.
 */
const params = new URLSearchParams(location.search);
const auto = params.get('run');

if (auto) {
  const n = Math.max(1, Math.min(200, Number(params.get('items')) || 3));
  countInput.value = String(n);
  if (params.get('longNames') === '1') longNames.checked = true;

  const task =
    auto === 'sweep'
      ? () => (document.getElementById('sweep') as HTMLButtonElement).click()
      : auto === 'print'
        ? () => print(n)
        : () => measure(n);

  void (async () => {
    if (auto === 'sweep') {
      task();
      // The click path re-enables the buttons when it is finished.
      while (
        (document.getElementById('sweep') as HTMLButtonElement).disabled ||
        log.textContent?.includes('sweep    done') === false
      ) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } else {
      await run(auto, task as () => Promise<unknown>);
    }
    say('DONE');
  })();
}
