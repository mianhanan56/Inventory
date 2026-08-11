import qz from "qz-tray";
import { Sale, SaleItem } from "../types";
import { LOGO_DATA_URI } from "./logo";

/* ══════════════════════════════════════════════════════════════════════════
   THERMAL RECEIPT PRINTING

   WIDTH:
   The invoice uses the full printable width of whatever paper the selected
   printer is configured for. QZ Tray/the browser cannot ask an arbitrary
   printer driver "how wide is your roll" - that number simply isn't exposed
   by the platform. DEFAULT_PAPER_WIDTH_MM is therefore the one place that
   value lives; it is a configured expectation (matching the roll the client
   has loaded today), not something baked into the layout. Call
   setThermalPaperWidthMm() to change it at runtime (e.g. from a future
   settings screen) without touching this file again.

   HEIGHT:
   The receipt height is calculated dynamically from the actual rendered
   content, exactly as before. The only thing that changed is where that
   number goes: it used to become a browser @page size for window.print();
   now it becomes the QZ Tray print job's page size, so the printer gets one
   continuous receipt instead of a paginated document.
   ══════════════════════════════════════════════════════════════════════════ */

/** Fallback/default paper width, used until told otherwise. */
export const DEFAULT_PAPER_WIDTH_MM = 80;

/** Kept for compatibility with existing imports (preview + PDF export). */
export const PAPER_WIDTH_MM = DEFAULT_PAPER_WIDTH_MM;

/**
 * Kept for compatibility with existing imports.
 *
 * IMPORTANT:
 * This is NOT used to restrict the invoice anymore.
 */
export const CONTENT_WIDTH_MM = PAPER_WIDTH_MM;

/**
 * The width actually used for the next QZ Tray print job. Starts at
 * DEFAULT_PAPER_WIDTH_MM; override with setThermalPaperWidthMm() if the
 * client's roll isn't ~80mm.
 */
let thermalPaperWidthMm = DEFAULT_PAPER_WIDTH_MM;

export function getThermalPaperWidthMm(): number {
  return thermalPaperWidthMm;
}

export function setThermalPaperWidthMm(mm: number): void {
  if (Number.isFinite(mm) && mm > 0) {
    thermalPaperWidthMm = mm;
  }
}

/**
 * Force a specific QZ Tray printer instead of auto-detecting one. Pass null
 * to go back to auto-detection.
 */
let preferredThermalPrinterName: string | null = null;

export function setThermalPrinterName(name: string | null): void {
  preferredThermalPrinterName = name;
}

/** 1mm in CSS pixels at 96dpi. */
const PX_PER_MM = 96 / 25.4;

/** Preview width. */
export const RECEIPT_PREVIEW_WIDTH_PX = Math.round(
  PAPER_WIDTH_MM * PX_PER_MM,
);

/** Preview frame width. */
export const RECEIPT_PREVIEW_FRAME_WIDTH_PX =
  RECEIPT_PREVIEW_WIDTH_PX + 18;

/**
 * Small amount of space after the final line.
 *
 * DO NOT change this.
 */
const PAGE_TAIL_MM = 2;


/* ══════════════════════════════════════════════════════════════════════════
   RECEIPT PAGE HEIGHT
   ══════════════════════════════════════════════════════════════════════════ */

