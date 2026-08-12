import { Sale, SaleItem } from "../types";
import { LOGO_DATA_URI } from "./logo";

/* ══════════════════════════════════════════════════════════════════════════
   THERMAL RECEIPT PRINTING

   WIDTH:
   The invoice uses the full printable width of whatever paper the selected
   printer is configured for. The browser cannot ask an arbitrary printer
   driver "how wide is your roll" - that number simply isn't exposed by the
   platform. DEFAULT_PAPER_WIDTH_MM is therefore the one place that value
   lives; it is a configured expectation (matching the roll the client has
   loaded today), not something baked into the layout. Call
   setThermalPaperWidthMm() to change it at runtime (e.g. from a future
   settings screen) without touching this file again.

   HEIGHT:
   The receipt height is calculated dynamically from the actual rendered
   content and written into an @page rule (see pageSizingScript() below), so
   window.print() sends the printer one continuously-sized page instead of a
   paginated document.

   PRINTING:
   Printing goes through the browser's own print dialog on a hidden iframe -
   no extra software (QZ Tray or otherwise) needs to be installed on the
   till. Whatever printer is already reachable from the OS is picked in that
   dialog, the same as printing any other web page.

   ── THE PRINT DIALOG IS PART OF THIS LAYOUT ───────────────────────────────

   A page cannot set the browser's own print scale, margins or paper choice;
   those are the operator's, deliberately out of reach of any script, which is
   also why no library could ever have fixed the narrow print from in here.
   The sizing below is therefore written against a fixed set of dialog
   settings, confirmed with the client and set once per PC (Chrome remembers
   them per destination):

     Scale                100%  (the custom box - NOT "Default", which is
                                "fit to printable area" and is what shrank an
                                80mm page to 72mm, taking the width with it)
     Margins              None  (Chrome's own margin, on top of ours, also
                                triggers that same shrink)
     Paper size           80 x 3276mm  /  Roll Paper  /  Receipt
                                (a short form such as A4 or 80 x 297mm makes
                                a long slip tile across sheets, because at
                                100% the driver no longer squashes it to fit)
     Background graphics  On    (off drops the grey header and totals bands)
     Headers and footers  Off   (on prints the URL, date and "1/1" on the roll)
     Layout               Portrait

   With those in force nothing between here and the paper rescales the page,
   so the millimetres written below are the millimetres printed - and the two
   numbers that matter are DRIVER_PAPER_LENGTH_MM (must match the paper size
   above) and PAPER_WIDTH_MM / SIDE_MARGIN_MM (the 72mm ink band).
   ══════════════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────────────────
   PAGE WIDTH

   The page is the paper: 80mm, the size the client's printer is set to.

   The ink is narrower, and on purpose. The roll is 80mm but the head of an
   80mm unit spans 576 dots at 8 dots/mm = 72mm, the paper guides covering the
   ~4mm each side - measured on the client's Xprinter XP-Q200 and true of the
   class. So the page is the full 80mm and SIDE_MARGIN_MM holds the printed
   block to the middle 72mm, which puts the ink exactly on the dots the head
   has and the blank exactly where it has none. That is the whole of the paper
   it is possible to print on.

   Do not "fix" this by making the page 72mm. It looks equivalent and is not:
   an 80mm form with a 72mm page leaves the driver to place a page smaller than
   its paper, and Chrome at margins-none measures from the paper edge, so the
   left 4mm of the receipt lands under the guide and is lost. Page = form,
   margins = the head's dead zone. Both numbers describe the hardware; neither
   is a preference.
   ────────────────────────────────────────────────────────────────────────── */

/** The paper the client prints on, and the page size the CSS is written to. */
export const PAPER_WIDTH_MM = 80;

/**
 * Clear paper down each side, as page padding inside the 80mm page.
 *
 * 4mm keeps the ink band at 72mm, which is the span of the head on a standard
 * 80mm unit, so nothing sits in the strip under the paper guides where a printer
 * cannot lay ink down. It is spacing on a full-width page, not a narrower page.
 */
