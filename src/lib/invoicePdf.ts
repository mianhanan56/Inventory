import { createElement } from 'react';
import { Sale, SaleItem } from '../types';
import {
  PAGE_WIDTH_MM,
  RECEIPT_PREVIEW_WIDTH_PX,
  generateInvoiceHTML,
  withReceiptDocument,
} from './invoices';

/* ══════════════════════════════════════════════════════════════════════════
   INVOICE -> PDF

   The PDF is a picture of the very receipt the printer gets, not a second
   rendering of the same data. The receipt is laid out off screen exactly as it
   is for printing, rasterised, and dropped onto a page the same width as the
   printed slip and exactly as tall as the content - so the download always
   matches the slip, and printing the PDF later produces the same slip again. A parallel layout in
   PDF primitives would be a second thing to keep in step with the first, and
   the first is the one that has to be right.
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
  /** JPEG data URI of the receipt block. */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

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

  const { svg, heightPx } = await withReceiptDocument(html, (doc) => {
    const receipt = doc.querySelector<HTMLElement>('.invoice');
    if (!receipt) throw new PdfError('The receipt could not be laid out for export.');

    const height = Math.ceil(receipt.getBoundingClientRect().height);
    if (!height) throw new PdfError('The receipt measured as empty.');

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

  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), widthPx: width, heightPx };
}

/**
 * Build the invoice as a one-page PDF, the width of the printed slip and as
 * tall as its content. Resolves with the PDF bytes.
 */
export async function renderInvoicePdf(sale: Sale, items: SaleItem[]): Promise<Blob> {
  const raster = await rasteriseReceipt(generateInvoiceHTML(sale, items));

  // The raster is the whole page, so the page is the raster: the same width the
  // receipt is printed at, height straight off the image's own aspect ratio.
  const pageWidthPt = PAGE_WIDTH_MM * PT_PER_MM;
  const pageHeightPt = pageWidthPt * (raster.heightPx / raster.widthPx);

  // Loaded on demand: the PDF engine is far bigger than the rest of the app and
  // most sessions never export anything.
  const { Document, Image: PdfImage, Page, pdf } = await import('@react-pdf/renderer');

  const document = createElement(
    Document,
    { title: `Invoice ${sale.invoice_number}` },
    createElement(
      Page,
      { size: [pageWidthPt, pageHeightPt], style: { margin: 0, padding: 0 } },
      createElement(PdfImage, {
        src: raster.dataUrl,
        style: { width: pageWidthPt, height: pageHeightPt },
      }),
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
