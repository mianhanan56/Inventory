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
   the roll is cut just after the last line instead of at the end of a fixed
   sheet. Capped, though - see PAGE LENGTH below. Past the cap the receipt
   runs onto further pages; it is never scaled to fit one.

   PRINTING:
   Printing goes through the browser's own print dialog on a hidden iframe -
   no extra software (QZ Tray or otherwise) needs to be installed on the
   till. Whatever printer is already reachable from the OS is picked in that
   dialog, the same as printing any other web page.

   ── WHY THE WIDTH IS NOT THE DIALOG'S BUSINESS ────────────────────────────

   A page cannot set the browser's own print scale, margins or paper choice;
   those are the operator's, deliberately out of reach of any script. So the
   layout below is written to be correct at any of them rather than to depend
   on a particular set: the one thing that ever made the slip narrow was this
   file asking for a page the paper could not hold, and it no longer does.

   These dialog settings are still worth having (Chrome remembers them per
   destination), but they change how much paper a receipt spends, not how wide
   it prints:

     Margins              None  (or Default - @page sets margin: 0 either way)
     Paper size           the roll form: 80 x 3276mm, listed as Roll Paper or
                                Receipt. THIS ONE IS NOT COSMETIC - it has to
                                agree with DEFAULT_PAGE_LENGTH_MM below, and a
                                till left on the driver's stock 297mm form is
                                how long receipts come out narrow.
     Background graphics  On    (off drops the header and totals rules)
     Headers and footers  Off   (on prints the URL, date and "1/1" on the roll)
     Layout               Portrait

   The numbers that matter are PAPER_WIDTH_MM / SIDE_MARGIN_MM (the 72mm ink
   band) and DEFAULT_PAGE_LENGTH_MM (the page-length cap).
   ══════════════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────────────────
   PAGE WIDTH

   The paper is ~79.5mm, and the head of an 80mm unit spans 576 dots at
   8 dots/mm = 72mm, the paper guides covering the ~4mm each side - measured on
   the client's Xprinter XP-Q200 and true of the class. So 72mm is the whole of
   the paper it is possible to print on, whatever page size is asked for.

   The page asked for is NOT always that 80mm now - see PAGE SIZE BY ITEM COUNT
   below, which puts receipts over 15 items on a 100mm page. A page wider than
   the paper is one the driver shrinks to fit, so on those receipts the 72mm of
   head carries a scaled-down copy of a 100mm page rather than a 1:1 80mm one.

   At 80mm the rule is: page = form, SIDE_MARGIN_MM = the head's dead zone, and
   the ink lands exactly on the dots the head has. Do not instead make the page
   72mm - it looks equivalent and is not: an 80mm form with a 72mm page leaves
   the driver to place a page smaller than its paper, and Chrome at margins-none
   measures from the paper edge, so the left 4mm of the receipt lands under the
   guide and is lost.
   ────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   PAGE SIZE BY ITEM COUNT

   Requested behaviour: a receipt of 15 items or fewer prints on an 80mm page
   with a 297mm length cap, and anything longer prints on a 100mm page with a
   3276mm cap.

   Recorded here because it is the one thing in this file that deliberately
   makes the page size depend on how many items are on the receipt, and the
   measurements say what that costs on the client's XP-Q200:

     the head          576 dots at 8 dots/mm = 72mm of printable width, on
                       ~79.5mm paper, so ~4mm down each side has no dots
     80mm page         printed at 1:1 - the page is the paper, no scaling
     100mm page        the driver cannot print a page wider than its paper, so
                       it shrinks the whole page by 80/100. Measured: ink runs
                       0.71mm to 79.37mm against a head reaching 4mm to 76mm,
                       so 3.29mm is lost off the left of every description and
                       3.37mm off the right of every line total - the cents.
                       Type also comes out 20% smaller, being the same shrink.

   So above 15 items the slip prints smaller with both edges trimmed. The way
   to get those extra characters per line without losing the edges is to keep
   the page at 80mm and reduce the font sizes instead - 72mm of head at 80%
   type is the same 90mm of layout the 100mm page buys - but that is not what
   was asked for here, and the fonts are deliberately left alone.
   ────────────────────────────────────────────────────────────────────────── */

