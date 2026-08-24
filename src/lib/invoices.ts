import { Sale, SaleItem } from "../types";
import { notifyError } from "./errors";
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
   The receipt height comes from the item count - a measured table of page
   lengths for 1..30 items, see PAGE LENGTH BY ITEM COUNT below - raised to the
   rendered content height when the descriptions on a sale wrap further than the
   table assumes. That length is written into an @page rule by
   pageSizingScript(), so the roll is cut just after the last line instead of at
   the end of a fixed sheet.

   The receipt is ONE page. It is never scaled to fit and never split, and the
   only thing that can still split it is a till pinned to a fixed sheet form -
   see DEFAULT_PAGE_LENGTH_MM, where the choice is a cut or a shrink.

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
                                Receipt. THIS ONE IS NOT COSMETIC, AND IT IS THE
                                FIRST THING TO CHECK on any complaint about the
                                length of the paper. A fixed sheet form is fed in
                                full whatever page box this file asks for, so
                                every slip comes out the same length whatever is
                                on it - short sales with a blank tail, long ones
                                shrunk to fit and therefore narrow. No page
                                length computed here can shorten a fixed form.
     Background graphics  On    (off drops the header and totals rules)
     Headers and footers  Off   (on prints the URL, the date and "1/1" on the
                                customer's receipt, and reserves the paper they
                                sit on)
     Layout               Portrait

   The numbers that matter are PAPER_WIDTH_MM / SIDE_MARGIN_MM (the 72mm ink
   band), RECEIPT_PAGE_LENGTH_MM (the page length per item count) and
   DEFAULT_PAGE_LENGTH_MM (the ceiling on both).
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
export const WIDE_PAPER_WIDTH_MM = 110;

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
   PAGE LENGTH  ---  one page, stepped by item count, NEVER scaled to fit.

   Three things want to hold at once:

     paper used = list - the slip is as long as its content, no blank tail
     true width        - the ink spans the page, not a shrunken copy of it
     one page          - never split, whatever the item count

   All three hold now. The receipt is never paginated and never scaled: the page
   box is set to a length that comes from the item count (RECEIPT_PAGE_LENGTH_MM
   below), raised to the measured content height if the descriptions on this
   particular sale wrap further than the table assumes.

   WHY BOTH, AND NOT JUST ONE OR THE OTHER

   The item count alone cannot know the page length, because a line item is not a
   fixed height. The description column is 40% of a 76mm band at 13px, so a name
   wraps to one, two or three lines, and a row is 6.2mm, 10.4mm or 14.5mm
   accordingly. Measured across 1-30 items (headless Chrome, this layout, 80mm
   page - see the table below):

     30 items, one-line names      289mm
     30 items, the client's names  380mm
     30 items, longest names       723mm

   So a table tight enough to have no blank tail on the first would cut the
   third in half, and a table tall enough for the third would put 400mm of blank
   paper under the first. The table is therefore set to the ONE-LINE height - the
   least a given item count can possibly need - and the rendered content height
   raises it from there. The step table is the floor and the guarantee; the
   measurement is the truth, and being the larger of the two it is what normally
   decides the page. Blank tail is never added by the table, and content is never
   cut off by it.

   WHAT MUST NEVER GO BACK IN

   Scaling and splitting are both off the table:

     scaling  a page longer than the driver's paper is one the driver shrinks to
              fit, and the shrink is uniform, so the width goes down with the
              height. A 392mm page (30 items) on a 297mm sheet comes back at 76%:
              the 72mm ink band prints as 55mm with 12mm blank down either side.
              That was the whole of the "receipts get narrow when there are many
              products" report. The width never grew - the height outgrew the
              sheet and took the width with it.
     splitting  these tills auto-cut, so a second page is a cut through the
              middle of the customer's receipt. There is no pagination path left
              in pageSizingScript() at all.

   Which leaves ONE requirement on the till, and it is not a code setting:
   the driver's paper form has to be the continuous roll form. A driver on a
   fixed sheet form prints every receipt on that whole sheet, whatever page box
   this file asks for - which is a fixed-length slip with a blank tail on short
   sales and a shrunken one on long sales. See DEFAULT_PAGE_LENGTH_MM.
   ────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   PAPER AVAILABLE FROM SPACING  ---  measured, and deliberately NOT taken

   The receipt's length is mostly its own content, and the layout is where that
   length is really decided. Every figure below is measured on a 30-item receipt
   with the client's own product names, so the next person asking "can it be
   shorter?" does not have to measure it again.

   NONE OF THESE ARE APPLIED. The spacing, the fonts and the logo are to be left
   exactly as they are - the client's instruction, and it outranks the arithmetic.
   This is a price list, not a plan:

     tbody td padding      4px -> 2px      33mm   the largest by far, being the
                                                  only spacing paid once per item
     .returns-policy       10px -> 6px      3mm
     .header margins       10/8 -> 6/5px    2mm
     .totals .row padding  2px -> 1px       2mm
     thead th padding      4px -> 2px       1mm
     table margin-bottom   8px -> 5px       1mm
     logo 60px -> 34px                      7mm   changes how the slip LOOKS
     h1 22px, address 11 -> 10px            5mm   changes how the slip LOOKS
     returns policy 11 -> 9.5px             3mm   changes how the slip LOOKS

   Taken together they would put a 30-item slip at ~336mm against the ~374mm it is
   now, and a 1-item one at ~80mm against ~102mm.

   THE ONE SPACING CHANGE THAT WAS MADE is the .invoice top and bottom padding,
   3mm each, removed on request: it was 6mm of blank paper on every slip, most of
   it visible as the gap above the logo. The bottom gap is now PAGE_TAIL_MM alone.

   Horizontal padding is not part of this budget and must not be trimmed with it:
   the columns are a fixed-layout table, and cell padding is what keeps the money
   columns off each other.
   ────────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────────
   PAGE LENGTH BY ITEM COUNT

   Page length in mm for a receipt of 1..30 items, indexed by item count
   (index 0 holds the no-items length).

   The series starts at 60mm for one item and continues at 5.20mm an item, which
   is the measured height of a single-line row in this layout. 60mm was asked for
   directly, and it is BELOW what a receipt of one item actually renders to - the
   shortest possible one-item slip is ~95mm of content and the client's own names
   put it at ~102mm.

   WHICH MEANS THIS TABLE NO LONGER DECIDES ANY PRINTED LENGTH. The page is
   max(this, rendered content), and the content is larger at every item count from
   1 to 30, so the content decides all of them. That is not a fault - the content
   height is the tightest length a receipt can have without clipping, and it is
   what these slips now print at:

     1 item    ~102mm        15 items  ~235mm
     5 items   ~140mm        30 items  ~374mm
                             (client's own product names)

   What the table still does is catch the case where the measurement is
   unavailable - a script that ran before layout, an .invoice that measured zero.
   At 60mm-and-up that fallback is now SHORTER than the receipt, so a measurement
   failure clips rather than over-feeds. It was a measured one-line floor before
   (95mm for one item, 245mm for thirty), which is the shape to restore if a
   clipped receipt is ever reported with no other explanation.

   To make the SLIPS shorter, this table is the wrong lever - lowering it does
   nothing while the content is taller. PAPER AVAILABLE FROM SPACING above is the
   right one, and it is priced out there.

   The series, for reading against the printed slips:

     items    page      items    page
      1-2      60-66    13-15    123-133
      3-5      71-81    16-20    138-159
      6-8      86-97    21-25    164-185
      9-12    102-118   26-30    190-211
   ────────────────────────────────────────────────────────────────────────── */

const RECEIPT_PAGE_LENGTH_MM: readonly number[] = [
  /*  0 */ 55,
  /*  1 */ 60, /*  2 */ 66, /*  3 */ 71, /*  4 */ 76, /*  5 */ 81,
  /*  6 */ 86, /*  7 */ 92, /*  8 */ 97, /*  9 */ 102, /* 10 */ 107,
  /* 11 */ 112, /* 12 */ 118, /* 13 */ 123, /* 14 */ 128, /* 15 */ 133,
  /* 16 */ 138, /* 17 */ 144, /* 18 */ 149, /* 19 */ 154, /* 20 */ 159,
  /* 21 */ 164, /* 22 */ 170, /* 23 */ 175, /* 24 */ 180, /* 25 */ 185,
  /* 26 */ 190, /* 27 */ 196, /* 28 */ 201, /* 29 */ 206, /* 30 */ 211,
];

/** Highest item count the table covers. */
export const RECEIPT_PAGE_LENGTH_TABLE_MAX_ITEMS = RECEIPT_PAGE_LENGTH_MM.length - 1;

/**
 * Page length added per item past the end of the table, in mm.
 *
 * The measured single-line row is 6.24mm; this is rounded up so the extrapolation
 * stays a floor rather than drifting under one.
 */
const RECEIPT_ROW_LENGTH_MM = 7;

/**
 * The page length for a receipt of `itemCount` items, in mm - the floor the
 * printed page is never shorter than.
 *
 * Past the end of the table it continues at RECEIPT_ROW_LENGTH_MM an item, and
 * it is never allowed past MAX_PAGE_LENGTH_MM (the roll form), because a page
 * longer than the paper is a page the driver shrinks, width and all.
 */
export function receiptPageLengthMm(itemCount: number): number {
  const n = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;

  const mm =
    n <= RECEIPT_PAGE_LENGTH_TABLE_MAX_ITEMS
      ? RECEIPT_PAGE_LENGTH_MM[n]
      : RECEIPT_PAGE_LENGTH_MM[RECEIPT_PAGE_LENGTH_TABLE_MAX_ITEMS] +
        (n - RECEIPT_PAGE_LENGTH_TABLE_MAX_ITEMS) * RECEIPT_ROW_LENGTH_MM;

  return Math.min(mm, MAX_PAGE_LENGTH_MM);
}

/**
 * Longest page box that may ever be asked of a driver, in millimetres.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ THE DRIVER'S  Printing preferences -> Paper size  MUST BE THE ROLL     │
 * │ FORM, and this must not exceed its length.                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * 3276mm is the roll form the Xprinter 80mm drivers expose, listed as
 * `80 x 3276mm`, `Roll Paper` or `Receipt`. It is a ceiling, not a page length -
 * the page length is receiptPageLengthMm() raised to the content - and at
 * ~460 line items nothing the shop prints comes near it.
 *
 * TWO SYMPTOMS POINT STRAIGHT BACK HERE, and both are the driver's paper form
 * rather than anything this file can compute:
 *
 *   every slip the same length, with a blank tail on the short ones
 *       the till is on a FIXED SHEET form (the stock form is 297mm). A fixed
 *       form is fed in full whatever page box is asked for, so the receipt
 *       stops where its content stops and the paper stops where the sheet does.
 *       Set that till's paper size to the roll form.
 *   long receipts narrower than short ones, blank down both sides
 *       a page longer than the form, uniformly shrunk to fit it. Either set the
 *       roll form, or call setThermalPageLengthMm() with the sheet length the
 *       till is really on, which trades the shrink for a cut.
 */
export const LONG_PAGE_LENGTH_MM = 3276;

/**
 * The sheet length an 80mm driver reports when left on its stock form.
 *
 * Nothing is sized to it. It is the value to hand setThermalPageLengthMm() on a
 * till found still on that form, as the stopgap until its paper size is set to
 * the roll form.
 */
export const STOCK_SHEET_LENGTH_MM = 297;

export const DEFAULT_PAGE_LENGTH_MM = LONG_PAGE_LENGTH_MM;

/** Sanity bounds for the override: shorter than a minimal receipt cannot hold
 *  one, longer than the roll form cannot be printed at all. */
const MIN_PAGE_LENGTH_MM = 100;
const MAX_PAGE_LENGTH_MM = 3276;

/**
 * An explicit page length, or null to take it from the item count.
 *
 * Deliberately not persisted, for the same reason as the width: a stored value
 * would outlive a change to the default and leave one machine printing to a
 * sheet length nobody chose.
 */
let thermalPageLengthMm: number | null = null;

/**
 * The page length for a receipt of `itemCount` items, in mm.
 *
 * This is the floor written into @page. pageSizingScript() raises it to the
 * measured content height when the descriptions on this sale wrap past what the
 * table assumes, so the returned value is what a receipt of this item count
 * needs at minimum, never a cap on what it may have.
 *
 * An explicit setThermalPageLengthMm() always wins - that is the escape hatch
 * for a till found on a fixed sheet form.
 */
export function getThermalPageLengthMm(itemCount: number = 0): number {
  if (thermalPageLengthMm !== null) return thermalPageLengthMm;
  return receiptPageLengthMm(itemCount);
}

/**
 * Pin the page length in mm, or pass null to go back to sizing it from the item
 * count.
 *
 * Set this to the paper form a till is really on when it is not the roll form:
 * the page can then be shorter than that sheet but never longer, so the receipt
 * is cut rather than shrunk.
 */
export function setThermalPageLengthMm(mm: number | null): void {
  if (mm === null) {
    thermalPageLengthMm = null;
    return;
  }
  if (!Number.isFinite(mm)) return;
  thermalPageLengthMm = Math.min(MAX_PAGE_LENGTH_MM, Math.max(MIN_PAGE_LENGTH_MM, mm));
}

/**
 * The longest page this till may be asked for, in mm.
 *
 * The roll form normally, or the pinned length when setThermalPageLengthMm() has
 * named the sheet a till is really on. It is the one thing that can still stop a
 * receipt printing on a single page, and deliberately so: past it the choice is
 * between a cut and a shrink, and a shrink takes the width with it.
 */
export function receiptPageCeilingMm(): number {
  return thermalPageLengthMm ?? LONG_PAGE_LENGTH_MM;
}

/* ──────────────────────────────────────────────────────────────────────────
   RECEIPT_TEST_PAGE_LENGTH_MM  ---  is the page size we ask for honoured?

   Every complaint about the length of these slips has two possible authors: the
   page length this file computes, and the paper form the driver is on. They are
   told apart by forcing a page length far shorter than the content and looking at
   what comes out of the printer. On the till, in the app's console:

       __receiptTestPageLengthMm = 60      // then print any sale

     paper comes out ~60mm, receipt clipped
         the driver honours the page size it is sent, so the length IS this
         file's to decide, and a slip that is too long is a layout question -
         PAPER SPENT ON SPACING above is where that is answered.
     paper comes out the same length as before
         the driver is feeding a fixed form and ignoring the page size. No number
         computed here can shorten it; the till's paper form has to be the roll
         form. See DEFAULT_PAGE_LENGTH_MM.

   Clear it with `__receiptTestPageLengthMm = null` when the test is done. It
   lives on the window rather than in this module on purpose: it can be set on a
   deployed build from a till, with no rebuild and nothing to remove afterwards,
   and it cannot affect a receipt printed by anyone who has not set it.

   IT CLIPS. It is a diagnostic, never a way to shorten a receipt - a receipt
   whose totals have been clipped off the bottom is worse than a long one.
   ────────────────────────────────────────────────────────────────────────── */


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT PAGE HEIGHT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The script embedded in every receipt that fixes the page height.
 *
 * @param widthMm   the page width - never touched here, only echoed into @page
 * @param floorMm   the item-count page length, from receiptPageLengthMm()
 * @param ceilingMm the longest page this till may be asked for
 */
function pageSizingScript(widthMm: number, floorMm: number, ceilingMm: number): string {
  return `
    (function () {

      var PAPER_MM = ${widthMm};
      var TAIL_MM = ${PAGE_TAIL_MM};
      var FLOOR_MM = ${floorMm};
      var CEILING_MM = ${ceilingMm};
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
       * DIAGNOSTIC OVERRIDE - see RECEIPT_TEST_PAGE_LENGTH_MM below the script.
       *
       * A page length forced from the app's console, ignoring the content:
       *
       *     __receiptTestPageLengthMm = 60
       *
       * The receipt prints on a page of exactly that length and anything past it
       * is clipped. That is the whole point of it: it is the one way to ask the
       * printer "do you honour the page size you are sent?" and get an answer off
       * the paper. If a receipt forced to 60mm still comes out the length of the
       * driver's sheet, the length was never this file's to decide.
       *
       * The receipt renders in an iframe, so the value is read off the parent
       * window where the console runs. Wrapped because the read can throw if the
       * frame is ever loaded cross-origin, and a diagnostic must not be able to
       * break printing.
       */
      function testPageLengthMm() {
        try {
          var mm = window.parent && window.parent.__receiptTestPageLengthMm;
          return typeof mm === 'number' && isFinite(mm) && mm > 0 ? mm : 0;
        } catch (err) {
          return 0;
        }
      }


      function sizePage() {

        if (!document.querySelector('.invoice')) {
          return 0;
        }

        /*
         * The page length, in three steps.
         *
         * FLOOR_MM is what a receipt of this item count needs at minimum, from
         * the measured table in PAGE LENGTH BY ITEM COUNT. The rendered height
         * is what THIS receipt needs, which is more whenever a description
         * wraps past one line. The page is the larger of the two, so the paper
         * is never shorter than the content (nothing is cut, nothing is split)
         * and never longer than it needs to be (no blank tail).
         *
         * Falling back to the floor when the measurement is unavailable is the
         * point of having a table at all: a script that runs before layout, or
         * an .invoice that measures zero, still produces a sane slip.
         */
        var contentMm = renderedHeightMm();
        var neededMm = contentMm ? contentMm + TAIL_MM : 0;
        var page = Math.ceil(Math.max(FLOOR_MM, neededMm));

        /*
         * The ceiling is the last word, and it is the width's guarantee: a page
         * longer than the paper is one the driver shrinks to fit, and the shrink
         * is uniform, so the width goes with the height. On the roll form this
         * never bites (~460 items); on a till pinned to a fixed sheet it does,
         * and there a cut is the lesser evil - see receiptPageCeilingMm().
         */
        var fits = page <= CEILING_MM;
        if (!fits) {
          page = CEILING_MM;
        }

        /*
         * The diagnostic override outranks all of it, content included - a test
         * that negotiated with the content would not be testing anything. It is
         * treated as fitting so the page is clamped and stays a single page: the
         * question being asked is what the printer does with ONE short page.
         */
        var forcedMm = testPageLengthMm();
        if (forcedMm) {
          page = Math.ceil(forcedMm);
          fits = true;
        }


        var css =
          '@page {' +
          '  size: ' + PAPER_MM + 'mm ' + page + 'mm;' +
          '  margin: 0;' +
          '}';

        /*
         * Hold the document to the page, but ONLY when the content fits it.
         *
         * When it fits, this is the belt to the page size's braces: the page is
         * already at least as tall as the content, so nothing here can clip
         * anything except a sub-millimetre rounding sliver, and it stops the
         * browser finding a reason to start a second page.
         *
         * When it does not fit - only reachable on a pinned short sheet - the
         * receipt has to be allowed to paginate, and a clamp is precisely what
         * would prevent it, clipping every item past the first page instead.
         */
        if (fits) {
          css +=
            '@media print {' +
            '  html, body { height: ' + page + 'mm; overflow: hidden; }' +
            '  .invoice { max-height: ' + page + 'mm; overflow: hidden; }' +
            '}';
        }

        pageStyle.textContent = css;


        /* Left on the window for debugging a slip that came out the wrong
           length: the three numbers together say which of the floor, the
           content and the ceiling decided it. */
        window.__receiptPageHeightMm = page;
        window.__receiptContentHeightMm = contentMm;
        window.__receiptOnOnePage = fits;

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
  /* Both default off the item count - see PAGE WIDTH BY ITEM COUNT and PAGE
     LENGTH BY ITEM COUNT at the top. The length is a floor, not a cap: the
     embedded sizing script raises it to the rendered content. */
  widthMm: number = getThermalPaperWidthMm(items.length),
  pageLengthMm: number = getThermalPageLengthMm(items.length),
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

      /*
       * No vertical padding: the logo starts on the first line of the page and
       * the returns policy ends on the last.
       *
       * This was 3mm top and bottom, which is 6mm of blank paper on every slip -
       * unmissable on a one-item sale, where it was most of what looked like an
       * over-long receipt. The bottom gap is now PAGE_TAIL_MM and nothing else,
       * so exactly one number decides it. The top needs none at all: @page has
       * margin: 0, and the blank strip above the print on a finished slip is the
       * printer's cut geometry (~10-15mm from head to cutter on an XP-Q200),
       * which no padding here can shorten or lengthen.
       *
       * Horizontal padding stays 0 as well - the side clearance the head needs is
       * SIDE_MARGIN_MM on the body, and putting it on both insets twice.
       */
      padding: 0;

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


    /* The savings note sits below the total rather than among the rows that
       make it up: the discount is already inside Subtotal, so printing it as a
       "- R x" line above the Total made the receipt's arithmetic read as wrong
       to the customer (900 + 135 - 100 was shown as 1035). Smaller and
       italicised so it reads as a note, not another term in the sum. */
    .totals .row.saved {

      font-size: 12px;

      font-style: italic;

      padding-top: 3px;
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

        /* As on screen: no top gap, and PAGE_TAIL_MM is the whole bottom gap. */
        padding: 0;
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


      <div class="row total">

        <span>
          Total
        </span>

        <span>
          ${fmt(Number(sale.total))}
        </span>

      </div>


      ${
        Number(sale.discount_total) > 0
          ? `
        <div class="row saved">

          <span>
            You saved
          </span>

          <span>
            ${fmt(Number(sale.discount_total))}
          </span>

        </div>
      `
          : ""
      }

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

    ${pageSizingScript(widthMm, pageLengthMm, Math.max(pageLengthMm, receiptPageCeilingMm()))}

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


    notifyError(

      `Could not print invoice ${sale.invoice_number}`,

      describePrintError(
        err,
      ),
    );


    return false;
  }
}