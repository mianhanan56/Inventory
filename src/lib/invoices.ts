import { Sale, SaleItem } from "../types";
import { LOGO_DATA_URI } from "./logo";

/* ══════════════════════════════════════════════════════════════════════════
   80mm THERMAL RECEIPT PRINTING

   Printing goes through the browser's own print path - no QZ Tray, no native
   helper, nothing for the shop to install. The two things a browser normally
   gets wrong on a receipt printer are handled here:

     height  the receipt document measures itself and writes an @page rule as
             tall as its own content, so the roll is cut right after the last
             line and a long slip is never split across pages.
     width   the content is a fixed 72mm block centred on an 80mm page, which
             is the printable window of every common 80mm thermal head. Content
             wider than that gets shrunk by the driver to fit, which is what
             makes the text come out small and the layout look squeezed.

   Both numbers live in the constants below. They are the only knobs worth
   touching if a particular printer disagrees.
   ══════════════════════════════════════════════════════════════════════════ */

/** Physical width of the paper roll, in millimetres. This is the page width. */
export const PAPER_WIDTH_MM = 80;

/**
 * Width of the printed block, in millimetres.
 *
 * An 80mm roll is not 80mm of printable paper: the head covers 72mm (576 dots
 * at 203dpi) and the rest is the dead margin the paper guides need. Laying the
 * receipt out any wider than the head means the driver either clips the right
 * edge or scales the whole page down to fit - the second is what produced the
 * shrunken, off-centre slips.
 */
export const CONTENT_WIDTH_MM = 72;

/** 1mm in CSS pixels at 96dpi - the browser's fixed conversion. */
const PX_PER_MM = 96 / 25.4;

/**
 * Reference width in CSS pixels for on-screen previews (80mm at 96dpi), so a
 * preview pane shows the slip at exactly the size it prints.
 */
export const RECEIPT_PREVIEW_WIDTH_PX = Math.round(PAPER_WIDTH_MM * PX_PER_MM);

/**
 * Width to give a frame that previews a receipt: the paper plus room for the
 * frame's own vertical scrollbar. Sized to the paper exactly, a long receipt
 * would gain a scrollbar, lose that much of its content area, and pick up a
 * horizontal scrollbar as well.
 */
export const RECEIPT_PREVIEW_FRAME_WIDTH_PX = RECEIPT_PREVIEW_WIDTH_PX + 18;

/**
 * Slack added below the last line, in millimetres.
 *
 * The page is sized from the on-screen layout and Chrome lays the document out
 * again to paginate it, so the two could in principle disagree. Measured across
 * 1 to 120 items they do not: the gap under the last line stays constant to
 * within half a millimetre, which is just the rounding up to whole millimetres.
 * So this is a flat cushion, not a per-line one - a share of the content height
 * would only spend paper in proportion to how long the receipt already is.
 */
const PAGE_TAIL_MM = 2;

/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT DOCUMENT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The self-sizing part of the receipt, inlined into the document.
 *
 * It has to live in the document rather than in the app: the same markup is
 * printed from a hidden frame, shown in the preview pane, and downloaded as a
 * standalone .html file, and only the document itself knows how tall it ended
 * up in the browser that is about to print it.
 *
 * Only `.invoice` is measured. `document.body.scrollHeight` is never smaller
 * than the viewport, so measuring the body would size the page to the window
 * and print a mostly blank sheet.
 *
 * Alongside the `@page` rule it writes a print-only clamp, as a backstop for
 * the day a browser lays the receipt out fractionally taller than it measured:
 * the page box is already tall enough for the content, so anything past it can
 * only be a sliver, and clipping a sliver beats spilling it onto a second slip
 * as long as the receipt itself. Both selectors in that clamp are load-bearing
 * - clamping `body` alone does not stop Chrome paginating, and clamping `html`
 * alone does not either, while the pair does. The `max-height` on the receipt
 * block is a second mechanism that holds on its own if the pair ever stops.
 */
