import { Sale, SaleItem } from "../types";
import { LOGO_DATA_URI } from "./logo";

/* ══════════════════════════════════════════════════════════════════════════
   80mm THERMAL RECEIPT PRINTING

   Printing goes through the browser's own print path - no QZ Tray, no native
   helper, nothing for the shop to install. The two things a browser normally
   gets wrong on a receipt printer are handled here:

     height  the receipt document measures itself and writes an @page rule as
             tall as its own content, so the roll is cut right after the last
             line rather than at the end of a fixed sheet. Capped, though: past
             MAX_PAGE_HEIGHT_MM the content runs onto a second page instead of
             asking for one page longer than a driver can print, because what a
             driver does with a page it cannot print is shrink it, and it
             shrinks the width by the same factor.
     width   the page box is the head's printable window rather than the full
             roll, and the receipt fills it. A page as wide as the paper is
             wider than the head can print, so the driver scales the whole slip
             down to fit - and that shrink is what made the text come out small
             with a band of blank paper down either side. Nothing in the receipt
             may widen that box, whatever it is asked to lay out, which is why
             the table is fixed-layout and the description column breaks words.

   Both numbers live in the constants below. They are the only knobs worth
   touching if a particular printer disagrees.
   ══════════════════════════════════════════════════════════════════════════ */

/** Roll sizes this receipt knows how to lay out, in millimetres. */
export type PaperWidthMm = 58 | 80;

/** Physical width of the paper roll, in millimetres. */
export const PAPER_WIDTH_MM: PaperWidthMm = 80;

/**
 * How much of each roll the print head actually covers, in millimetres.
 *
 * A roll is never fully printable: an 80mm roll gives 72mm (576 dots at 203dpi)
 * and a 58mm roll gives 48mm (384 dots), the rest being the dead margin the
 * paper guides need. Laying the receipt out any wider than the head means the
 * driver either clips the right edge or scales the whole page down to fit - the
 * second is what produced the shrunken, off-centre slips.
 */
const PRINTABLE_WIDTH_BY_PAPER: Record<PaperWidthMm, number> = { 58: 48, 80: 72 };

/**
 * Width of the printed block, in millimetres.
 *
 * Derived from the configured roll rather than written out, so switching the
 * shop to 58mm paper is the one-line change to PAPER_WIDTH_MM above and every
 * width below - page box, preview pane, PDF page - follows from it.
 */
export const CONTENT_WIDTH_MM = PRINTABLE_WIDTH_BY_PAPER[PAPER_WIDTH_MM];

/**
 * Width of the page box, in millimetres - the printable window, not the roll.
 *
 * This is the one number the driver reacts to. Sized to the paper instead, the
 * page is 80mm of which the head can only reach 72mm, so a driver that fits the
 * page to what it can print scales the entire slip to 90% - and a page that is
 * already only 90% ink (a 72mm block centred on 80mm) then lands as ~65mm of
 * print on a 72mm head, with the loss showing up as blank paper on both sides.
 * Set to the printable window, the fit is a no-op: no scaling, nothing to
 * centre, and no part of the page falls in the dead margin where it would be
 * clipped.
 */
export const PAGE_WIDTH_MM = CONTENT_WIDTH_MM;

/**
 * Side padding inside the page, in millimetres.
 *
 * Not a design margin - it is there because thermal paper wanders a little in
 * the guides, and a line of print starting on the head's very first dot column
 * loses its first character when it does. One millimetre is about the drift.
 */
const CONTENT_SIDE_PADDING_MM = 1;

/** 1mm in CSS pixels at 96dpi - the browser's fixed conversion. */
const PX_PER_MM = 96 / 25.4;

/**
 * Reference width in CSS pixels for on-screen previews (the page at 96dpi), so
 * a preview pane shows the slip at exactly the size it prints.
 */
export const RECEIPT_PREVIEW_WIDTH_PX = Math.round(PAGE_WIDTH_MM * PX_PER_MM);

