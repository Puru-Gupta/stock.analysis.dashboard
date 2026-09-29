"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle } from "lightweight-charts";

type Point = { date: string; close: number };
type FcPoint = { date: string; close: number; band_low: number; band_high: number };

export default function ForecastChart({
  history,
  forecast,
}: {
  history: Point[];
  forecast: FcPoint[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !history.length) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: "#1a2234" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#2a3548" }, horzLines: { color: "#2a3548" } },
      width: ref.current.clientWidth,
      height: 360,
    });

    const hist = chart.addLineSeries({ color: "#60a5fa", lineWidth: 2 });
    hist.setData(history.map((h) => ({ time: h.date, value: h.close })));

    const fc = chart.addLineSeries({
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
    });
    const bridge = history.length ? [{ time: history.at(-1)!.date, value: history.at(-1)!.close }] : [];
    fc.setData([
      ...bridge.map((b) => ({ time: b.time, value: b.value })),
      ...forecast.map((f) => ({ time: f.date, value: f.close })),
    ]);

    const bandHi = chart.addLineSeries({
      color: "rgba(245,158,11,0.25)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
    });
    bandHi.setData(forecast.map((f) => ({ time: f.date, value: f.band_high })));

    const bandLo = chart.addLineSeries({
      color: "rgba(245,158,11,0.25)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
    });
    bandLo.setData(forecast.map((f) => ({ time: f.date, value: f.band_low })));

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [history, forecast]);

  return <div ref={ref} className="w-full rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }} />;
}