function pageSizingScript(): string {
  return `
    (function () {
      var PAPER_MM = ${PAPER_WIDTH_MM};
      var TAIL_MM = ${PAGE_TAIL_MM};
      var PX_PER_MM = 96 / 25.4;

      var pageStyle = document.createElement('style');
      pageStyle.id = 'receipt-page-size';
      document.head.appendChild(pageStyle);

      function sizePage() {
        var receipt = document.querySelector('.invoice');
        if (!receipt) return 0;

        var px = Math.max(receipt.getBoundingClientRect().height, receipt.scrollHeight);
        if (!px) return 0;

        var page = Math.ceil(px / PX_PER_MM + TAIL_MM);

        pageStyle.textContent =
          '@page { size: ' + PAPER_MM + 'mm ' + page + 'mm; margin: 0; }' +
          // One page, always.
          '@media print {' +
          '  html, body { height: ' + page + 'mm; overflow: hidden; }' +
          '  .invoice { max-height: ' + page + 'mm; overflow: hidden; }' +
          '}';

        window.__receiptPageHeightMm = page;
        return page;
      }

      window.__sizeReceiptPage = sizePage;

      sizePage();
      window.addEventListener('load', sizePage);
      // The logo and any webfont settle after load and change the height.
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizePage);
      // Last chance, for a print triggered straight from the browser menu.
      window.addEventListener('beforeprint', sizePage);
    })();
  `;
}

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
      The receipt is laid out at its real paper size on screen as well as on
      paper - no @media print rule changes any width. That is what makes the
      measurement above trustworthy: the browser measures the very layout it
      is about to print, so the page can be sized to it exactly.
    */

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html,
    body {
      /* The page itself: the full width of the roll. */
      width: ${PAPER_WIDTH_MM}mm;
      margin: 0 auto;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    img {
      max-width: 100%;
    }

    .invoice {
      /* The printable window of an 80mm head, centred on the roll. */
      width: ${CONTENT_WIDTH_MM}mm;
      margin: 0 auto;
      padding: 3mm 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.2;
      /* Crisper glyphs on a thermal head than a heavier weight would give:
         no anti-aliasing to smear, and exact glyph geometry. */
      font-weight: 500;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: none;
    }

    /*
      Nothing inside the receipt may break across pages. Deliberately not
      applied to .invoice itself: a block that carries break-inside:avoid and
      still does not fit gets pushed whole onto the next page, which would
      leave the first slip blank.
    */
    .header,
    table,
    thead,
    tbody,
    tr,
    td,
    th,
    .totals,
    .totals .row,
    .returns-policy {
      page-break-inside: avoid;
      break-inside: avoid;
      break-before: auto;
      break-after: auto;
    }

    /* A repeated column header could only appear on a spilled page; make the
       head a plain row group so it can never be duplicated. */
    thead {
      display: table-row-group;
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
      font-size: 22px;
      font-weight: 700;
    }

    .company-info p {
      color: #000;
      font-size: 11px;
      margin-top: 2px;
    }

    .company-info .meta-date {
      font-size: 11px;
      margin-top: 4px;
      white-space: nowrap;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      table-layout: fixed;
    }

    /* Smaller and tighter than the rows: the labels are longer than the values
       they sit above, and "QTY" has to fit a column only wide enough for a
       two-digit number. */
    thead th {
      background: #fff;
      color: #000;
      padding: 4px 1px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      border-bottom: 2px solid #000;
      overflow-wrap: break-word;
    }

    thead th:nth-child(n + 2) {
      text-align: right;
    }

    tbody td {
      padding: 4px 2px;
      font-size: 13px;
      overflow-wrap: break-word;
    }

    /*
      Every column but the description holds a number. They are right-aligned
      and must never wrap: an amount broken over two lines ("R" above
      "1 049,99") is both ugly and a line of extra paper per item.
    */
    tbody td:nth-child(n + 2) {
      text-align: right;
      font-size: 11px;
      white-space: nowrap;
    }

    /* Tuned at ${CONTENT_WIDTH_MM}mm so a six-figure amount still fits on one
       line, with whatever is left over going to the description. */
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
      width: 23%;
    }

    th:nth-child(4),
    td:nth-child(4) {
      width: 9%;
    }

    th:nth-child(5),
    td:nth-child(5) {
      width: 27%;
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

    .totals .row span:last-child {
      white-space: nowrap;
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
      font-size: 11px;
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

  <script>${pageSizingScript()}</script>

</body>

</html>
`;
}

/* ══════════════════════════════════════════════════════════════════════════
   PRINTING
   ══════════════════════════════════════════════════════════════════════════ */

/** How long to wait for the receipt document to parse before giving up. */
const LOAD_TIMEOUT_MS = 10000;

/**
 * How long the print frame stays alive if `afterprint` never arrives. Some
 * browsers skip the event; tearing the frame down early would cancel a job the
 * operator has already confirmed, so this only exists to stop the frame leaking.
 * Long enough that a cashier who walks away mid-dialog still gets their slip.
 */
const FRAME_LIFETIME_MS = 600000;

/** Grace period after `afterprint` so the job is fully spooled before teardown. */
const TEARDOWN_DELAY_MS = 1000;

export class PrintError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PrintError";
    this.cause = cause;
  }
}

/** Resolve once the logo has decoded and any webfonts have settled. */
async function whenAssetsSettled(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );

  if (doc.fonts?.ready) await doc.fonts.ready;
}

/** Resolve after one painted frame, so the layout above has been applied. */
function nextFrame(win: Window): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    win.requestAnimationFrame(finish);
    // A backgrounded tab throttles rAF; this is the floor.
    win.setTimeout(finish, 150);
  });
}

/**
 * Create an off-screen frame holding the receipt, laid out and settled.
 *
 * A frame rather than a new tab: a tab needs the pop-up blocker to cooperate,
 * leaves an `about:blank` header and footer across the top of the slip, and
 * strands a window the cashier then has to close. The frame is positioned off
 * screen rather than hidden, because a frame with `display:none` is never laid
 * out and a frame with `visibility:hidden` prints blank in some browsers.
 */
async function mountReceiptFrame(html: string): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.title = "Receipt";
  frame.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    // Comfortably wider and taller than the 80mm page, so nothing in the
    // frame's own viewport reflows the receipt or adds a scrollbar.
    "width:150mm",
    "height:400mm",
    "border:0",
    "pointer-events:none",
  ].join(";");

  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new PrintError("The receipt took too long to render.")),
        LOAD_TIMEOUT_MS,
      );
      frame.onload = () => {
        // Appending the frame can queue a load event for the `about:blank`
        // document it starts on, which would otherwise resolve this before the
        // receipt exists. Wait for the load that actually carries the receipt.
        if (!frame.contentDocument?.querySelector(".invoice")) return;
        window.clearTimeout(timer);
        resolve();
      };
      frame.srcdoc = html;
    });

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new PrintError("The receipt document could not be opened.");

    await whenAssetsSettled(doc);
    await nextFrame(win);

    return frame;
  } catch (err) {
    frame.remove();
    throw err;
  }
}

/**
 * Lay the receipt out off screen, hand the settled document to `read`, then
 * tear the frame down. For callers that only need to look at the receipt -
 * measuring or rasterising it - rather than print it.
 */
export async function withReceiptDocument<T>(
  html: string,
  read: (doc: Document) => T | Promise<T>,
): Promise<T> {
  const frame = await mountReceiptFrame(html);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new PrintError("The receipt document could not be opened.");
    return await read(doc);
  } finally {
    frame.remove();
  }
}

/**
 * Send receipt HTML to the printer: one continuous slip, 80mm wide, exactly as
 * tall as its content.
 *
 * Resolves with the page height that was used, in millimetres, once the print
 * dialog has been dealt with.
 */
export async function printReceiptHtml(html: string): Promise<number> {
  const frame = await mountReceiptFrame(html);
  const win = frame.contentWindow;

  if (!win) {
    frame.remove();
    throw new PrintError("The receipt document could not be opened.");
  }

  // The document sizes its own page; re-run it now that the logo has decoded,
  // so the page box matches the layout that is about to be printed.
  const sizePage = (win as Window & { __sizeReceiptPage?: () => number }).__sizeReceiptPage;
  const heightMm = sizePage ? sizePage() : 0;

  let removed = false;
  const teardown = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };

  /*
    Teardown is deliberately not tied to this promise resolving. Chrome blocks
    inside print() until the dialog is dismissed, but not every browser does -
    and removing the frame while its dialog is still open cancels the job or
    spools a blank page. So the frame outlives the call and is dropped on
    afterprint, with a long stop so it cannot leak if that event never comes.
  */
  win.addEventListener("afterprint", () => window.setTimeout(teardown, TEARDOWN_DELAY_MS), {
    once: true,
  });
  window.setTimeout(teardown, FRAME_LIFETIME_MS);

  try {
    // Firefox and Safari will not print a frame that does not hold focus.
    win.focus();
    win.print();
  } catch (err) {
    teardown();
    throw new PrintError("The browser refused to open the print dialog.", err);
  }

  return heightMm;
}

/**
 * Print an invoice on the 80mm thermal printer.
 *
 * Resolves with the paper height that was used, in millimetres.
 */
export function printInvoice(sale: Sale, items: SaleItem[]): Promise<number> {
  return printReceiptHtml(generateInvoiceHTML(sale, items));
}

/** Human-readable message for anything thrown by this module. */
export function describePrintError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Printing failed for an unknown reason.";
}

/**
 * printInvoice for the plain buttons that have no error UI of their own.
 *
 * Only a genuine failure to open the print dialog is reported - the ordinary
 * path, including the cashier cancelling the dialog, is silent.
 */
export async function printInvoiceWithAlert(
  sale: Sale,
  items: SaleItem[],
): Promise<boolean> {
  try {
    await printInvoice(sale, items);
    return true;
  } catch (err) {
    console.error(`Could not print invoice ${sale.invoice_number}`, err);
    alert(`Could not print invoice ${sale.invoice_number}:\n${describePrintError(err)}`);
    return false;
  }
}
