import { Sale, SaleItem } from "../types";
import { LOGO_DATA_URI } from "./logo";
import {
  PAPER_WIDTH_MM,
  PrintReceiptResult,
  describePrintError,
  printReceiptHtml,
} from "./qz";

/**
 * Reference width, in CSS pixels, that the receipt stylesheet is designed
 * against (80mm at 96dpi). Use it for on-screen previews so the preview and
 * the printed slip look identical.
 */
export const RECEIPT_PREVIEW_WIDTH_PX = 302;

/* ══════════════════════════════════════════════════════════════════════════
   LOCAL TESTING SWITCH  ---  TEMPORARY
   ──────────────────────────────────────────────────────────────────────────
   true  -> receipts open in a new browser tab and go through window.print().
            For development machines that have no thermal printer / no QZ Tray.
   false -> production behavior: the untouched QZ Tray path in ./qz.ts prints
            straight to the 80mm thermal printer with no dialog.

   Set this back to false before shipping to the client.
   ══════════════════════════════════════════════════════════════════════════ */
export const IS_LOCAL_TEST = true;

export function generateInvoiceHTML(sale: Sale, items: SaleItem[]) {
  const fmt = (v: number) =>
    `R ${v.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const stamp = sale.created_at ? new Date(sale.created_at) : new Date();

  const saleDate = stamp.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const saleTime = stamp.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const saleStamp = `Date: ${saleDate} | Time: ${saleTime}`;

  return `
<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8" />
  <title>Invoice ${sale.invoice_number}</title>

  <style>
    /*
      Sized in CSS pixels against a 302px reference width (80mm at 96dpi) -
      the same numbers the original design used. Typography is scoped to
      .invoice rather than body, so the receipt renders identically whether it
      is laid out as a document or rasterised inside an SVG foreignObject,
      where body/html rules and rem units do not apply.
    */

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #fff;
    }

    img {
      max-width: 100%;
    }

    .invoice {
      /* 78mm of content on the 80mm roll, centred - a tiny gap each side. */
      width: 78mm;
      margin: 0 auto;
      padding: 11px 0;
      /* The only side margin: keeps text off the very edge of the paper. */
      font-family: Arial, sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.2;
      /* Crisper glyphs on a thermal head than a heavier weight would give:
         no anti-aliasing to smear, and exact glyph geometry. */
      font-weight: 500;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: none;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
    }

    .company-info .logo {
      height: 60px;
      width: auto;
      margin-bottom: 4px;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .company-info h1 {
      color: #000;
      font-size: 24px;
      font-weight: 700;
    }

    .company-info p {
      color: #000;
      font-size: 12px;
      margin-top: 2px;
    }

    .company-info .meta-date {
      font-size: 12px;
      margin-top: 4px;
      white-space: nowrap;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      table-layout: fixed;
    }

    thead th {
      background: #fff;
      color: #000;
      padding: 4px 2px;
      text-align: left;
      font-size: 13px;
      text-transform: uppercase;
      border-bottom: 2px solid #000;
      overflow-wrap: break-word;
    }

    thead th:last-child,
    thead th:nth-child(n + 3) {
      text-align: right;
    }

    tbody td {
      padding: 4px 2px;
      font-size: 14px;
      overflow-wrap: break-word;
    }

    tbody td:last-child,
    tbody td:nth-child(n + 3) {
      text-align: right;
    }

    th:nth-child(1),
    td:nth-child(1) {
      width: 32%;
    }

    th:nth-child(2),
    td:nth-child(2) {
      width: 9%;
    }

    th:nth-child(3),
    td:nth-child(3) {
      width: 24%;
    }

    th:nth-child(4),
    td:nth-child(4) {
      width: 14%;
    }

    th:nth-child(5),
    td:nth-child(5) {
      width: 21%;
    }

    .totals {
      width: 100%;
      margin-left: auto;
    }

    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 13px;
    }

    .totals .row.total {
      font-size: 16px;
      font-weight: 700;
      border-top: 2px solid #000;
      padding-top: 4px;
      margin-top: 3px;
    }

    .returns-policy {
      margin-top: 10px;
      text-align: center;
    }

    .returns-policy p {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.3;
      text-transform: uppercase;
    }

    .returns-policy .thanks {
      margin-top: 4px;
      font-weight: 700;
      text-transform: none;
    }
  </style>