function pageSizingScript(widthMm: number): string {
  return `
    (function () {

      var PAPER_MM = ${widthMm};
      var TAIL_MM = ${PAGE_TAIL_MM};
      var PX_PER_MM = 96 / 25.4;

      var pageStyle = document.createElement('style');

      pageStyle.id = 'receipt-page-size';

      document.head.appendChild(pageStyle);


      function sizePage() {

        var receipt =
          document.querySelector('.invoice');

        if (!receipt) {
          return 0;
        }


        /*
         * Measure the COMPLETE rendered receipt.
         *
         * Do not use body.scrollHeight because the body can be as tall
         * as the iframe viewport.
         */
        var px = Math.max(
          receipt.getBoundingClientRect().height,
          receipt.scrollHeight
        );


        if (!px) {
          return 0;
        }


        /*
         * Convert CSS pixels to millimetres.
         */
        var page = Math.ceil(
          px / PX_PER_MM + TAIL_MM
        );


        /*
         * IMPORTANT:
         *
         * Width = full 80mm paper
         * Height = actual receipt content
         *
         * This prevents the browser from using Letter/A4/default height.
         */
        pageStyle.textContent =
          '@page {' +
          '  size: ' + PAPER_MM + 'mm ' + page + 'mm;' +
          '  margin: 0;' +
          '}' +

          '@media print {' +

          '  html, body {' +
          '    width: ' + PAPER_MM + 'mm;' +
          '    height: ' + page + 'mm;' +
          '    max-height: ' + page + 'mm;' +
          '    margin: 0;' +
          '    padding: 0;' +
          '    overflow: hidden;' +
          '  }' +

          '  .invoice {' +
          '    width: ' + PAPER_MM + 'mm;' +
          '    max-width: ' + PAPER_MM + 'mm;' +
          '    max-height: ' + page + 'mm;' +
          '    overflow: hidden;' +
          '  }' +

          '}';


        window.__receiptPageHeightMm = page;

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
  widthMm: number = thermalPaperWidthMm,
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
       * IMPORTANT:
       *
       * Do NOT use 72mm here.
       *
       * The invoice uses the complete paper width.
       */
      width: ${widthMm}mm;

      margin: 0 auto;

      background: #fff;

      -webkit-print-color-adjust: exact;

      print-color-adjust: exact;
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

      /*
       * IMPORTANT:
       *
       * Full paper width.
       *
       * Previously:
       *
       *   width: 72mm;
       *
       * Now:
       *
       *   width: 80mm;
       *
       * So the unused side space is removed.
       */
      width: ${widthMm}mm;

      max-width: ${widthMm}mm;

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
      width: 46%;
    }


    th:nth-child(2),
    td:nth-child(2) {
      width: 7%;
    }


    th:nth-child(3),
    td:nth-child(3) {
      width: 18%;
    }


    th:nth-child(4),
    td:nth-child(4) {
      width: 9%;
    }


    th:nth-child(5),
    td:nth-child(5) {
      width: 20%;
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

        width: ${widthMm}mm + 20mm;

        margin: 0;

        padding: 0;
      }


      .invoice {

        width: ${widthMm}mm;

        max-width: ${widthMm}mm;
      

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

   Renders the receipt to a single bitmap, the same way the PDF export
   always has: through an SVG foreignObject (parsed as XML, hence
   XMLSerializer and the escaped stylesheet) rather than innerHTML.

   This is also what QZ Tray printing uses. QZ's own HTML-format printing
   goes through its bundled Chromium print-to-PDF pipeline, which - on real
   hardware - was observed silently scaling the whole receipt down (width
   included) once it got tall enough, and stamping browser print
   headers/footers onto the paper. Sending a plain image instead removes
   that "page" abstraction entirely: QZ just lays out a bitmap at a given
   physical size, so there is nothing left to auto-paginate or auto-scale.
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
   QZ TRAY CONNECTION

   No qz.security.setCertificatePromise/setSignaturePromise calls here on
   purpose. Without them QZ Tray runs in its unsigned mode: the first print
   from this app pops a "this app is requesting to print, allow?" dialog on
   the till itself, which the operator approves once. That is the
   development-friendly path and it is fine for a single-till setup.

   PRODUCTION SIGNING:
   To remove that prompt permanently, QZ Tray needs a real certificate/key
   pair and, before the first call in this file that touches qz.websocket or
   qz.print, you would add:

     qz.security.setCertificatePromise((resolve) => resolve(PEM_CERT_TEXT));
     qz.security.setSignaturePromise((toSign) => (resolve, reject) =>
       fetch('/your-backend/sign-qz-request', { method: 'POST', body: toSign })
         .then((r) => r.text()).then(resolve, reject)
     );

   The private key must live on a server that signs requests on demand - it
   must never be shipped in this frontend bundle.
   ══════════════════════════════════════════════════════════════════════════ */

async function ensureQzConnected(): Promise<void> {

  if (qz.websocket.isActive()) {
    return;
  }

  try {

    await qz.websocket.connect();

  } catch (err) {

    throw new PrintError(
      "QZ Tray is not running. Please install/start QZ Tray and try again.",
      err,
    );
  }
}


/**
 * Name fragments commonly found in thermal/receipt printer names, used only
 * to prefer a thermal-looking printer when more than one is installed. This
 * is a convenience heuristic, not a guarantee - it deliberately does not
 * assume any specific make or model.
 */
const THERMAL_PRINTER_NAME_HINTS = [
  "thermal", "receipt", "pos", "tm-", "tm_", "epson", "star", "bixolon",
  "citizen", "zjiang", "zj-", "xprinter", "rongta", "gprinter", "sprt",
  "sewoo", "sunmi", "goojprt",
];

/**
 * All printer names QZ Tray can currently see. Exposed so a future settings
 * screen can let an operator pick a printer explicitly via
 * setThermalPrinterName() - this file adds no UI of its own.
 */
export async function getAvailablePrinters(): Promise<string[]> {

  await ensureQzConnected();

  const found = await qz.printers.find();

  return Array.isArray(found) ? found : found ? [found] : [];
}

async function resolveThermalPrinterName(): Promise<string> {

  if (preferredThermalPrinterName) {
    return preferredThermalPrinterName;
  }

  let names: string[] = [];

  try {

    names = await getAvailablePrinters();

  } catch {

    // qz.printers.find() failing isn't fatal on its own - fall through
    // and try the system default printer instead.
  }

  const thermalMatch = names.find((name) =>
    THERMAL_PRINTER_NAME_HINTS.some((hint) =>
      name.toLowerCase().includes(hint),
    ),
  );

  if (thermalMatch) {
    return thermalMatch;
  }

  try {

    const defaultPrinter = await qz.printers.getDefault();

    if (defaultPrinter) {
      return defaultPrinter;
    }

  } catch {

    // No default printer configured - fall through to whatever
    // qz.printers.find() returned, if anything.
  }

  if (names.length > 0) {
    return names[0];
  }

  throw new PrintError("No thermal printer was found.");
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINT RECEIPT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * CSS px -> print raster scale. 2x puts roughly 192dpi into the bitmap,
 * close enough to a thermal head's usual 203dpi that nothing looks chunky
 * on the physical receipt.
 */
const PRINT_RASTER_SCALE = 2;

export async function printReceiptHtml(
  html: string,
): Promise<number> {

  const widthMm = getThermalPaperWidthMm();
  const widthPx = Math.round(widthMm * PX_PER_MM);
  const tailPx = Math.round(PAGE_TAIL_MM * PX_PER_MM);

  /*
   * Same "measure the actual rendered content" concept as before - just
   * captured as a bitmap instead of written into an @page rule. See the
   * RECEIPT RASTER section above for why: QZ's own HTML print pipeline was
   * found (on real hardware) to silently rescale the whole receipt,
   * including its width, once the content got tall enough. A plain image
   * has no "page" for a driver to rescale - what we send is what prints,
   * at the exact size we measured.
   */
  const raster = await rasteriseReceiptHtml(
    html,
    {
      widthPx,
      extraBottomPx: tailPx,
      scale: PRINT_RASTER_SCALE,
      mimeType: "image/png",
    },
  );

  const heightMm = raster.heightPx / PX_PER_MM;

  await ensureQzConnected();

  const printerName = await resolveThermalPrinterName();

  /*
   * scaleContent is off deliberately: the image's aspect ratio already
   * matches widthMm:heightMm exactly (it was rasterised at that size), so
   * there is nothing to fit - scaling here would only risk softening the
   * print. margins is 0 so the driver doesn't add its own default page
   * margins on top of the receipt's own padding.
   */
  const config = qz.configs.create(
    printerName,
    {
      units: "mm",
      margins: 0,
      scaleContent: false,
      size: {
        width: widthMm,
        height: heightMm,
      },
    },
  );

  try {

    await qz.print(
      config,
      [
        {
          type: "pixel",
          format: "image",
          flavor: "base64",
          data: raster.dataUrl.replace(/^data:image\/\w+;base64,/, ""),
        },
      ],
    );

  } catch (err) {

    throw new PrintError(
      `The thermal printer could not print the receipt: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err,
    );
  }

  return Math.round(heightMm);
}


/* ══════════════════════════════════════════════════════════════════════════
   PRINT INVOICE
   ══════════════════════════════════════════════════════════════════════════ */

export function printInvoice(
  sale: Sale,
  items: SaleItem[],
): Promise<number> {

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