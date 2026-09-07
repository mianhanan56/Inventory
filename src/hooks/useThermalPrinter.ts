import { useCallback, useEffect, useRef, useState } from 'react';
import { Sale, SaleItem } from '../types';
import { PrintReceiptOutcome, printSaleReceipt } from '../lib/printReceipt';
import {
  connect,
  describePrintError,
  detectPrinter,
  getPreferredPrinter,
  isConnected,
  listPrinters,
  setPreferredPrinter,
} from '../lib/qz';

export type PrinterStatus = 'idle' | 'connecting' | 'ready' | 'error';

/**
 * QZ Tray state for the UI: connection status, the detected 80mm printer, the
 * list of installed printers, and a print action that reports its own errors.
 *
 * A failed handshake is not a failure of the app. It means this machine has no
 * QZ Tray - a dev laptop, or a till where it is not running yet - and printing
 * falls back to the browser. `status` is what the UI uses to say so; it is
 * never a reason to block the print button.
 */
export function useThermalPrinter({ autoConnect = true } = {}) {
  const [status, setStatus] = useState<PrinterStatus>('idle');
  const [printer, setPrinter] = useState<string | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      await connect();
      const [all, detected] = await Promise.all([listPrinters(), detectPrinter()]);
      if (!mounted.current) return;
      setPrinters(all);
      setPrinter(detected);
      setStatus('ready');
    } catch (err) {
      if (!mounted.current) return;
      setPrinters([]);
      setPrinter(null);
      setError(describePrintError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (autoConnect) void refresh();
  }, [autoConnect, refresh]);

  /** Pin the printer QZ Tray should use, or pass null to auto-detect again. */
  const selectPrinter = useCallback(
    async (name: string | null) => {
      setPreferredPrinter(name);
      await refresh();
    },
    [refresh],
  );

  /**
   * Print an invoice. Resolves with the outcome - which route it took and, on
   * the thermal route, how much paper it used - or null when both routes
   * failed, in which case `error` holds the reason.
   */
  const print = useCallback(
    async (sale: Sale, items: SaleItem[]): Promise<PrintReceiptOutcome | null> => {
      setPrinting(true);
      setError(null);
      try {
        const outcome = await printSaleReceipt(sale, items);
        if (mounted.current && outcome.printer) {
          setPrinter(outcome.printer);
          setStatus('ready');
        }
        return outcome;
      } catch (err) {
        if (mounted.current) {
          setError(describePrintError(err));
          setStatus('error');
        }
        return null;
      } finally {
        if (mounted.current) setPrinting(false);
      }
    },
    [],
  );

  return {
    status,
    connected: isConnected(),
    printer,
    printers,
    preferredPrinter: getPreferredPrinter(),
    printing,
    error,
    refresh,
    selectPrinter,
    print,
  };
}