export const SIDE_MARGIN_MM = 4;

/** Page width used until setThermalPaperWidthMm() says otherwise. */
export const DEFAULT_PAPER_WIDTH_MM = PAPER_WIDTH_MM;

/** Width of the printed block inside the page. */
export function receiptContentWidthMm(pageWidthMm: number = getThermalPaperWidthMm()): number {
  return pageWidthMm - 2 * SIDE_MARGIN_MM;
}

/** Kept for compatibility with existing imports. */
export const CONTENT_WIDTH_MM = DEFAULT_PAPER_WIDTH_MM;

/** Sanity bounds for the override: narrower stops fitting the table, wider than
 *  the roll cannot be printed at all. */
const MIN_PAPER_WIDTH_MM = 50;
const MAX_PAPER_WIDTH_MM = PAPER_WIDTH_MM;

/**
 * The page width used for printing, previewing and PDF export.
 *
 * Deliberately not persisted anywhere: a stored value would silently outlive a
 * change to the default and leave one machine printing at a width nobody chose.
 */
let thermalPaperWidthMm: number = DEFAULT_PAPER_WIDTH_MM;

export function getThermalPaperWidthMm(): number {
  return thermalPaperWidthMm;
}

/** Override the print width in mm, or pass null to go back to the default. */
export function setThermalPaperWidthMm(mm: number | null): void {
  if (mm === null) {
    thermalPaperWidthMm = DEFAULT_PAPER_WIDTH_MM;
    return;
  }
  if (!Number.isFinite(mm)) return;
  thermalPaperWidthMm = Math.min(MAX_PAPER_WIDTH_MM, Math.max(MIN_PAPER_WIDTH_MM, mm));
}

/** 1mm in CSS pixels at 96dpi. */
const PX_PER_MM = 96 / 25.4;

/**
 * Width of the receipt in CSS pixels, at the current print width. A function
 * rather than a constant because the print width is now adjustable, and the
 * preview and the PDF both have to follow it.
 */
export function receiptWidthPx(widthMm: number = getThermalPaperWidthMm()): number {
  return Math.round(widthMm * PX_PER_MM);
}

/** Room for the preview frame's own scrollbar, so nothing gets clipped. */
const PREVIEW_SCROLLBAR_ALLOWANCE_PX = 18;

/** Width to give a frame previewing the receipt. */
export function receiptFrameWidthPx(widthMm?: number): number {
  return receiptWidthPx(widthMm) + PREVIEW_SCROLLBAR_ALLOWANCE_PX;
}

/**
 * Small amount of space after the final line.
 *
 * DO NOT change this.
 */
const PAGE_TAIL_MM = 2;

/* ──────────────────────────────────────────────────────────────────────────
   PAGE LENGTH  ---  one page, as long as the listing, and never scaled.

   Three things have to hold at once, and only one order of operations gets all
   three:

     one page          - never split, whatever the item count
     paper used = list - the slip is as long as its content, no blank tail
     true width        - the ink spans the page, not a shrunken copy of it

   The trap is that a page longer than the driver's paper does not print long.
   Left on Chrome's default scale the driver shrinks it to fit, and shrinking is
   uniform, so the width goes with it - a 625mm page squeezed onto 297mm paper
   prints 70mm of content as ~33mm of ink. That is where the white margins down
   both sides came from, and it had nothing to do with which printer was
   attached, which is why a second printer on a second PC did it too. At 100%
   scale the driver stops shrinking, and the same overflow tiles across sheets
   instead. Either way the fault is one page longer than the paper, so the fix
   is the same: don't ask for one.

   So the length of the paper is stated here, and the receipt is fitted to it in
   the browser rather than left to the driver. Anything shorter is printed
   untouched at full size, and the page is cut exactly to the content so no
   paper is wasted. Only a receipt too long for the roll itself is scaled, and
   then DOWN VERTICALLY AND HORIZONTALLY TOGETHER with the page width held at
   full width - the layout is widened by the same factor it is scaled by, so the
   ink still reaches both edges.

   IF LONG RECEIPTS EVER COME OUT SMALL AGAIN, this pair of numbers is why: the
   paper size selected in the driver has to match DRIVER_PAPER_LENGTH_MM. The
   Xprinter XP-Q200 the client runs offers a 3276mm roll form, which is ~320
   line items - past any real till slip, so in practice nothing is ever scaled.
   Selecting a short form instead (80 x 297mm) without lowering this number is
   the one combination that tiles.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Length of the paper form selected in the printer driver.
 *
 * MUST match Printing preferences -> Paper size. 3276mm is the roll length the
 * Xprinter 80mm drivers expose (listed as `80 x 3276mm`, `Roll Paper` or
 * `Receipt`); it is a maximum the driver truncates to the actual page, not a
 * length it feeds. If a driver is ever set to a short form instead, put that
 * form's length here - 297 for `80 x 297mm` - and long slips go back to being
 * scaled onto one page rather than tiled across several.
 */