/**
 * Width to give a frame that previews a receipt: the page plus room for the
 * frame's own vertical scrollbar. Sized to the page exactly, a long receipt
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

/**
 * Longest page box to ask a driver for, in millimetres.
 *
 * This is the number that keeps the slip the right width, which reads as a
 * contradiction until you see what a driver does with a page it cannot fit.
 *
 * A receipt printer left on a fixed sheet length - 297mm is the usual default,
 * and is what the shop's slips measure - reconciles our page box with its sheet
 * in one of two ways, neither of them what we asked for. A page shorter than the
 * sheet gets centred on it, which is the band of blank paper above and below a
 * three-item slip. A page longer than the sheet gets scaled down until it fits,
 * and that scale is uniform: a 480mm page on a 297mm sheet comes back at 62%,
 * so a 72mm-wide receipt lands as 44mm of print with 14mm of blank down either
 * side, in type a third smaller than the short slips printed at full size. That
 * is the whole of the "wide receipts get narrow when there are many products"
 * report - the width never grew, the height outgrew the sheet and took the
 * width down with it.
 *
 * So the page box is never allowed past this. Content that would exceed it is
 * split over however many pages it takes (see the sizing script), each one well
 * inside what the driver can print, so the fit is always a no-op and the width
 * is the same 72mm whether the invoice has one line or a hundred. Zero margins
 * mean consecutive pages abut, so on a roll the split is just more paper.
 *
 * Raise it if the printer is set to a longer sheet or to genuine continuous
 * feed; nothing here breaks if it is never reached, which for a normally
 * configured 80mm printer is every receipt up to roughly forty lines.
 */
export const MAX_PAGE_HEIGHT_MM = 297;

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
 * The page is content-tall right up until that would put it past
 * MAX_PAGE_HEIGHT_MM, at which point the content is spread over the fewest
 * pages that keeps each one under the cap - and spread evenly, so the last page
 * is as full as the first and the paper still ends just after the footer rather
 * than at the end of a final near-empty page. Splitting costs a little paper,
 * because nothing inside the receipt may break across a page and a row that
 * will not fit is pushed whole to the next one; `slackMm` below is that cost,
 * one pushed block per break, added before the page count is settled so the
 * split does not itself cause a spill onto an unplanned extra page.
 *
 * On a single page it also writes a print-only clamp, as a backstop for the day
 * a browser lays the receipt out fractionally taller than it measured: the page
 * box is already tall enough for the content, so anything past it can only be a
 * sliver, and clipping a sliver beats spilling it onto a second slip as long as
 * the receipt itself. Both selectors in that clamp are load-bearing - clamping
 * `body` alone does not stop Chrome paginating, and clamping `html` alone does
 * not either, while the pair does. The `max-height` on the receipt block is a
 * second mechanism that holds on its own if the pair ever stops. The clamp is
 * written only when the receipt fits on one page: pagination is the intended
 * outcome past the cap, and a clamp is precisely a thing that prevents it.
 */