/** Item count at or below which the narrow page and short cap are used. */
export const PAGE_SIZE_ITEM_THRESHOLD = 15;

/** Page for a receipt of PAGE_SIZE_ITEM_THRESHOLD items or fewer. */
export const NARROW_PAPER_WIDTH_MM = 80;

/** Page for a receipt of more than PAGE_SIZE_ITEM_THRESHOLD items. */
export const WIDE_PAPER_WIDTH_MM = 100;

/** The paper the client prints on, and the page size the CSS is written to. */
export const PAPER_WIDTH_MM = WIDE_PAPER_WIDTH_MM;

/**
 * Clear paper down each side, as page padding inside the page.
 *
 * At 4mm on an 80mm page this holds the ink to the middle 72mm, which is the
 * span of the head on a standard 80mm unit, so nothing sits in the strip under
 * the paper guides where a printer cannot lay ink down.
 *
 * It is 1mm, so the ink band is 78mm on the 80mm page and 98mm on the 100mm one
 * (the latter shrunk to 78.4mm by the driver). Neither is 72mm, so BOTH pages
 * put ink outside what the head can reach. Measured on 80mm paper:
 *
 *              at 1mm                     at 4mm
 *   <=15 items 3.3mm lost each side       0 - ink lands on 4.0mm..76.0mm, the
 *                                         head's dots exactly
 *   >15 items  3.3mm lost each side       1.2mm lost each side
 *
 * So 4mm is strictly better on both, and exact on the narrow page. It is left at
 * 1mm because only the item-count condition was asked for; this is the number to
 * change if the printed slips come back with the cents or the first letters of
 * descriptions missing.
 */
export const SIDE_MARGIN_MM = 2;

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
 * An explicit page width, or null to size the page from the item count.
 *
 * Deliberately not persisted anywhere: a stored value would silently outlive a
 * change to the default and leave one machine printing at a width nobody chose.
 */
let thermalPaperWidthMm: number | null = null;

/**
 * The page width used for printing, previewing and PDF export.
 *
 * Pass the receipt's item count to get the width the item-count rule calls for.
 * Called without one it answers for the wide page, which is what an unknown
 * (i.e. possibly long) receipt has to be sized for - so a caller that forgets
 * to pass the count lays out too wide rather than too narrow, and too wide is
 * merely shrunk by the driver where too narrow would be clipped by it.
 *
 * An explicit setThermalPaperWidthMm() always wins over the rule.
 */
export function getThermalPaperWidthMm(
  itemCount: number = Number.POSITIVE_INFINITY,
): number {
  if (thermalPaperWidthMm !== null) return thermalPaperWidthMm;
  return itemCount <= PAGE_SIZE_ITEM_THRESHOLD ? NARROW_PAPER_WIDTH_MM : WIDE_PAPER_WIDTH_MM;
}

/**
 * Override the print width in mm, or pass null to go back to sizing the page
 * from the item count.
 */