</head>

<body>

  <div class="invoice">

    <div class="header">
      <div class="company-info">

        <img
          class="logo"
          src="${LOGO_DATA_URI}"
          alt="ON TARGET UNITED logo"
        />

        <h1>ON TARGET UNITED</h1>

        <p>BLOCK C SHOP # 74 CHINA MALL, SPRINGFIELD, DURBAN</p>

        <p>Tel: 078 863 8987 | 067 606 1458</p>

        <p class="meta-date">${saleStamp}</p>

      </div>
    </div>

    <table>

      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>VAT %</th>
          <th>Line Total</th>
        </tr>
      </thead>

      <tbody>

        ${items
          .map(
            (item) => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>${fmt(item.unit_price)}</td>
            <td>${item.vat_rate}%</td>
            <td>${fmt(item.line_total)}</td>
          </tr>
        `,
          )
          .join("")}

      </tbody>

    </table>

    <div class="totals">

      <div class="row">
        <span>Subtotal</span>
        <span>${fmt(Number(sale.subtotal))}</span>
      </div>

      <div class="row">
        <span>VAT</span>
        <span>${fmt(Number(sale.vat_total))}</span>
      </div>

      ${
        Number(sale.discount_total) > 0
          ? `
        <div class="row">
          <span>Discount</span>
          <span>-${fmt(Number(sale.discount_total))}</span>
        </div>
      `
          : ""
      }

      <div class="row total">
        <span>Total</span>
        <span>${fmt(Number(sale.total))}</span>
      </div>

    </div>

    <div class="returns-policy">

      <p>
        NO RETURN, NO REFUND. EXCHANGE ONLY IN 7 DAYS WITH VALID
        PROOF OF PURCHASE.
        <br />
        ITEM SHOULD BE ORIGINAL PACKING &amp; RESALABLE
      </p>

      <p class="thanks">
        Thanks for shopping with us!
      </p>

    </div>

  </div>

</body>

</html>
`;
}

/* ══════════════════════════════════════════════════════════════════════════
   LOCAL TESTING ONLY  ---  everything down to the next banner.
   None of this runs when IS_LOCAL_TEST is false.
   ══════════════════════════════════════════════════════════════════════════ */

/** 1mm in CSS pixels at 96dpi, used to turn a measured height into paper mm. */
const PX_PER_MM = 96 / 25.4;

/**
 * Slack added under the last line, in millimetres. Chrome rounds the page box
 * up, and a page even a fraction shorter than its content spills a sliver onto
 * a second sheet - which is far worse than half a millimetre of paper.
 */
const PREVIEW_HEIGHT_TOLERANCE_MM = 0.5;

/** Name reported back to the UI in place of a real printer. */
const PREVIEW_PRINTER_LABEL = 'Browser preview (local test)';

/** Resolve once the tab has parsed the document. */
function whenDocumentReady(win: Window): Promise<void> {
  if (win.document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    win.addEventListener('load', () => resolve(), { once: true });
  });
}

/** Resolve once the logo has decoded and webfonts have settled. */
async function whenAssetsSettled(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );

  if (doc.fonts?.ready) await doc.fonts.ready;
}

/**
 * Preview-only stylesheet. It never touches the receipt's own rules - it only
 * pins the page itself to the paper roll:
 *
 *   - the document is exactly 80mm wide on screen and on paper, so the .invoice
 *     block inside it keeps the same 78mm width, spacing and table layout as
 *     the printed slip;
 *   - no page margins, so nothing is inset and no browser header/footer band
 *     is reserved.
 *
 * The `@page` height is filled in afterwards, once the content has been
 * measured, so the sheet is exactly as long as the receipt.
 */
const PREVIEW_LAYOUT_CSS = `
  html, body {
    width: 80mm;
    margin: 0 auto;
    padding: 0;
    background: #fff;
  }

  @media print {
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
    }
  }
`;

/**
 * Height of the rendered receipt, in millimetres.
 *
 * Measured off the receipt block itself, never off documentElement: in a real
 * tab documentElement.scrollHeight is at least the viewport height, which would
 * size the page to the browser window and print a mostly blank sheet.
 */
