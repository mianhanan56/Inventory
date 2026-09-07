import { Sale, SaleItem } from '../types';
import { generateInvoiceHTML, printInvoice } from './invoices';
import { PAPER_WIDTH_MM, PrintRenderer, QzError, printReceiptHtml } from './qz';

/* ══════════════════════════════════════════════════════════════════════════
   WHERE A RECEIPT GOES

   One entry point for every slip the app prints, and it picks between two very
   different routes:

     thermal  QZ Tray -> raw bytes -> the printer's own cutter. There is no
              page: the head prints the bitmap line by line and the cut command
              follows the last one, so the paper is exactly as long as the sale.
              Nothing in the Windows print dialog - paper size, margins, scale,
              headers - can change that, because the dialog never opens.

     browser  window.print() on a hidden iframe, the old path, kept only as the
              safety net for a till where QZ Tray is not running. It asks the
              driver for a page and the driver decides what to feed, so the
              length is the driver's answer and not ours. That is the whole
              reason the thermal route exists; see the PAGE LENGTH comments in
              invoices.ts for what the browser route can and cannot promise.

   The route is never a preference. Thermal is used whenever it can be, and the
   browser route only after a QZ failure that provably printed nothing.
   ══════════════════════════════════════════════════════════════════════════ */

export type ReceiptRoute = 'thermal' | 'browser';

export interface PrintReceiptOutcome {
  route: ReceiptRoute;
  /** Printer the slip went to. Thermal route only. */
  printer?: string;
  /** Paper the slip used, in millimetres. Thermal route only. */
  heightMm?: number;
  /** True when the paper was cut right after the last line. */
  cut?: boolean;
  renderer?: PrintRenderer;
  /** Why the thermal route was not taken. Browser route only. */
  fallbackReason?: string;
}

/**
 * QZ failures that happen before any byte reaches the printer.
 *
 * Only these may fall through to the browser route: retrying after
 * 'print-failed' risks a second slip for a job that did in fact print, and a
 * duplicate receipt on a firearms sale is worse than a failed one.
 */
const NOTHING_PRINTED: ReadonlySet<string> = new Set([
  'not-running',
  'no-printer',
  'measure-failed',
]);

/**
 * Print a sale's receipt, thermal if QZ Tray is up and the browser otherwise.
 *
 * Throws when neither route worked; the outcome says which one did.
 */
export async function printSaleReceipt(
  sale: Sale,
  items: SaleItem[],
): Promise<PrintReceiptOutcome> {
  /*
   * Always the narrow page for the thermal route.
   *
   * generateInvoiceHTML() would otherwise widen the page past 15 items - a rule
   * that exists purely to make a print driver shrink the page back down onto
   * 80mm of paper. There is no driver here to shrink anything: the bitmap is
   * rasterised at the head's own 203dpi and lands on its dots one for one, so a
   * page wider than the paper would simply be a receipt wider than the paper.
   */
  const html = generateInvoiceHTML(sale, items, PAPER_WIDTH_MM);

  try {
    const printed = await printReceiptHtml(html, {
      jobName: `Invoice ${sale.invoice_number}`,
    });

    return {
      route: 'thermal',
      printer: printed.printer,
      heightMm: printed.heightMm,
      cut: printed.cut,
      renderer: printed.renderer,
    };
  } catch (err) {
    if (!(err instanceof QzError) || !NOTHING_PRINTED.has(err.code)) {
      throw err;
    }

    await printInvoice(sale, items);

    return { route: 'browser', fallbackReason: err.message };
  }
}