const DRIVER_PAPER_LENGTH_MM = 3276;

/**
 * Longest page that may be asked for. The paper length itself: there is nothing
 * to gain by staying under it, and every millimetre below it is type the
 * everyday receipt would have been shrunk by for no reason.
 */
const MAX_PAGE_HEIGHT_MM = DRIVER_PAPER_LENGTH_MM;

/**
 * How far the receipt may be shrunk to win a single page.
 *
 * Unreachable against a 3276mm roll and meant to stay that way - it is the
 * backstop for a driver set to a short form. Below 0.5 the type stops being
 * readable off a thermal head, so a receipt too long even at this floor is left
 * here and allowed to run over: a legible slip that tiles beats an illegible
 * one that doesn't.
 */
const MIN_FIT_SCALE = 0.5;


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT PAGE HEIGHT
   ══════════════════════════════════════════════════════════════════════════ */

function pageSizingScript(widthMm: number): string {
  return `
    (function () {

      var PAPER_MM = ${widthMm};
      var SIDE_MM = ${SIDE_MARGIN_MM};
      var CONTENT_MM = ${receiptContentWidthMm(widthMm)};
      var TAIL_MM = ${PAGE_TAIL_MM};
      var MAX_PAGE_MM = ${MAX_PAGE_HEIGHT_MM};
      var MIN_SCALE = ${MIN_FIT_SCALE};
      var PX_PER_MM = 96 / 25.4;

      var pageStyle = document.createElement('style');
      pageStyle.id = 'receipt-page-size';
      document.head.appendChild(pageStyle);

      /*
       * Shrink the receipt by 'k' while keeping it full width.
       *
       * The layout is widened by exactly the factor it is then scaled down by,
       * so the ink still lands on both edges of the page - only the height
       * comes down. transform is used rather than zoom because it leaves the
       * glyph shapes alone; the page height is taken from the transformed box
       * below, so the shorter result is what the paper is cut to.
       *
       * Written as an inline style, not a stylesheet: the receipt's own rules
       * set .invoice width at the same specificity, including inside its @media
       * print block, so a rule here would be a coin toss on source order - and
       * losing it silently means the fit shrinks the height without widening the
       * layout, which is precisely the narrow print this exists to prevent.
       */
      function applyFit(k) {
        var receipt = document.querySelector('.invoice');
        if (!receipt) return;

        if (k >= 1) {
          receipt.style.width = '';
          receipt.style.maxWidth = '';
          receipt.style.transform = '';
          receipt.style.transformOrigin = '';
          return;
        }

        /* Widen the printed block, not the page: the side spacing lives on the
           body, outside the transform, so it stays a true 4mm at any scale. */
        receipt.style.width = (CONTENT_MM / k) + 'mm';
        receipt.style.maxWidth = 'none';
        receipt.style.transform = 'scale(' + k + ')';
        receipt.style.transformOrigin = 'top left';
      }


      /* Height as it will appear on paper, in mm. getBoundingClientRect
         reports the transformed box, which is exactly what is wanted here. */
      function renderedHeightMm() {
        var receipt = document.querySelector('.invoice');
        if (!receipt) return 0;
        return receipt.getBoundingClientRect().height / PX_PER_MM;
      }


      function sizePage() {

        if (!document.querySelector('.invoice')) {
          return 0;
        }

        /*
         * Fit to one page. Nothing is scaled unless the receipt is longer than
         * paper supports, so an everyday slip is untouched.
         */
        applyFit(1);

        var heightMm = renderedHeightMm();
        if (!heightMm) return 0;

        var k = 1;

        function fits(mm) {
          return mm + TAIL_MM <= MAX_PAGE_MM;
        }

        if (!fits(heightMm)) {
          /*
           * Search for the LARGEST scale that still fits, rather than the first
           * one that does.
           *
           * Height does not fall in step with the scale: widening the layout
           * also makes the descriptions wrap less, so each shrink buys more room
           * than arithmetic predicts. Taking the first fit therefore overshoots
           * badly - a 39-item slip landed at 185mm of a 280mm page, i.e. type a
           * third smaller than it needed to be. Bisection spends the whole page.
           */
          var lo = MIN_SCALE;
          var hi = 1;

          applyFit(lo);
          var floorHeight = renderedHeightMm();

          if (!fits(floorHeight)) {
            // Too long even at the floor: stay legible and let it run over.
            k = lo;
            heightMm = floorHeight;
          } else {
            for (var i = 0; i < 8; i++) {
              var mid = (lo + hi) / 2;
              applyFit(mid);
              if (fits(renderedHeightMm())) {
                lo = mid;
              } else {
                hi = mid;
              }
            }
            k = lo;
            applyFit(k);
            heightMm = renderedHeightMm();
          }
        }

        /* The page is the receipt: exactly as long as what is on it, so the
           paper used matches the listing and there is no blank tail. */
        var page = Math.ceil(heightMm + TAIL_MM);


        pageStyle.textContent =
          '@page {' +
          '  size: ' + PAPER_MM + 'mm ' + page + 'mm;' +
          '  margin: 0;' +
          '}' +

          '@media print {' +

          /* One page, always - the height is already the whole receipt, so
             anything past it can only be a rounding sliver.
             The side padding is restated here: zeroing it would print the
             receipt hard against both paper edges, in the strip the head
             cannot reach. */
          '  html, body {' +
          '    width: ' + PAPER_MM + 'mm;' +
          '    height: ' + page + 'mm;' +
          '    overflow: hidden;' +
          '    margin: 0;' +
          '    padding: 0;' +
          '  }' +

          '  body { padding: 0 ' + SIDE_MM + 'mm; }' +

          '}';


        window.__receiptPageHeightMm = page;
        window.__receiptFitScale = k;

        return page;
      }


      window.__sizeReceiptPage = sizePage;


      /*
       * Initial measurement.
       */
      sizePage();


      /*
       * Recalculate after the document loads.
       */
      window.addEventListener(
        'load',
        sizePage
      );


      /*
       * Recalculate after fonts are ready.
       */
      if (
        document.fonts &&
        document.fonts.ready
      ) {
        document.fonts.ready.then(sizePage);
      }


      /*
       * Final measurement immediately before printing.
       */
      window.addEventListener(
        'beforeprint',
        sizePage
      );

    })();
  `;
}


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT DOCUMENT
   ══════════════════════════════════════════════════════════════════════════ */

