import { createElement } from 'react';
import { Sale, SaleItem } from '../types';
import {
  PAPER_WIDTH_MM,
  RECEIPT_PREVIEW_WIDTH_PX,
  generateInvoiceHTML,
  rasteriseReceiptHtml,
} from './invoices';

/* ══════════════════════════════════════════════════════════════════════════
   INVOICE -> PDF

   The PDF is a picture of the very receipt the printer gets, not a second
   rendering of the same data. The receipt is laid out off screen exactly as it
   is for printing, rasterised, and dropped onto a page the same 80mm wide and
   exactly as tall as the content - so the download always matches the slip, and
   printing the PDF later produces the same slip again. A parallel layout in
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

/**
 * Build the invoice as a one-page PDF, 80mm wide and as tall as its content.
 * Resolves with the PDF bytes.
 *
 * The rasterisation (SVG foreignObject -> canvas) is shared with QZ Tray
 * printing in invoices.ts, so the PDF is a picture of the same receipt the
 * printer gets, not a second rendering of the same data.
 */
export async function renderInvoicePdf(sale: Sale, items: SaleItem[]): Promise<Blob> {
  const raster = await rasteriseReceiptHtml(generateInvoiceHTML(sale, items), {
    widthPx: RECEIPT_PREVIEW_WIDTH_PX,
    scale: RASTER_SCALE,
    mimeType: 'image/jpeg',
    quality: JPEG_QUALITY,
  }).catch((err) => {
    throw new PdfError('The invoice could not be rendered for export.', err);
  });

  // The raster is the whole page, so the page is the raster: same 80mm width,
  // height straight off the image's own aspect ratio.
  const pageWidthPt = PAPER_WIDTH_MM * PT_PER_MM;
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