function measurePreviewHeightMm(doc: Document): number {
  const receipt = doc.querySelector<HTMLElement>('.invoice');

  const heightPx = Math.max(
    receipt ? Math.ceil(receipt.getBoundingClientRect().height) : 0,
    doc.body.scrollHeight,
    Math.ceil(doc.body.getBoundingClientRect().height),
  );

  if (!heightPx) throw new Error('Measured receipt height was zero');
  return heightPx / PX_PER_MM + PREVIEW_HEIGHT_TOLERANCE_MM;
}

function injectStyle(doc: Document, css: string): void {
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);
}

/**
 * LOCAL TESTING ONLY.
 *
 * Open an invoice in a new browser tab and send it to window.print().
 *
 * The tab renders the exact HTML that generateInvoiceHTML() produces - same
 * logo, fonts, spacing, table, borders, totals and footer as the download and
 * as the thermal slip. The only additions are the page-box rules above: 80mm
 * wide, zero margins, and a single page sized to the measured content, so the
 * result is one continuous slip with no blank tail.
 *
 * Resolves with the paper height that was used, in millimetres.
 */
export async function previewInvoice(sale: Sale, items: SaleItem[]): Promise<number> {
  const html = generateInvoiceHTML(sale, items);

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error(
      'The invoice preview was blocked by the browser. Allow pop-ups for this site and try again.',
    );
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  await whenDocumentReady(win);

  const doc = win.document;
  if (!doc.body) throw new Error('Invoice preview document unavailable');

  // Pin the page to 80mm first: the height must be measured at paper width.
  injectStyle(doc, PREVIEW_LAYOUT_CSS);

  await whenAssetsSettled(doc);

  // One frame, so the layout above has actually been applied before measuring.
  // A background tab throttles rAF, hence the timeout as a floor.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    win.requestAnimationFrame(finish);
    win.setTimeout(finish, 150);
  });

  const heightMm = measurePreviewHeightMm(doc);

  // A single page, exactly as tall as the receipt - this is what removes the
  // white space at the bottom and keeps everything on one continuous slip.
  injectStyle(doc, `@page { size: 80mm ${heightMm.toFixed(2)}mm; margin: 0; }`);

  win.focus();
  win.print();

  return heightMm;
}

/* ══════════════════════════════════════════════════════════════════════════
   PRODUCTION  ---  QZ Tray thermal printing (unchanged).
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Print an invoice directly to the 80mm thermal printer through QZ Tray.
 * No browser print dialog is involved. Rejects with a QzError the caller can
 * surface to the cashier.
 *
 * While IS_LOCAL_TEST is true this is routed to previewInvoice() instead, so
 * every existing caller (POS, invoice list, dashboard) keeps working on a
 * machine with no QZ Tray. Flip the flag to false and the QZ path below - and
 * the whole of ./qz.ts - is used exactly as before.
 */
export function printInvoice(
  sale: Sale,
  items: SaleItem[],
  options: { printerName?: string } = {},
): Promise<PrintReceiptResult> {
  // --- LOCAL TESTING ONLY ---
  if (IS_LOCAL_TEST) {
    return previewInvoice(sale, items).then((heightMm) => ({
      printer: PREVIEW_PRINTER_LABEL,
      heightMm,
      cut: false,
    }));
  }

  // --- PRODUCTION ---
  return printReceiptHtml(generateInvoiceHTML(sale, items), {
    printerName: options.printerName,
    jobName: `Invoice ${sale.invoice_number}`,
  });
}

/**
 * printInvoice for the plain buttons that have no error UI of their own: the
 * cashier gets an alert instead of a silently dropped receipt. Screens with
 * richer feedback should use printInvoice / useThermalPrinter directly.
 */
export async function printInvoiceWithAlert(
  sale: Sale,
  items: SaleItem[],
): Promise<boolean> {
  try {
    await printInvoice(sale, items);
    return true;
  } catch (err) {
    alert(`Could not print invoice ${sale.invoice_number}:\n${describePrintError(err)}`);
    return false;
  }
}

export { PAPER_WIDTH_MM };