export function generateInvoiceHTML(
  sale: Sale,
  items: SaleItem[],
  widthMm: number = getThermalPaperWidthMm(),
) {

  const fmt = (v: number) =>
    `R ${v.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;


  const stamp =
    sale.created_at
      ? new Date(sale.created_at)
      : new Date();


  const saleDate =
    stamp.toLocaleDateString(
      "en-ZA",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      },
    );


  const saleTime =
    stamp.toLocaleTimeString(
      "en-ZA",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
    );


  const saleStamp =
    `Date: ${saleDate} | Time: ${saleTime}`;


  return `
<!DOCTYPE html>

<html>

<head>

  <meta charset="UTF-8" />

  <title>
    Invoice ${sale.invoice_number}
  </title>


  <style>

    /* ═════════════════════════════════════════════════════════════════════
       RESET
       ══════════════════════════════════════════════════════════════════ */

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }


    /* ═════════════════════════════════════════════════════════════════════
       PAGE
       ══════════════════════════════════════════════════════════════════ */

    html,
    body {

      /*
       * The page is the paper: 80mm. The side spacing is padding inside it
       * (box-sizing is border-box, so the page stays 80mm), which keeps it
       * outside the fit transform and therefore a true 4mm at any scale.
       */
      width: ${widthMm}mm;

      margin: 0 auto;

      background: #fff;

      -webkit-print-color-adjust: exact;

      print-color-adjust: exact;
    }


    /*
     * Side spacing, on the body alone.
     *
     * Never on html as well: html and body nest, so the same padding on both
     * insets the receipt twice on the left and pushes it off the right edge.
     */
    body {
      padding: 0 ${SIDE_MARGIN_MM}mm;
    }


    /*
     * Initial @page.
     *
     * pageSizingScript() replaces this with the exact dynamic height
     * before printing.
     */
    @page {

      size: ${widthMm}mm auto;

      margin: 0;
    }


    /* ═════════════════════════════════════════════════════════════════════
       IMAGES
       ══════════════════════════════════════════════════════════════════ */

    img {
      max-width: 100%;
    }


    /* ═════════════════════════════════════════════════════════════════════
       INVOICE
       ══════════════════════════════════════════════════════════════════ */

    .invoice {

      /* Fills the page inside its side spacing. */
      width: ${receiptContentWidthMm(widthMm)}mm;

      max-width: ${receiptContentWidthMm(widthMm)}mm;

      margin: 0 auto;

      padding: 3mm 0;

      font-family:
        Arial,
        Helvetica,
        sans-serif;

      color: #000;

      background: #fff;

      line-height: 1.2;

      font-weight: 500;

      text-rendering: geometricPrecision;

      -webkit-font-smoothing: none;
    }


    /* ═════════════════════════════════════════════════════════════════════
       PAGE BREAK CONTROL
       ══════════════════════════════════════════════════════════════════ */

    /*
     * Keep individual rows together.
     *
     * Do NOT put break-inside: avoid on the entire table because a very
     * large table could then be moved as a whole to another page.
     */
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }


    .header,
    .totals,
    .totals .row,
    .returns-policy {

      page-break-inside: avoid;

      break-inside: avoid;

      break-before: auto;

      break-after: auto;
    }


    /*
     * Do not create repeated table headers.
     */
    thead {
      display: table-row-group;
    }


    /* ═════════════════════════════════════════════════════════════════════
       HEADER
       ══════════════════════════════════════════════════════════════════ */

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


    /* ═════════════════════════════════════════════════════════════════════
       TABLE
       ══════════════════════════════════════════════════════════════════ */

    table {

      width: 100%;

      border-collapse: collapse;

      margin-bottom: 8px;

      table-layout: fixed;
    }


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


    tbody td:nth-child(n + 2) {

      text-align: right;

      font-size: 11px;

      white-space: nowrap;
    }


    /* ═════════════════════════════════════════════════════════════════════
       TABLE COLUMNS
       ══════════════════════════════════════════════════════════════════ */

    th:nth-child(1),
    td:nth-child(1) {
      width: 40%;
    }


    th:nth-child(2),
    td:nth-child(2) {
      /* Wide enough for the "QTY" heading; below this it wraps to "QT/Y". */
      width: 9%;
    }


    th:nth-child(3),
    td:nth-child(3) {
      width: 20%;
    }


    th:nth-child(4),
    td:nth-child(4) {
      width: 9%;
    }


    th:nth-child(5),
    td:nth-child(5) {
      width: 22%;
    }


    /* ═════════════════════════════════════════════════════════════════════
       TOTALS
       ══════════════════════════════════════════════════════════════════ */

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


    /* ═════════════════════════════════════════════════════════════════════
       RETURN POLICY
       ══════════════════════════════════════════════════════════════════ */

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


    /* ═════════════════════════════════════════════════════════════════════
       PRINT
       ══════════════════════════════════════════════════════════════════ */

    @media print {

      html,
      body {

        width: ${widthMm}mm;

        margin: 0;

        padding: 0;
      }


      body {
        padding: 0 ${SIDE_MARGIN_MM}mm;
      }


      .invoice {

        width: ${receiptContentWidthMm(widthMm)}mm;

        max-width: ${receiptContentWidthMm(widthMm)}mm;

        margin: 0;

        padding: 3mm 0;
      }
    }

  </style>