function pageSizingScript(): string {
  return `
    (function () {
      var PAGE_MM = ${PAGE_WIDTH_MM};
      var TAIL_MM = ${PAGE_TAIL_MM};
      var MAX_MM = ${MAX_PAGE_HEIGHT_MM};
      var PX_PER_MM = 96 / 25.4;

      var pageStyle = document.createElement('style');
      pageStyle.id = 'receipt-page-size';
      document.head.appendChild(pageStyle);

      /*
        Height of the tallest thing that cannot be broken across a page, in
        millimetres - so, the most paper a single page break can waste.
      */
      function tallestUnbreakableMm(receipt) {
        var blocks = receipt.querySelectorAll('tbody tr, .totals .row, .returns-policy');
        var tallest = 0;

        for (var i = 0; i < blocks.length; i++) {
          var h = blocks[i].getBoundingClientRect().height;
          if (h > tallest) tallest = h;
        }

        return tallest / PX_PER_MM;
      }

      function sizePage() {
        var receipt = document.querySelector('.invoice');
        if (!receipt) return 0;

        var px = Math.max(receipt.getBoundingClientRect().height, receipt.scrollHeight);
        if (!px) return 0;

        var contentMm = px / PX_PER_MM + TAIL_MM;
        var pages = 1;
        var page = Math.ceil(contentMm);

        if (contentMm > MAX_MM) {
          var slackMm = tallestUnbreakableMm(receipt);

          /*
            Each break costs a pushed block, and paying for the breaks can call
            for another page, which is another break. Settle it rather than
            solve it: the second pass is over a page count that already carries
            the first pass's slack, and a third has never changed the answer.
          */
          for (var pass = 0; pass < 2; pass++) {
            pages = Math.ceil((contentMm + (pages - 1) * slackMm) / MAX_MM);
          }

          page = Math.ceil((contentMm + (pages - 1) * slackMm) / pages);
        }

        var css = '@page { size: ' + PAGE_MM + 'mm ' + page + 'mm; margin: 0; }';

        if (pages === 1) {
          css +=
            '@media print {' +
            '  html, body { height: ' + page + 'mm; overflow: hidden; }' +
            '  .invoice { max-height: ' + page + 'mm; overflow: hidden; }' +
            '}';
        }

        pageStyle.textContent = css;

        window.__receiptPageHeightMm = page;
        window.__receiptPageCount = pages;
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
      The receipt is laid out at its real printed size on screen as well as on
      paper - the print block at the foot restates those widths, it never
      changes one. That is what makes the measurement above trustworthy: the
      browser measures the very layout it is about to print, so the page can be
      sized to it exactly.
    */

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    /*
      Zero margins, so the slip starts at the head's first dot column instead of
      inside a margin the driver would have to scale the page down to honour.
      The page height is written by the sizing script; leaving it out here means
      that if the script ever fails to run, a roll printer falls back to its own
      continuous feed rather than to a fixed sheet with a long blank tail.
    */
    @page {
      margin: 0;
    }

    html,
    body {
      /* The page itself: the printable window of the head. max-width as well as
         width, so no amount of content can push the page wider than the head -
         a wider page is one the driver scales down, and that scale takes the
         type with it. */
      width: ${PAGE_WIDTH_MM}mm;
      max-width: ${PAGE_WIDTH_MM}mm;
      /* Not "0 auto": centring only matters when something is narrower than the
         page, and on paper that slack is the blank band down either side. */
      margin: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    img {
      max-width: 100%;
    }

    .invoice {
      /* Fills the page, edge to edge but for the drift allowance. */
      width: 100%;
      max-width: 100%;
      margin: 0;
      /*
        Less below than above: the header needs clearance from the tear edge,
        the footer does not, and every millimetre here is paper spent on every
        receipt the shop prints. PAGE_TAIL_MM is added under this again.
      */
      padding: 3mm ${CONTENT_SIDE_PADDING_MM}mm 1mm;
      /* On screen as well as on paper, so the preview cannot show a width the
         printed slip does not have. */
      overflow-x: hidden;
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
      No line of the receipt may be split down the middle by a page break.

      Applied to the individual blocks, never to the containers that hold them:
      a block that carries break-inside:avoid and does not fit is pushed whole
      onto the next page, so putting it on .invoice or on the table would push
      the entire receipt and leave the first page blank. That is also why it is
      the table rows that are listed and not the table - past the height cap a
      long receipt is meant to run over more than one page, and a table that
      refuses to break cannot.
    */
    .header,
    tr,
    td,
    th,
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
      /* Belt and braces with table-layout:fixed: a fixed table still reports a
         minimum width, and max-width is what stops that minimum being handed to
         the page as a new width. */
      max-width: 100%;
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
      The description is the only column that may wrap, and it has to wrap
      whatever it is given - a product name entered as one long unspaced string
      has no break opportunity for break-word to use, and would otherwise run
      out of its column and widen the page. "anywhere" differs from "break-word"
      in exactly the case that matters here: it also lets the cell report a
      narrow minimum width, so the name wraps down instead of the table pushing
      out.
    */
    tbody td:first-child {
      overflow-wrap: anywhere;
      word-break: break-word;
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

    /* Proportions, so they hold at whatever the printed width works out to.
       Tuned so a six-figure amount still fits on one line, with whatever is left
       over going to the description. */
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

    /*
      The print geometry, stated here as well as in the sizing script so it holds
      even if the script never runs or the job is started from the browser's own
      menu. Every rule below repeats the screen layout rather than changing it -
      no width differs between screen and paper, which is what keeps the height
      the script measures on screen true of the page it is about to print.
    */
    @media print {
      html,
      body {
        width: ${PAGE_WIDTH_MM}mm;
        max-width: ${PAGE_WIDTH_MM}mm;
        margin: 0;
        padding: 0;
      }

      .invoice {
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 3mm ${CONTENT_SIDE_PADDING_MM}mm 1mm;
        /*
          A cell wider than its column would widen the page, and a page wider
          than the head is scaled down to fit - taking the whole slip with it.
          Clipping one overlong value is the lesser failure, and with a fixed
          table layout and word breaking above there is nothing left to clip.
        */
        overflow-x: hidden;
      }

      table {
        width: 100%;
        max-width: 100%;
      }
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
    // Comfortably wider and taller than the receipt page, so nothing in the
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
 * Send receipt HTML to the printer: one continuous slip, as wide as the head
 * can print and exactly as tall as its content.
 *
 * Resolves with the page height that was used, in millimetres, once the print
 * dialog has been dealt with. That is the height of one page: a receipt past
 * the height cap is printed as more than one, and window.__receiptPageCount in
 * the receipt document says how many.
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
 * Print an invoice on the thermal printer.
 *
 * Resolves with the page height that was used, in millimetres.
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