export function setThermalPaperWidthMm(mm: number | null): void {
  if (mm === null) {
    thermalPaperWidthMm = null;
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
   PAGE LENGTH  ---  as long as the listing, and NEVER scaled to fit.

   Three things want to hold at once, and only two of them can:

     paper used = list - the slip is as long as its content, no blank tail
     true width        - the ink spans the page, not a shrunken copy of it
     one page          - never split, whatever the item count

   The trap is that a page longer than the driver's paper does not print long.
   Asked for one, the driver reconciles it with the sheet by shrinking it to
   fit - and shrinking is uniform, so the width goes down with the height. A
   392mm page (30 items) on a 297mm sheet comes back at 297/392 = 76%, so the
   72mm ink band prints as 55mm with 12mm of blank down either side; 60 items
   land at 32mm. That is the whole of the "receipts get narrow when there are
   many products" report. The width never grew - the height outgrew the sheet
   and took the width with it. It has nothing to do with which printer is
   attached, which is why a second printer on a second PC did it too.

   The width is not negotiable and the height is, so of the three it is "one
   page" that has to be able to give. The page box is never allowed past
   DEFAULT_PAGE_LENGTH_MM below:

     content within the cap  one page, cut exactly to the content. On the roll
                             form the cap is 3276mm, so this is every receipt
                             the shop will ever print - one continuous slip, no
                             paper wasted, nothing split, nothing scaled.
     content past the cap    spread over the fewest pages that keep each one
                             inside the cap, and spread evenly so the last page
                             is as full as the first. Every page is smaller than
                             the sheet, so the driver's fit is always a no-op
                             and the ink band is the same 72mm on a one-line
                             slip and a hundred-line one.

   The second case is the safety net, not the plan. It only comes up on a till
   whose driver is on a short form, and on these tills auto-cut is enabled, so a
   split would be a cut through the middle of the customer's receipt. Keeping the
   cap equal to the driver's paper is what keeps it on one piece of paper.

   IF LONG RECEIPTS EVER COME OUT SMALL AGAIN, this number is why - it is above
   the sheet the driver is really set to. It is a cap on what we ask for, so it
   is safe low and dangerous high: too low only splits a receipt that need not
   have been split, while too high shrinks it, width and all.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Longest page box to ask a driver for, in millimetres.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ THIS MUST MATCH THE DRIVER'S  Printing preferences -> Paper size.      │
 * │ It is the one number that can make long receipts print narrow again.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * 3276mm is the roll form the Xprinter 80mm drivers expose, listed as
 * `80 x 3276mm`, `Roll Paper` or `Receipt`. The client's XP-Q200 tills are set
 * to it, so a receipt on this cap prints as ONE continuous slip cut exactly to
 * its content - about 290 line items before even this is reached.
 *
 * Used for receipts of more than PAGE_SIZE_ITEM_THRESHOLD items. Receipts at or
 * under it get SHORT_PAGE_LENGTH_MM instead, as asked for - which for those
 * receipts is the same output either way, because a 15-item slip is around
 * 260mm and so never reaches either cap. The two differ only if a short receipt
 * runs past 297mm (many long, wrapping descriptions), and then the short cap
 * splits it over two pages - which on these tills, with auto-cut enabled, is a
 * cut through the middle of the customer's receipt.
 *
 * If a till is ever put back on a fixed sheet form - or a new till is set up
 * and left on the driver's stock form, which is 297mm - long receipts on THAT
 * till will come out narrow, because the driver shrinks a page it cannot fit
 * and the shrink takes the width with it. The symptom is unmistakable: short
 * receipts correct, long ones progressively narrower with growing blank
 * margins down both sides. The fix is to set that till's paper size to the roll
 * form, or to lower this number to the sheet length it is really on.
 * setThermalPageLengthMm() does the latter without a rebuild.
 */
export const LONG_PAGE_LENGTH_MM = 3276;

/**
 * Cap for a receipt of PAGE_SIZE_ITEM_THRESHOLD items or fewer.
 *
 * 297mm is the sheet length an 80mm driver reports when left on its stock form.
 */
export const SHORT_PAGE_LENGTH_MM = 297;

export const DEFAULT_PAGE_LENGTH_MM = LONG_PAGE_LENGTH_MM;

/** Sanity bounds for the override: shorter than the tallest single block cannot
 *  be paginated into, longer than the roll form cannot be printed at all. */
const MIN_PAGE_LENGTH_MM = 100;
const MAX_PAGE_LENGTH_MM = 3276;

/**
 * The page-length cap used for printing.
 *
 * Deliberately not persisted, for the same reason as the width: a stored value
 * would outlive a change to the default and leave one machine printing to a
 * sheet length nobody chose.
 */
let thermalPageLengthMm: number | null = null;

/**
 * The page-length cap used for printing.
 *
 * Pass the receipt's item count for the cap the item-count rule calls for.
 * Without one it answers with the long cap, which is the safe way to be wrong:
 * a cap above the paper only ever splits a receipt that need not have been
 * split, where one below it shrinks the receipt, width and all.
 *
 * An explicit setThermalPageLengthMm() always wins over the rule.
 */
export function getThermalPageLengthMm(
  itemCount: number = Number.POSITIVE_INFINITY,
): number {
  if (thermalPageLengthMm !== null) return thermalPageLengthMm;
  return itemCount <= PAGE_SIZE_ITEM_THRESHOLD ? SHORT_PAGE_LENGTH_MM : LONG_PAGE_LENGTH_MM;
}

/**
 * Override the page-length cap in mm, or pass null to go back to the default.
 *
 * Set this to the paper form the driver is on (3276 for the Xprinter roll form)
 * to let long invoices print as a single continuous slip.
 */
export function setThermalPageLengthMm(mm: number | null): void {
  if (mm === null) {
    thermalPageLengthMm = null;
    return;
  }
  if (!Number.isFinite(mm)) return;
  thermalPageLengthMm = Math.min(MAX_PAGE_LENGTH_MM, Math.max(MIN_PAGE_LENGTH_MM, mm));
}


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT PAGE HEIGHT
   ══════════════════════════════════════════════════════════════════════════ */

function pageSizingScript(widthMm: number, maxPageMm: number): string {
  return `
    (function () {

      var PAPER_MM = ${widthMm};
      var TAIL_MM = ${PAGE_TAIL_MM};
      var MAX_PAGE_MM = ${maxPageMm};
      var PX_PER_MM = 96 / 25.4;

      var pageStyle = document.createElement('style');
      pageStyle.id = 'receipt-page-size';
      document.head.appendChild(pageStyle);


      /* Height of the receipt as laid out, in mm. Only .invoice is measured:
         document.body is never shorter than the viewport, so measuring the body
         would size the page to the window and print a mostly blank sheet. */
      function renderedHeightMm() {
        var receipt = document.querySelector('.invoice');
        if (!receipt) return 0;
        return Math.max(receipt.getBoundingClientRect().height, receipt.scrollHeight) / PX_PER_MM;
      }


      /*
       * Height of the tallest thing that cannot be broken across a page, in mm -
       * so, the most paper a single page break can waste.
       *
       * A block that will not fit in what is left of a page is pushed whole onto
       * the next one, so the page count has to be settled against that cost or
       * the split spills onto an unplanned extra page.
       */
      function tallestUnbreakableMm() {
        var blocks = document.querySelectorAll(
          '.invoice .header, .invoice tbody tr, .invoice .totals .row, .invoice .returns-policy'
        );
        var tallest = 0;

        for (var i = 0; i < blocks.length; i++) {
          var h = blocks[i].getBoundingClientRect().height;
          if (h > tallest) tallest = h;
        }

        return tallest / PX_PER_MM;
      }


      function sizePage() {

        if (!document.querySelector('.invoice')) {
          return 0;
        }

        var heightMm = renderedHeightMm();
        if (!heightMm) return 0;

        var contentMm = heightMm + TAIL_MM;

        /* The page is the receipt: exactly as long as what is on it, so the
           paper used matches the listing and there is no blank tail. */
        var pages = 1;
        var page = Math.ceil(contentMm);

        if (contentMm > MAX_PAGE_MM) {
          /*
           * Too long for the sheet. Spread it over pages instead of scaling it:
           * scaling is uniform, and a uniform shrink is the narrow print this
           * whole file exists to prevent.
           *
           * Split evenly rather than filling pages to the cap and leaving a
           * near-empty last one - with zero margins the pages abut on the roll,
           * so an even split means the paper still ends just after the footer.
           */
          var slackMm = tallestUnbreakableMm();

          /*
           * Each break costs a pushed block, and paying for the breaks can call
           * for another page, which is another break. Settle it rather than
           * solve it: the second pass is over a page count that already carries
           * the first pass's slack, and a third has never changed the answer.
           */
          for (var pass = 0; pass < 2; pass++) {
            pages = Math.ceil((contentMm + (pages - 1) * slackMm) / MAX_PAGE_MM);
          }

          page = Math.ceil((contentMm + (pages - 1) * slackMm) / pages);
        }

        /*
         * The cap is the invariant the printed width rests on, so it is enforced
         * here rather than trusted to the arithmetic above.
         *
         * That arithmetic can overshoot it: the second pass can raise the page
         * count, and the even split then divides a total that carries slack for
         * MORE breaks than the count it is divided by was derived from. Swept
         * over the realistic range (cap 297, tallest block 30-60mm, content up to
         * 5000mm) that overshoots on ~15% of inputs, by up to 10mm - which is a
         * 297mm sheet being asked for a 307mm page, i.e. the 72mm band printing
         * at 69.6mm. Small, but it is precisely the bug this file is fixing, so
         * it does not get to come back through the back door.
         *
         * Clamping can only ever add a page, never lose content: Chrome
         * paginates whatever does not fit, and past the cap no clamp is written.
         */
        if (page > MAX_PAGE_MM) {
          page = MAX_PAGE_MM;
        }


        var css =
          '@page {' +
          '  size: ' + PAPER_MM + 'mm ' + page + 'mm;' +
          '  margin: 0;' +
          '}';

        /*
         * Clamp the document to the page, but ONLY when it is a single page.
         *
         * On one page this is a backstop for the day a browser lays the receipt
         * out a shade taller than it measured: the page is already tall enough
         * for the content, so anything past it can only be a rounding sliver,
         * and clipping a sliver beats spilling it onto a second slip.
         *
         * Past the cap, pagination is the intended outcome and a clamp is
         * precisely the thing that prevents it - which would clip every item
         * after the first page off the receipt entirely.
         */
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
  /* Both default off the item count - see PAGE SIZE BY ITEM COUNT at the top. */
  widthMm: number = getThermalPaperWidthMm(items.length),
  maxPageMm: number = getThermalPageLengthMm(items.length),
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
       * The page is the paper: 100mm. The side spacing is padding inside it
       * (box-sizing is border-box, so the page stays 100mm).
       *
       * max-width as well as width, so no amount of content can push the block
       * wider than the paper - a page wider than the sheet is one the driver
       * scales down to fit, and that scale takes the type with it.
       */
      width: ${widthMm}mm;

      max-width: ${widthMm}mm;

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
     * Margins only - no size. pageSizingScript() adds the size, with the height
     * measured off the rendered content.
     *
     * Deliberately not "size: 100mm auto": "&lt;length> auto" is not a legal
     * value for size (it takes one length, two lengths, or the keyword auto
     * alone), so Chrome drops the whole declaration and the rule silently
     * becomes this one. Stating it outright means the fallback is the one we
     * chose: if the sizing script never runs, the page box is the driver's own
     * paper, which on a roll printer is continuous feed - and a page box that IS
     * the paper can never be a page box the driver has to shrink.
     */
    @page {

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
     * No line of the receipt may be split down the middle by a page break.
     *
     * Applied to the individual blocks, never to the containers that hold
     * them. A block that carries break-inside: avoid and does not fit is
     * pushed whole onto the next page, so putting it on .invoice or on the
     * table would push the ENTIRE receipt and leave the first page blank -
     * which is also why it is the table rows listed here and not the table.
     * Past the page-length cap a long receipt is meant to run onto another
     * page, and a table that refuses to break cannot.
     */
    tr,
    td,
    th,
    .header,
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

    /*
     * The five columns total 100%, of a table that is the full 72mm ink band.
     *
     * These widths do not vary with the item count - they are percentages of a
     * table that is always the same 72mm - so nothing here is involved in the
     * receipt's width. They are a fixed-layout table, though, which means the
     * nowrap money columns overflow rather than growing when a value will not
     * fit, and the LINE TOTAL column is the last one, so its overflow lands
     * outside the band, in the strip under the paper guide where the head cannot
     * print. Measured against the glyph boxes (element rects cannot see this -
     * the cell keeps its column width while the text spills out of it):
     *
     *   line total below R10 000   0mm      fits
     *   R10 000 - R99 999          0.54mm   the last digit loses ~4 dots
     *   R100 000 and up            2.16mm   the last digit is lost
     *
     * Both predate the pagination work and neither is affected by it. The fix,
     * when it is wanted, is 22% -> 24% here and 40% -> 38% on the description
     * column: that buys ~0.9mm of headroom, enough for any five-figure total,
     * and costs 1.4mm of description width on every receipt the shop prints -
     * which is enough to push a twenty-line invoice onto a second page, so it is
     * a decision about paper, not a bug to be quietly fixed.
     */
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

        max-width: ${widthMm}mm;

        /*
         * Not "0 auto": centring only matters when something is narrower than
         * the page, and on paper that slack is a blank band down either side.
         * The 4mm of clear paper the head needs is the body padding below.
         */
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

    ${pageSizingScript(widthMm, maxPageMm)}

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
     * The iframe is intentionally wider than the 100mm receipt.
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

  /* No width argument: generateInvoiceHTML sizes the page from the item count.
     Passing one here would have pinned every receipt to the wide page. */
  return printReceiptHtml(
    generateInvoiceHTML(
      sale,
      items,
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