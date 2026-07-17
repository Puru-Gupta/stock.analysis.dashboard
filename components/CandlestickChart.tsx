"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";
import type { ChartBar } from "@/lib/api";

interface Props {
  data: ChartBar[];
  support?: number;
  resistance?: number;
  entryZone?: [number, number];
  stopLoss?: number;
  target?: number;
  target2?: number;
}

export default function CandlestickChart({
  data,
  support,
  resistance,
  entryZone,
  stopLoss,
  target,
  target2,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1a2234" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#2a3548" },
        horzLines: { color: "#2a3548" },
      },
      width: containerRef.current.clientWidth,
      height: 380,
      timeScale: { borderColor: "#2a3548" },
      rightPriceScale: { borderColor: "#2a3548" },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      color: "#3b82f6",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const candles = data.map((d) => ({
      time: d.date as string,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumes = data.map((d) => ({
      time: d.date as string,
      value: d.volume,
      color: d.close >= d.open ? "#22c55e40" : "#ef444440",
    }));

    candleSeries.setData(candles);
    volumeSeries.setData(volumes);

    const addLine = (price: number, color: string, title: string) => {
      candleSeries.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title,
      });
    };

    if (support) addLine(support, "#22c55e", "Support");
    if (resistance) addLine(resistance, "#ef4444", "Resistance");
    if (stopLoss) addLine(stopLoss, "#f59e0b", "Stop");
    if (target) addLine(target, "#3b82f6", "Target");
    if (target2) addLine(target2, "#8b5cf6", "T2");

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, support, resistance, stopLoss, target, target2]);

  if (!data.length) {
    return (
      <div className="flex h-[380px] items-center justify-center rounded-md text-sm" style={{ background: "var(--bg-secondary)", color: "var(--fg-tertiary)" }}>
        No chart data available
      </div>
    );
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />;
}
