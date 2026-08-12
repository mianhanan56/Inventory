import { createElement } from 'react';
import { Sale, SaleItem } from '../types';
import {
  MAX_PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  RECEIPT_PREVIEW_WIDTH_PX,
  generateInvoiceHTML,
  withReceiptDocument,
} from './invoices';

/* ══════════════════════════════════════════════════════════════════════════
   INVOICE -> PDF

   The PDF is a picture of the very receipt the printer gets, not a second
   rendering of the same data. The receipt is laid out off screen exactly as it
   is for printing, rasterised, and dropped onto pages the same width as the
   printed slip and exactly as tall as the content - so the download always
   matches the slip, and printing the PDF later produces the same slip again. A parallel layout in
   PDF primitives would be a second thing to keep in step with the first, and
   the first is the one that has to be right.

   "Printing the PDF later" is not the rare case it sounds like: a saved invoice
   reprinted from the downloads folder goes through a PDF viewer, and a viewer
   fits each PDF page onto the paper the driver is set to. That is why the pages
   here are capped at the same height the print path caps its own - a single
   page tall enough to hold sixty lines is one a viewer has to shrink to fit an
   A4 sheet, and it shrinks the width by the same factor, which is the narrow,
   small-type slip with blank paper down both sides. Capped, every page fits as
   it is, and the reprint is the same width as the original.
   ══════════════════════════════════════════════════════════════════════════ */

/** Points per millimetre - the PDF unit. */
const PT_PER_MM = 72 / 25.4;

/**
 * Raster density as a multiple of CSS pixels. 2x puts roughly 192dpi on the
 * page: sharp on screen and on any office printer, and close enough to a
 * thermal head's 203dpi that reprinting the PDF loses nothing visible.
 */
const RASTER_SCALE = 2;

/** JPEG rather than PNG: a long receipt is mostly white, and this keeps the
 *  file in the hundreds of kilobytes instead of the megabytes. */
const JPEG_QUALITY = 0.92;

export class PdfError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PdfError';
    this.cause = cause;
  }
}

interface ReceiptRaster {
  /** The whole receipt, drawn at RASTER_SCALE, for the pages to be cut from. */
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  /**
   * Offsets from the top of the receipt, in CSS pixels, where a page may end
   * without cutting through a line. The bottom edge of every block that the
   * print stylesheet refuses to break across a page, in document order.
   */
  cutsPx: number[];
}

/**
 * Blocks that must not be split by a page break, matching the selectors the
 * receipt stylesheet marks break-inside:avoid. Kept in step with that rule: a
 * block listed there and not here would be cut in half by the slicer.
 */
const UNBREAKABLE = '.header, tbody tr, .totals .row, .returns-policy';

/**
 * Rasterise the receipt at the size it prints.
 *
 * The markup goes through an SVG foreignObject, which is parsed as XML - hence
 * XMLSerializer rather than innerHTML, and hence the stylesheet being escaped
 * before it is inlined.
 *
 * The capture is the full width of the page, not just the printed block. The
 * receipt's own page rules come along with the markup whether the capture box
 * makes room for them or not, so a box any narrower than the page the
 * stylesheet lays out clips the right-hand column off.
 */
