"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "moneydashboard_app_cache";

type CacheStore = Record<string, unknown>;

function readStore(): CacheStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CacheStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

interface AppCacheContextValue {
  get: <T>(key: string) => T | undefined;
  set: (key: string, value: unknown) => void;
  clear: (key: string) => void;
}

const AppCacheContext = createContext<AppCacheContextValue | null>(null);

export function AppCacheProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<CacheStore>(() => readStore());

  const get = useCallback(
    <T,>(key: string): T | undefined => store[key] as T | undefined,
    [store],
  );

  const set = useCallback((key: string, value: unknown) => {
    setStore((prev) => {
      const next = { ...prev, [key]: value };
      writeStore(next);
      return next;
    });
  }, []);

  const clear = useCallback((key: string) => {
    setStore((prev) => {
      const next = { ...prev };
      delete next[key];
      writeStore(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ get, set, clear }), [get, set, clear]);

  return <AppCacheContext.Provider value={value}>{children}</AppCacheContext.Provider>;
}

export function useAppCache() {
  const ctx = useContext(AppCacheContext);
  if (!ctx) throw new Error("useAppCache must be used within AppCacheProvider");
  return ctx;
}

/** Read cached slice once on mount; returns undefined if none. */
export function useCachedSlice<T>(key: string): T | undefined {
  const { get } = useAppCache();
  return get<T>(key);
}
