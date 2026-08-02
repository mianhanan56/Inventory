import { useCallback, useEffect, useRef, useState } from 'react';
import { Sale, SaleItem } from '../types';
import { printInvoice } from '../lib/invoices';
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

  /** Print an invoice. Returns true on success; `error` holds the reason otherwise. */
  const print = useCallback(async (sale: Sale, items: SaleItem[]) => {
    setPrinting(true);
    setError(null);
    try {
      const result = await printInvoice(sale, items);
      if (mounted.current) {
        setPrinter(result.printer);
        setStatus('ready');
      }
      return true;
    } catch (err) {
      if (mounted.current) {
        setError(describePrintError(err));
        setStatus('error');
      }
      return false;
    } finally {
      if (mounted.current) setPrinting(false);
    }
  }, []);

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
