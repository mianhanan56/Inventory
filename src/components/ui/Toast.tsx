import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Ban, Info, X } from 'lucide-react';
import { setErrorNotifier } from '../../lib/errors';

/**
 * Toast notifications.
 *
 * Replaces the alert() calls the app used for every failure. alert() blocks the
 * whole tab until it is dismissed, which is the wrong shape for a till: the
 * cashier has to stop and click before they can even see the screen the message
 * is about. It also gave successes no feedback at all — a save that worked and a
 * save that silently failed looked identical.
 *
 * Errors stay up long enough to read and can be dismissed by hand; successes
 * fade on their own.
 */

type ToastVariant = 'success' | 'error' | 'info';

interface ToastRecord {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** An error is worth re-reading; a confirmation is not. */
const DURATION_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  error: 10000,
};

/** Older toasts drop off the top rather than filling the screen at a busy till. */
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  // Tracked so unmounting can clear pending timers rather than firing a state
  // update on a dead component.
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((variant: ToastVariant, title: string, description?: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, variant, title, description }].slice(-MAX_VISIBLE));
    timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION_MS[variant]));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(timer => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (title, description) => push('success', title, description),
    error: (title, description) => push('error', title, description),
    info: (title, description) => push('info', title, description),
    dismiss,
  }), [push, dismiss]);

  // Let reportError() in lib/errors.ts raise a toast. That helper is a plain
  // module used from non-component code, so it cannot call the hook itself; it
  // holds a notifier slot instead and falls back to alert() while none is set.
  useEffect(() => {
    setErrorNotifier((title, detail) => push('error', title, detail));
    return () => setErrorNotifier(null);
  }, [push]);

  // Dev only: `__toast.success('hello')` from the browser console. Lets a toast
  // be raised without going through a save, which separates "the toast system is
  // broken" from "that particular save never reached it".
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as Window & { __toast?: ToastApi }).__toast = api;
    return () => { delete (window as Window & { __toast?: ToastApi }).__toast; };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Degrades to alert() rather than throwing when no provider is above it. A
 * throw here takes the whole screen down at the moment of a save — the worst
 * possible time — over what is only a missing wrapper.
 */
const FALLBACK_API: ToastApi = {
  success: (title, description) => console.info(`[toast] ${title}`, description ?? ''),
  error: (title, description) => alert(description ? `${title}:\n${description}` : title),
  info: (title, description) => console.info(`[toast] ${title}`, description ?? ''),
  dismiss: () => {},
};

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    console.error('useToast was called outside a ToastProvider — falling back to alert().');
    return FALLBACK_API;
  }
  return context;
}

/**
 * `border` is a hairline on all four sides, tinted to the variant — not a thick
 * accent bar down one edge. The variant otherwise reads from the icon and from
 * the progress bar along the bottom, which doubles as the countdown to
 * auto-dismiss.
 */
const VARIANT_STYLES: Record<ToastVariant, {
  icon: typeof CheckCircle2;
  iconColor: string;
  border: string;
  bar: string;
}> = {
  success: { icon: CheckCircle2, iconColor: 'text-green-500', border: 'border-green-200', bar: 'bg-green-500' },
  error: { icon: Ban, iconColor: 'text-red-500', border: 'border-red-200', bar: 'bg-red-500' },
  info: { icon: Info, iconColor: 'text-blue-500', border: 'border-blue-200', bar: 'bg-blue-500' },
};

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return createPortal(
    /*
      Top right, and z-[60] so a toast is readable over the modals (z-50) that
      raise most of them. Full width on phones, where a fixed-width card in the
      corner would crowd the header actions.
    */
    <div className="fixed z-[60] top-4 md:top-6 right-4 md:right-6 left-4 md:left-auto flex flex-col gap-2 pointer-events-none md:w-[35rem]">
      {toasts.map(toast => {
        const { icon: Icon, iconColor, border, bar } = VARIANT_STYLES[toast.variant];
        return (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto relative overflow-hidden bg-white border ${border} rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.10)] animate-[toast-in_160ms_ease-out]`}
          >
            {/* items-center, so a one-line message sits level with the icon and
                the close button — which is every message the app raises except a
                Supabase failure carrying detail lines. pb-4 leaves room for the
                progress bar to sit under the text rather than across it. */}
            <div className="flex items-center gap-4 pl-5 pr-4 pt-3 pb-4">
              <Icon className={`w-7 h-7 shrink-0 ${iconColor}`} strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-navy-100 text-[17px] leading-6">{toast.title}</p>
                {toast.description && (
                  /* whitespace-pre-line: Supabase detail/hint lines arrive
                     newline separated from formatError(). */
                  <p className="text-navy-400 text-[13px] leading-5 mt-1 whitespace-pre-line break-words">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-navy-300 hover:text-navy-100 transition shrink-0 self-center"
                title="Dismiss"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Countdown. Width is animated rather than transform-scaled so it
                empties from the right edge without needing a transform origin,
                and the duration is the toast's own so the bar always reaches
                zero exactly as it disappears. */}
            <div
              className={`absolute bottom-0 left-0 h-1.5 ${bar} animate-[toast-progress_linear_forwards]`}
              style={{ animationDuration: `${DURATION_MS[toast.variant]}ms` }}
            />
          </div>
        );
      })}
    </div>,
    document.body
  );
}