async function rasteriseReceipt(html: string): Promise<ReceiptRaster> {
  const width = RECEIPT_PREVIEW_WIDTH_PX;

  const { svg, heightPx, cutsPx } = await withReceiptDocument(html, (doc) => {
    const receipt = doc.querySelector<HTMLElement>('.invoice');
    if (!receipt) throw new PdfError('The receipt could not be laid out for export.');

    const bounds = receipt.getBoundingClientRect();
    const height = Math.ceil(bounds.height);
    if (!height) throw new PdfError('The receipt measured as empty.');

    // Measured now, while the receipt is still laid out: once it is a raster
    // there is no way to tell a line boundary from the middle of a line.
    const cuts = Array.from(doc.querySelectorAll<HTMLElement>(UNBREAKABLE))
      .map((el) => el.getBoundingClientRect().bottom - bounds.top)
      .filter((y) => y > 0 && y < height)
      .sort((a, b) => a - b);

    const styles = Array.from(doc.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n')
      .replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));

    // Pin the page width inline so it cannot disagree with the capture box.
    const body =
      `<body xmlns="http://www.w3.org/1999/xhtml" ` +
      `style="margin:0;background:#fff;width:${width}px">` +
      `<style>${styles}</style>${new XMLSerializer().serializeToString(receipt)}</body>`;

    return {
      heightPx: height,
      cutsPx: cuts,
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<foreignObject width="${width}" height="${height}">${body}</foreignObject></svg>`,
    };
  });

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new PdfError('The receipt could not be rendered for export.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * RASTER_SCALE);
  canvas.height = Math.round(heightPx * RASTER_SCALE);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PdfError('This browser cannot export the invoice.');

  // JPEG has no transparency: paint the paper white first, or the receipt
  // comes out on a black background.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return { canvas, widthPx: width, heightPx, cutsPx };
}

/**
 * Split the receipt into page-sized runs, each ending on a line boundary.
 *
 * Returns the top and bottom of each page in CSS pixels. Greedy from the top:
 * every page takes as many whole blocks as will fit under the limit, so the
 * breaks fall as late as they can and the pages come out as full as they can.
 * A single block taller than a whole page - which needs a product name long
 * enough to wrap some forty times - is cut where the page ends, because a page
 * that cannot hold it has to end somewhere and stopping instead would refuse
 * the export outright.
 */
function paginate(heightPx: number, cutsPx: number[], maxPx: number): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  let top = 0;

  while (heightPx - top > maxPx) {
    const fits = cutsPx.filter((y) => y > top && y - top <= maxPx);
    const bottom = fits.length ? fits[fits.length - 1] : top + maxPx;
    pages.push([top, bottom]);
    top = bottom;
  }

  pages.push([top, heightPx]);
  return pages;
}

/** Crop one page out of the full-height receipt raster. */
function sliceRaster(source: HTMLCanvasElement, top: number, bottom: number): string {
  const y = Math.round(top * RASTER_SCALE);
  const height = Math.round(bottom * RASTER_SCALE) - y;

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PdfError('This browser cannot export the invoice.');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, y, source.width, height, 0, 0, source.width, height);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Build the invoice as a PDF the width of the printed slip, in pages as tall as
 * their content. Resolves with the PDF bytes.
 *
 * Almost every invoice is one page. The cap only divides receipts long enough
 * that a single page could not be printed without being shrunk, and it divides
 * them at line boundaries, so the pages abut into the same continuous slip.
 */
export async function renderInvoicePdf(sale: Sale, items: SaleItem[]): Promise<Blob> {
  const raster = await rasteriseReceipt(generateInvoiceHTML(sale, items));

  // The raster is the width of the page, so the two are locked together: pixels
  // convert to points at one ratio, and every page gets the same width.
  const pageWidthPt = PAGE_WIDTH_MM * PT_PER_MM;
  const ptPerPx = pageWidthPt / raster.widthPx;
  const maxPx = (MAX_PAGE_HEIGHT_MM * PT_PER_MM) / ptPerPx;

  const pages = paginate(raster.heightPx, raster.cutsPx, maxPx).map(([top, bottom]) => ({
    src: sliceRaster(raster.canvas, top, bottom),
    heightPt: (bottom - top) * ptPerPx,
  }));

  // Loaded on demand: the PDF engine is far bigger than the rest of the app and
  // most sessions never export anything.
  const { Document, Image: PdfImage, Page, pdf } = await import('@react-pdf/renderer');

  const document = createElement(
    Document,
    { title: `Invoice ${sale.invoice_number}` },
    ...pages.map((page, index) =>
      createElement(
        Page,
        {
          key: index,
          size: [pageWidthPt, page.heightPt],
          style: { margin: 0, padding: 0 },
        },
        createElement(PdfImage, {
          src: page.src,
          style: { width: pageWidthPt, height: page.heightPt },
        }),
      ),
    ),
  );

  try {
    return await pdf(document).toBlob();
  } catch (err) {
    throw new PdfError('The invoice PDF could not be created.', err);
  }
}

/** Build the invoice PDF and save it as `<invoice number>.pdf`. */
export async function downloadInvoicePdf(sale: Sale, items: SaleItem[]): Promise<void> {
  const blob = await renderInvoicePdf(sale, items);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sale.invoice_number}.pdf`;
  link.click();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
