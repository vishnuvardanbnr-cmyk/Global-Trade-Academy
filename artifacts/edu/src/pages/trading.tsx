import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  ColorType,
  CandlestickSeries as CandlestickSeriesDef,
  HistogramSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Candle     = { time: number; open: number; high: number; low: number; close: number };
type PriceData  = { price: number; change: string; up: boolean; open: number; high: number; low: number };
type Prices     = Record<string, PriceData>;

const SYMBOLS = [
  { symbol: "BTC/USD", name: "Bitcoin",      market: "Crypto",    emoji: "₿" },
  { symbol: "ETH/USD", name: "Ethereum",     market: "Crypto",    emoji: "Ξ" },
  { symbol: "EUR/USD", name: "Euro/Dollar",  market: "Forex",     emoji: "€" },
  { symbol: "GBP/USD", name: "Pound/Dollar", market: "Forex",     emoji: "£" },
  { symbol: "XAU/USD", name: "Gold",         market: "Commodity", emoji: "Au" },
  { symbol: "SPX500",  name: "S&P 500",      market: "Index",     emoji: "📈" },
  { symbol: "USD/JPY", name: "Dollar/Yen",   market: "Forex",     emoji: "¥" },
  { symbol: "AUD/USD", name: "Aussie/Dollar", market: "Forex",    emoji: "A$" },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"] as const;

function formatPrice(price: number | undefined, symbol: string): string {
  if (price == null) return "—";
  if (symbol === "EUR/USD" || symbol === "GBP/USD" || symbol === "USD/JPY" || symbol === "AUD/USD") {
    return price.toFixed(symbol === "USD/JPY" ? 3 : 5);
  }
  if (symbol === "XAU/USD") return "$" + price.toFixed(2);
  return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceDiff(a: number, b: number) {
  return ((b - a) / a) * 100;
}

export default function Trading() {
  const chartContainerRef   = useRef<HTMLDivElement>(null);
  const chartRef            = useRef<IChartApi | null>(null);
  const candleSeriesRef     = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef     = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [activeSymbol, setActiveSymbol]       = useState("BTC/USD");
  const [activeTimeframe, setActiveTimeframe] = useState("1D");
  const [tooltipCandle, setTooltipCandle]     = useState<Candle | null>(null);

  const { data: candles, isLoading: candlesLoading, isError: candlesError, refetch } = useQuery<Candle[]>({
    queryKey: ["market-candles", activeSymbol, activeTimeframe],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/market/candles?symbol=${encodeURIComponent(activeSymbol)}&tf=${activeTimeframe}`, { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Candle[]>;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: prices, isLoading: pricesLoading } = useQuery<Prices>({
    queryKey: ["market-prices"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/prices", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Prices>;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  /* ── Build / rebuild chart ───────────────────────────────────── */
  const initChart = useCallback(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    // Destroy previous
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const isDark = document.documentElement.classList.contains("dark");
    const textColor   = isDark ? "#94a3b8" : "#64748b";
    const gridColor   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
    const bgColor     = "transparent";

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontFamily: "'Inter', 'system-ui', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3b82f6", labelBackgroundColor: "#3b82f6", width: 1, style: 3 },
        horzLine: { color: "#3b82f6", labelBackgroundColor: "#3b82f6", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      width:  el.clientWidth,
      height: el.clientHeight,
      handleScroll: true,
      handleScale:  true,
    });

    const candleSeries = chart.addSeries(CandlestickSeriesDef, {
      upColor:       "#10b981",
      downColor:     "#ef4444",
      borderVisible: false,
      wickUpColor:   "#10b981",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:    { type: "volume" },
      priceScaleId:   "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 } });

    chartRef.current        = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !candleSeries) { setTooltipCandle(null); return; }
      const data = param.seriesData.get(candleSeries) as Candle | undefined;
      if (data) setTooltipCandle(data);
    });

    const onResize = () => {
      if (el && chartRef.current) {
        chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []);

  useEffect(() => {
    const cleanup = initChart();
    return cleanup;
  }, [initChart]);

  /* ── Feed data into series ───────────────────────────────────── */
  useEffect(() => {
    if (!candles?.length || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleSeriesRef.current.setData(candles as any);

    const volData = candles.map((c, i) => ({
      time:  c.time,
      value: i > 0 ? Math.abs(c.close - c.open) * 1000 : 0,
      color: c.close >= c.open ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volumeSeriesRef.current.setData(volData as any);
    chartRef.current?.timeScale().fitContent();

    setTooltipCandle(candles.at(-1) ?? null);
  }, [candles]);

  const activeInfo  = SYMBOLS.find((s) => s.symbol === activeSymbol) ?? SYMBOLS[0];
  const activePrice = prices?.[activeSymbol];
  const displayCandle = tooltipCandle ?? candles?.at(-1);
  const isUp = displayCandle ? displayCandle.close >= displayCandle.open : true;

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Markets</h1>
          <p className="text-sm text-muted-foreground">Live candlestick data via Deriv · stored &amp; served from your database</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* ── Chart card ─────────────────────────────────────────── */}
      <Card className="flex-1 shadow-xs border-border flex flex-col min-h-0">
        {/* Chart header */}
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-border">
          {/* Left: symbol info + OHLC */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-extrabold text-foreground tracking-tight">{activeInfo.symbol}</span>
              <Badge variant="secondary" className="text-xs font-semibold">{activeInfo.market}</Badge>
              {activePrice ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                  <Wifi className="h-2.5 w-2.5" /> Live
                </span>
              ) : !pricesLoading ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <WifiOff className="h-2.5 w-2.5" /> Offline
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-2xl font-extrabold text-foreground tabular-nums">
                {pricesLoading
                  ? <span className="inline-block h-7 w-32 bg-secondary rounded-lg animate-pulse align-middle" />
                  : formatPrice(activePrice?.price, activeSymbol)}
              </span>
              {activePrice && (
                <span className={cn(
                  "flex items-center gap-0.5 text-sm font-bold",
                  activePrice.up ? "text-emerald-600" : "text-red-500",
                )}>
                  {activePrice.up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {activePrice.up ? "+" : ""}{activePrice.change}%
                </span>
              )}
            </div>

            {/* OHLC row */}
            {displayCandle && (
              <div className="flex items-center gap-4 text-xs">
                {(["open","high","low","close"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="text-muted-foreground uppercase font-medium tracking-wide">{k[0]}</span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      k === "close"
                        ? (isUp ? "text-emerald-600" : "text-red-500")
                        : k === "high"
                          ? "text-emerald-600"
                          : k === "low"
                            ? "text-red-500"
                            : "text-foreground",
                    )}>
                      {formatPrice(displayCandle[k], activeSymbol)}
                    </span>
                  </div>
                ))}
                {displayCandle && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground uppercase font-medium tracking-wide">Chg</span>
                    <span className={cn("font-bold tabular-nums", isUp ? "text-emerald-600" : "text-red-500")}>
                      {isUp ? "+" : ""}{priceDiff(displayCandle.open, displayCandle.close).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: timeframe picker */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-xl p-1 self-start">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                  activeTimeframe === tf
                    ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Chart body */}
        <CardContent className="flex-1 p-0 relative min-h-0">
          {/* Loading overlay */}
          {candlesLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 rounded-b-xl backdrop-blur-sm">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Fetching {activeSymbol} · {activeTimeframe} candles…
              </p>
            </div>
          )}

          {/* Error state */}
          {candlesError && !candlesLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground px-8">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <WifiOff className="h-7 w-7 text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Chart data unavailable</p>
                <p className="text-xs mt-1">Market may be closed or Deriv is temporarily unreachable</p>
              </div>
              <button onClick={() => refetch()} className="text-xs font-semibold text-primary hover:underline">
                Try again
              </button>
            </div>
          )}

          <div ref={chartContainerRef} className="w-full h-full" style={{ minHeight: "500px" }} />
        </CardContent>
      </Card>

    </div>
  );
}
