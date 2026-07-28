import { useEffect, useRef, useState } from 'react';

/**
 * useState that mirrors its value into localStorage, so the value survives
 * unmounting — e.g. when a screen is left and re-entered through sidebar
 * navigation. State is only lost when the caller explicitly resets it.
 */
export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initialValue : (JSON.parse(stored) as T);
    } catch {
      return initialValue;
    }
  });

  // Skip the write on first render so a failed/absent read doesn't immediately
  // overwrite whatever is stored under the key.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable (private mode) — persistence is best-effort.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
