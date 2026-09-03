import { useCallback, useEffect, useState } from "react";

const PERSISTENT_STATE_EVENT = "firewatch:persistent-state";

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;

    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const writeValue = useCallback((nextValue: T) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(nextValue));
      window.dispatchEvent(new CustomEvent(PERSISTENT_STATE_EVENT, { detail: { key, value: nextValue } }));
    } catch {
      // Ignore storage errors so the UI still works in restricted browsers.
    }
  }, [key]);

  const setPersistentValue = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) => {
      const nextValue = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
      writeValue(nextValue);
      return nextValue;
    });
  }, [writeValue]);

  useEffect(() => {
    const readStoredValue = () => {
      try {
        const stored = window.localStorage.getItem(key);
        if (stored) setValue(JSON.parse(stored) as T);
      } catch {
        // Ignore malformed persisted data.
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) readStoredValue();
    };

    const handlePersistentState = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (detail?.key === key) setValue(detail.value);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(PERSISTENT_STATE_EVENT, handlePersistentState);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(PERSISTENT_STATE_EVENT, handlePersistentState);
    };
  }, [key]);

  return [value, setPersistentValue] as const;
}