</head>


<body>

  <div class="invoice">


    <!-- HEADER -->

    <div class="header">

      <div class="company-info">

        <img
          class="logo"
          src="${LOGO_DATA_URI}"
          alt="ON TARGET UNITED logo"
        />


        <h1>
          ON TARGET UNITED
        </h1>


        <p>
          BLOCK C SHOP # 74 CHINA MALL, SPRINGFIELD, DURBAN
        </p>


        <p>
          Tel: 078 863 8987 | 067 606 1458
        </p>


        <p class="meta-date">
          ${saleStamp}
        </p>

      </div>

    </div>


    <!-- ITEMS -->

    <table>

      <thead>

        <tr>

          <th>
            Description
          </th>

          <th>
            Qty
          </th>

          <th>
            Unit Price
          </th>

          <th>
            VAT %
          </th>

          <th>
            Line Total
          </th>

        </tr>

      </thead>


      <tbody>

        ${items
          .map(
            (item) => `
          <tr>

            <td>
              ${item.product_name}
            </td>

            <td>
              ${item.quantity}
            </td>

            <td>
              ${fmt(item.unit_price)}
            </td>

            <td>
              ${item.vat_rate}%
            </td>

            <td>
              ${fmt(item.line_total)}
            </td>

          </tr>
        `,
          )
          .join("")}

      </tbody>

    </table>


    <!-- TOTALS -->

    <div class="totals">

      <div class="row">

        <span>
          Subtotal
        </span>

        <span>
          ${fmt(Number(sale.subtotal))}
        </span>

      </div>


      <div class="row">

        <span>
          VAT
        </span>

        <span>
          ${fmt(Number(sale.vat_total))}
        </span>

      </div>


      ${
        Number(sale.discount_total) > 0
          ? `
        <div class="row">

          <span>
            Discount
          </span>

          <span>
            -${fmt(Number(sale.discount_total))}
          </span>

        </div>
      `
          : ""
      }


      <div class="row total">

        <span>
          Total
        </span>

        <span>
          ${fmt(Number(sale.total))}
        </span>

      </div>

    </div>


    <!-- RETURN POLICY -->

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


  <!-- DYNAMIC PAGE HEIGHT -->

  <script>

    ${pageSizingScript(widthMm)}

  </script>


