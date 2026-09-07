import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X } from 'lucide-react';
import { Sale, SaleItem } from '../../types';
import {
  generateInvoiceHTML,
  getThermalPaperWidthMm,
  receiptFrameWidthPx,
} from '../../lib/invoices';
import { PAPER_WIDTH_MM } from '../../lib/qz';
import { downloadInvoicePdf } from '../../lib/invoicePdf';
import { notifyError } from '../../lib/errors';
import { useThermalPrinter } from '../../hooks/useThermalPrinter';
import { useToast } from '../ui/Toast';

/** Height used until the receipt has been measured. */
const INITIAL_PREVIEW_HEIGHT_PX = 640;

/** The logo decodes after load and changes the height; re-measure after this. */
const SETTLE_DELAY_MS = 400;

/**
 * The receipt at true paper size, grown to its full height.
 *
 * Sizing the frame to its content is the point: left at a fixed height, a long
 * invoice gets its own scrollbar inside the modal's scrollbar, and checking
 * sixty line items through a nested scroll is exactly what made the old flow
 * unusable. One frame, one scrollbar, top to bottom.
 */
function ReceiptFrame({ html, widthMm }: { html: string; widthMm: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_PREVIEW_HEIGHT_PX);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    setHeight(INITIAL_PREVIEW_HEIGHT_PX);
    let alive = true;

    const measure = () => {
      const receipt = frame.contentDocument?.querySelector('.invoice');
      if (!alive || !receipt) return;
      const measured = Math.ceil(receipt.getBoundingClientRect().height);
      if (measured) setHeight(measured);
    };

    frame.addEventListener('load', measure);
    const settle = window.setTimeout(measure, SETTLE_DELAY_MS);

    return () => {
      alive = false;
      frame.removeEventListener('load', measure);
      window.clearTimeout(settle);
    };
  }, [html]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={html}
      title="Invoice preview"
      className="mx-auto bg-white shadow-lg"
      style={{ width: receiptFrameWidthPx(widthMm), height }}
    />
  );
}

interface InvoicePreviewModalProps {
  sale: Sale;
  items: SaleItem[];
  onClose: () => void;
}

/**
 * Show the invoice exactly as it will print, then print it.
 *
 * Every print button in the app opens this first. Printing straight from a list
 * row gave the cashier no chance to check what was on the slip until it was
 * already on paper - and on a till roll that is not a mistake you can undo.
 */
export default function InvoicePreviewModal({ sale, items, onClose }: InvoicePreviewModalProps) {
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const thermal = useThermalPrinter();

  /*
   * Preview at the width the route about to be used prints at.
   *
   * The thermal route is always 80mm - it writes to the head's own dots, so
   * there is no driver to shrink a wider page back down. The browser route
   * still follows the item-count rule in invoices.ts. Showing one width and
   * printing the other is how a preview stops being a preview.
   */
  const printing = thermal.printing;
  const widthMm =
    thermal.status === 'ready' ? PAPER_WIDTH_MM : getThermalPaperWidthMm(items.length);
  const html = useMemo(
    () => generateInvoiceHTML(sale, items, widthMm),
    [sale, items, widthMm],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /*
    Hold the page still behind the overlay. Besides being what a modal should
    do, scrolling the list underneath a backdrop-blur makes Chrome repaint the
    blur a frame late, which flashes a sharp band of the page across the top of
    the overlay - the strip that appeared above the dialog.
  */
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const fmt = (v: number) =>
    `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lineCount = items.length;
  const unitCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  async function handlePrint() {
    const outcome = await thermal.print(sale, items);

    if (!outcome) {
      notifyError(
        `Could not print invoice ${sale.invoice_number}`,
        thermal.error ?? 'Printing failed for an unknown reason.',
      );
      return;
    }

    if (outcome.route === 'thermal') {
      toast.success(
        `Invoice ${sale.invoice_number} printed`,
        `${outcome.printer} · ${Math.round(outcome.heightMm ?? 0)}mm of paper`,
      );
    } else {
      /* Printed, but through the dialog - and on the driver's idea of a page
         rather than ours, which is the whole reason QZ Tray is there. Say so:
         a slip with a blank tail is otherwise blamed on the app. */
      toast.info(
        `Invoice ${sale.invoice_number} printed through the browser`,
        'QZ Tray is not running on this machine, so the paper length is the ' +
          "printer driver's rather than the receipt's.",
      );
    }

    onClose();
  }

  async function handleDownload() {
    setSaving(true);
    try {
      await downloadInvoicePdf(sale, items);
    } catch (err) {
      console.error(`Could not export invoice ${sale.invoice_number}`, err);
      notifyError(
        `Could not save invoice ${sale.invoice_number} as a PDF`,
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    /*
      Rendered on <body> rather than in place. In the page tree the dialog sits
      inside the scrolling content it is covering, which leaves it at the mercy
      of any ancestor that establishes a containing block for fixed positioning.
      On the body it is always the viewport it covers.
    */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 bg-navy-800 text-black">
          <div>
            <h2 className="text-lg font-semibold">Invoice {sale.invoice_number}</h2>
            <p className="text-navy-400 text-xs mt-0.5">Check the items below, then print.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-navy-600 rounded-lg transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 px-6 py-2.5 bg-navy-700/40 border-b border-navy-600/30 text-sm">
          <span className="text-navy-300">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'} &middot; {unitCount}{' '}
            {unitCount === 1 ? 'unit' : 'units'}
          </span>
          <span className="text-black font-semibold">Total {fmt(Number(sale.total))}</span>
        </div>

        {/*
          Which route this slip is about to take.

          Not decoration: the two routes produce visibly different paper, and
          the difference has been blamed on the receipt layout for two months.
          A cashier who can see "QZ Tray not running" before pressing Print
          knows why the slip that comes out has a blank tail.
        */}
        <div className="flex items-center justify-between gap-3 px-6 py-2 border-b border-navy-600/30 text-xs">
          {thermal.status === 'ready' ? (
            <>
              <span className="text-navy-300">
                Printing to <span className="text-black font-medium">{thermal.printer}</span> ·
                cut to length
              </span>
              {thermal.printers.length > 1 && (
                <select
                  value={thermal.preferredPrinter ?? ''}
                  onChange={(e) => void thermal.selectPrinter(e.target.value || null)}
                  className="bg-navy-700 border border-navy-600/50 rounded-md px-2 py-1 text-black"
                  title="Printer QZ Tray should send receipts to"
                >
                  <option value="">Detect automatically</option>
                  {thermal.printers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : thermal.status === 'connecting' ? (
            <span className="text-navy-400">Looking for the thermal printer…</span>
          ) : (
            <>
              <span className="text-navy-400">
                QZ Tray is not running — this slip will print through the browser dialog, at
                whatever length the printer driver decides.
              </span>
              <button
                onClick={() => void thermal.refresh()}
                className="shrink-0 px-2 py-1 bg-navy-600 hover:bg-navy-500 rounded-md text-black font-medium transition"
              >
                Retry
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-navy-700 py-4">
          <ReceiptFrame html={html} widthMm={widthMm} />
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 bg-navy-800 border-t border-navy-600/30">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-black hover:bg-navy-600 rounded-lg text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-navy-600 hover:bg-navy-500 disabled:opacity-60 text-black rounded-lg text-sm font-medium transition"
          >
            <Download className="w-4 h-4" /> {saving ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-2 px-4 py-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-black rounded-lg text-sm font-semibold transition"
          >
            <Printer className="w-4 h-4" /> {printing ? 'Printing…' : 'Print'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
