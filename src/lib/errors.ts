/**
 * Shared surfacing for failed Supabase writes.
 *
 * Every feature screen used to `await supabase.from(...)` without looking at
 * `error`, so a rejected write closed the modal and re-loaded the list exactly
 * as a successful one did — the user was told nothing and believed it saved.
 * The most common case is a duplicate SKU: `products.sku` is UNIQUE and a
 * soft-deleted product keeps its SKU, so re-adding a discontinued product fails
 * with 23505 and silently did nothing.
 *
 * This keeps the alert()-based presentation the app already uses in the POS
 * (message / code / details / hint concatenated, plus a console.error) rather
 * than introducing a toast layer.
 */

export interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Plain-language explanation for the constraint codes this app can actually
 * trip, so the operator behind the counter is not left reading Postgres jargon.
 * Anything not listed falls through to the raw error text.
 */
function plainLanguage(err: SupabaseErrorLike): string | null {
  switch (err.code) {
    case '23505':
      // The only unique constraints in the schema are products.sku and
      // sales.invoice_number; the POS handles the latter with its retry loop.
      return 'That SKU is already used by another product. Note that a deleted product keeps its SKU, so you may be reusing one.';
    case '23514':
      return err.details?.includes('current_stock')
        || err.message?.includes('current_stock_non_negative')
        ? 'That would take stock below zero. Someone else may have sold the same items already — reload and check the current stock.'
        : null;
    case '23503':
      return 'This record is still referenced by something else (a sale, or a stock movement), so it cannot be changed that way.';
    default:
      return null;
  }
}

/** Build the human-readable text for an error, without showing it. */
export function formatError(err: unknown): string {
  const e = err as SupabaseErrorLike | null;
  const friendly = e ? plainLanguage(e) : null;

  const parts = [
    friendly ?? e?.message,
    e?.code ? `code: ${e.code}` : null,
    // With a plain-language explanation the raw message is still worth keeping
    // as the detail line, so a report to support has something to work with.
    friendly && e?.message ? e.message : null,
    e?.details ? `details: ${e.details}` : null,
    e?.hint ? `hint: ${e.hint}` : null,
  ].filter(Boolean);

  if (parts.length) return parts.join('\n');
  if (err instanceof Error) return err.message;
  return JSON.stringify(err) || 'Unknown error';
}

/**
 * Where a reported error is shown. ToastProvider fills this in on mount so
 * failures surface as toasts; this module is imported by non-component code, so
 * it cannot reach the toast hook itself.
 */
type ErrorNotifier = (title: string, detail: string) => void;

let notifier: ErrorNotifier | null = null;

export function setErrorNotifier(fn: ErrorNotifier | null): void {
  notifier = fn;
}

/**
 * Log and show a failed write. `action` is the user's intent, phrased to read
 * naturally in front of the reason — e.g. "Product could not be saved".
 *
 * Falls back to alert() when no notifier is registered, so an error raised
 * before the provider mounts is still seen rather than lost to the console.
 */
export function reportError(action: string, err: unknown): void {
  console.error(`${action}:`, err);
  notifyError(action, formatError(err));
}

/**
 * Show an already-worded failure. For callers that describe their own problem
 * (printing, PDF export) rather than handing over a Supabase error object.
 */
export function notifyError(title: string, detail: string): void {
  if (notifier) notifier(title, detail);
  else alert(`${title}:\n${detail}`);
}
