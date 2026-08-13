"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "moneydashboard_virtual_portfolio";
const CLIENT_ID_KEY = "moneydashboard_client_id";

export interface VirtualHolding {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  atrAtEntry: number;
  atrStop: number;
  peakPrice?: number;
  targetWeight?: number;
  source: "recommendation" | "manual";
}

export interface VirtualPortfolioMeta {
  createdAt: string;
  monthlyCapital: number;
}

export interface VirtualPortfolioState {
  holdings: VirtualHolding[];
  meta: VirtualPortfolioMeta;
}

export interface StopUpdate {
  id: string;
  atr_stop: number;
  peak_price: number;
}

const DEFAULT_META: VirtualPortfolioMeta = {
  createdAt: new Date().toISOString().split("T")[0],
  monthlyCapital: 100_000,
};

function getClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function loadPortfolio(): VirtualPortfolioState {
  if (typeof window === "undefined") {
    return { holdings: [], meta: DEFAULT_META };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as VirtualPortfolioState;
  } catch {
    /* ignore */
  }
  return { holdings: [], meta: DEFAULT_META };
}

function savePortfolio(state: VirtualPortfolioState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function syncToCloud(clientId: string, state: VirtualPortfolioState) {
  if (!clientId) return;
  try {
    await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, state }),
    });
  } catch {
    /* offline / no supabase */
  }
}

export function useVirtualPortfolio() {
  const [state, setState] = useState<VirtualPortfolioState>({ holdings: [], meta: DEFAULT_META });
  const [ready, setReady] = useState(false);
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    setState(loadPortfolio());
    setClientId(getClientId());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    savePortfolio(state);
    if (clientId) syncToCloud(clientId, state);
  }, [state, ready, clientId]);

  const addHolding = useCallback(
    (input: Omit<VirtualHolding, "id"> & { id?: string }) => {
      setState((prev) => {
        const existing = prev.holdings.find((h) => h.symbol === input.symbol);
        if (existing) {
          return {
            ...prev,
            holdings: prev.holdings.map((h) =>
              h.symbol === input.symbol
                ? {
                    ...h,
                    quantity: h.quantity + input.quantity,
                    entryPrice:
                      (h.entryPrice * h.quantity + input.entryPrice * input.quantity) /
                      (h.quantity + input.quantity),
                    entryDate: input.entryDate,
                    atrAtEntry: input.atrAtEntry,
                    atrStop: input.atrStop,
                    peakPrice: Math.max(h.peakPrice ?? h.entryPrice, input.entryPrice),
                    targetWeight: input.targetWeight ?? h.targetWeight,
                  }
                : h,
            ),
          };
        }
        return {
          ...prev,
          holdings: [
            ...prev.holdings,
            {
              ...input,
              id: input.id ?? newId(),
              peakPrice: input.peakPrice ?? input.entryPrice,
            },
          ],
        };
      });
    },
    [],
  );

  const removeHolding = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      holdings: prev.holdings.filter((h) => h.id !== id),
    }));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setState((prev) => ({
        ...prev,
        holdings: prev.holdings.filter((h) => h.id !== id),
      }));
      return;
    }
    setState((prev) => ({
      ...prev,
      holdings: prev.holdings.map((h) => (h.id === id ? { ...h, quantity } : h)),
    }));
  }, []);

  const updateStops = useCallback((updates: StopUpdate[]) => {
    if (!updates.length) return;
    const map = new Map(updates.map((u) => [u.id, u]));
    setState((prev) => ({
      ...prev,
      holdings: prev.holdings.map((h) => {
        const u = map.get(h.id);
        if (!u) return h;
        return { ...h, atrStop: u.atr_stop, peakPrice: u.peak_price };
      }),
    }));
  }, []);

  const setMonthlyCapital = useCallback((monthlyCapital: number) => {
    setState((prev) => ({ ...prev, meta: { ...prev.meta, monthlyCapital } }));
  }, []);

  const clearPortfolio = useCallback(() => {
    setState({ holdings: [], meta: { ...DEFAULT_META, createdAt: new Date().toISOString().split("T")[0] } });
  }, []);

  return {
    holdings: state.holdings,
    meta: state.meta,
    ready,
    clientId,
    addHolding,
    removeHolding,
    updateQuantity,
    updateStops,
    setMonthlyCapital,
    clearPortfolio,
  };
}
