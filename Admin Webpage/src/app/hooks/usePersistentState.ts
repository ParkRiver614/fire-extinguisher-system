/**
 * localStorage에 값을 저장하는 useState.
 *
 * 새로고침해도 값이 남고, 같은 키를 쓰는 다른 컴포넌트/다른 탭과도 값이 동기화된다
 * (같은 탭은 커스텀 이벤트, 다른 탭은 브라우저 storage 이벤트로 알림).
 * 시크릿 모드처럼 저장이 막힌 브라우저에서도 화면은 그대로 동작하도록 저장 오류는 무시한다.
 */
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

  // 저장 + 같은 탭의 다른 구독자에게 알림(브라우저 storage 이벤트는 다른 탭에만 오므로).
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