</body>

</html>
`;
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINTING
   ══════════════════════════════════════════════════════════════════════════ */

const LOAD_TIMEOUT_MS = 10000;


export class PrintError extends Error {

  cause?: unknown;


  constructor(
    message: string,
    cause?: unknown,
  ) {

    super(message);

    this.name = "PrintError";

    this.cause = cause;
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   WAIT FOR ASSETS
   ══════════════════════════════════════════════════════════════════════════ */

async function whenAssetsSettled(
  doc: Document,
): Promise<void> {

  await Promise.all(

    Array.from(doc.images).map(

      (img) =>

        img.complete

          ? Promise.resolve()

          : new Promise<void>(
              (resolve) => {

                img.addEventListener(
                  "load",
                  () => resolve(),
                  { once: true },
                );


                img.addEventListener(
                  "error",
                  () => resolve(),
                  { once: true },
                );

              },
            ),
    ),
  );


  if (doc.fonts?.ready) {

    await doc.fonts.ready;
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   NEXT FRAME
   ══════════════════════════════════════════════════════════════════════════ */

function nextFrame(
  win: Window,
): Promise<void> {

  return new Promise<void>(
    (resolve) => {

      let done = false;


      const finish = () => {

        if (done) {
          return;
        }


        done = true;

        resolve();
      };


      win.requestAnimationFrame(
        finish,
      );


      win.setTimeout(
        finish,
        150,
      );

    },
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   MOUNT RECEIPT FRAME
   ══════════════════════════════════════════════════════════════════════════ */

async function mountReceiptFrame(
  html: string,
): Promise<HTMLIFrameElement> {

  const frame =
    document.createElement("iframe");


  frame.setAttribute(
    "aria-hidden",
    "true",
  );


  frame.setAttribute(
    "tabindex",
    "-1",
  );


  frame.title =
    "Receipt";


  frame.style.cssText = [

    "position:fixed",

    "left:-10000px",

    "top:0",

    /*
     * The iframe is intentionally wider than the 80mm receipt.
     *
     * This prevents the iframe itself from causing horizontal reflow.
     *
     * The printed width is controlled by @page.
     */
    "width:150mm",

    "height:400mm",

    "border:0",

    "pointer-events:none",

  ].join(";");


  document.body.appendChild(
    frame,
  );


  try {

    await new Promise<void>(
      (resolve, reject) => {

        const timer =
          window.setTimeout(

            () =>
              reject(
                new PrintError(
                  "The receipt took too long to render.",
                ),
              ),

            LOAD_TIMEOUT_MS,
          );


        frame.onload = () => {

          /*
           * Ignore initial about:blank load.
           */
          if (
            !frame.contentDocument?.querySelector(
              ".invoice",
            )
          ) {
            return;
          }


          window.clearTimeout(
            timer,
          );


          resolve();
        };


        frame.srcdoc =
          html;
      },
    );


    const doc =
      frame.contentDocument;


    const win =
      frame.contentWindow;


    if (!doc || !win) {

      throw new PrintError(
        "The receipt document could not be opened.",
      );
    }


    await whenAssetsSettled(
      doc,
    );


    await nextFrame(
      win,
    );


    return frame;

  } catch (err) {

    frame.remove();

    throw err;
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT DOCUMENT READER
   ══════════════════════════════════════════════════════════════════════════ */

export async function withReceiptDocument<T>(
  html: string,
  read: (
    doc: Document,
  ) => T | Promise<T>,
): Promise<T> {

  const frame =
    await mountReceiptFrame(
      html,
    );


  try {

    const doc =
      frame.contentDocument;


    if (!doc) {

      throw new PrintError(
        "The receipt document could not be opened.",
      );
    }


    return await read(
      doc,
    );

  } finally {

    frame.remove();
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT RASTER

   Renders the receipt to a single bitmap, the same way the PDF export does:
   through an SVG foreignObject (parsed as XML, hence XMLSerializer and the
   escaped stylesheet) rather than innerHTML. Used for PDF export only -
   on-paper printing goes through window.print() further down, which prints
   the live DOM rather than a picture of it.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ReceiptRaster {
  /** Data URI of the rendered receipt. */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export async function rasteriseReceiptHtml(
  html: string,
  options: {
    widthPx: number;
    /** Extra blank space below the content, in CSS px. */
    extraBottomPx?: number;
    /** Multiplier applied to both dimensions for a sharper raster. */
    scale?: number;
    mimeType?: string;
    quality?: number;
  },
): Promise<ReceiptRaster> {

  const width = options.widthPx;
  const extraBottomPx = options.extraBottomPx ?? 0;
  const scale = options.scale ?? 1;
  const mimeType = options.mimeType ?? "image/png";

  const { svg, heightPx } = await withReceiptDocument(html, (doc) => {

    const receipt = doc.querySelector<HTMLElement>(".invoice");

    if (!receipt) {
      throw new PrintError("The receipt could not be laid out for printing.");
    }

    const contentHeight = Math.ceil(receipt.getBoundingClientRect().height);

    if (!contentHeight) {
      throw new PrintError("The receipt measured as empty.");
    }

    const height = contentHeight + extraBottomPx;

    const styles = Array.from(doc.querySelectorAll("style"))
      .map((el) => el.textContent ?? "")
      .join("\n")
      .replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));

    // Pin the page width inline so it cannot disagree with the capture box.
    const body =
      `<body xmlns="http://www.w3.org/1999/xhtml" ` +
      `style="margin:0;background:#fff;width:${width}px">` +
      `<style>${styles}</style>${new XMLSerializer().serializeToString(receipt)}</body>`;

    return {
      heightPx: height,
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<foreignObject width="${width}" height="${height}">${body}</foreignObject></svg>`,
    };
  });

  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new PrintError("The receipt could not be rendered for printing."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(heightPx * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new PrintError("This browser cannot rasterise the invoice.");
  }

  // No transparency on a thermal receipt - paint the paper white first.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    dataUrl: canvas.toDataURL(mimeType, options.quality),
    widthPx: width,
    heightPx,
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINT RECEIPT

   Prints through the browser's native print dialog on the same hidden
   iframe used elsewhere in this file. generateInvoiceHTML() already embeds
   pageSizingScript(), which sets an exact @page size (full paper width,
   height measured from the rendered content) and re-measures on the
   'beforeprint' event that win.print() fires - so the dialog sends the
   printer one continuously-sized page. No local bridge app (QZ Tray or
   otherwise) is required; whatever printer the OS already has installed is
   picked from that dialog, same as printing any other page.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Safety net for browsers/print setups that never fire 'afterprint' (e.g.
 * the print was cancelled in a way the page isn't told about). Without
 * this the hidden iframe could be left mounted indefinitely.
 */
const PRINT_CLEANUP_TIMEOUT_MS = 60000;

export async function printReceiptHtml(
  html: string,
): Promise<void> {

  const frame = await mountReceiptFrame(html);

  const win = frame.contentWindow;

  if (!win) {

    frame.remove();

    throw new PrintError(
      "The receipt document could not be opened.",
    );
  }

  try {

    await new Promise<void>((resolve) => {

      let done = false;

      const finish = () => {

        if (done) {
          return;
        }

        done = true;

        win.removeEventListener("afterprint", finish);

        resolve();
      };

      win.addEventListener("afterprint", finish);

      win.setTimeout(finish, PRINT_CLEANUP_TIMEOUT_MS);

      win.focus();

      win.print();
    });

  } finally {

    frame.remove();
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINT INVOICE
   ══════════════════════════════════════════════════════════════════════════ */

export function printInvoice(
  sale: Sale,
  items: SaleItem[],
): Promise<void> {

  return printReceiptHtml(
    generateInvoiceHTML(
      sale,
      items,
      getThermalPaperWidthMm(),
    ),
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINT ERROR
   ══════════════════════════════════════════════════════════════════════════ */

export function describePrintError(
  err: unknown,
): string {

  if (err instanceof Error) {

    return err.message;
  }


  return "Printing failed for an unknown reason.";
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINT WITH ALERT
   ══════════════════════════════════════════════════════════════════════════ */

export async function printInvoiceWithAlert(
  sale: Sale,
  items: SaleItem[],
): Promise<boolean> {

  try {

    await printInvoice(
      sale,
      items,
    );


    return true;

  } catch (err) {

    console.error(
      `Could not print invoice ${sale.invoice_number}`,
      err,
    );


    alert(
      `Could not print invoice ${sale.invoice_number}:\n${describePrintError(
        err,
      )}`,
    );


    return false;
  }
}