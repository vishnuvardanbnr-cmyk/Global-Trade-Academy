import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, CandlestickSeries as CandlestickSeriesDef } from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, RefreshCw, Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Candle = { time: number; open: number; high: number; low: number; close: number };
type PriceData = { price: number; change: string; up: boolean; open: number; high: number; low: number };
type Prices = Record<string, PriceData>;

const WATCHLIST = [
  { symbol: "BTC/USD", name: "Bitcoin",      market: "Crypto"    },
  { symbol: "ETH/USD", name: "Ethereum",     market: "Crypto"    },
  { symbol: "EUR/USD", name: "Euro/Dollar",  market: "Forex"     },
  { symbol: "GBP/USD", name: "Pound/Dollar", market: "Forex"     },
  { symbol: "XAU/USD", name: "Gold",         market: "Commodity" },
  { symbol: "SPX500",  name: "S&P 500",      market: "Index"     },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

function formatPrice(price: number | undefined, symbol: string): string {
  if (price == null) return "—";
  const isForex = (symbol === "EUR/USD" || symbol === "GBP/USD");
  if (isForex) return price.toFixed(5);
  return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Trading() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeSymbol, setActiveSymbol] = useState("BTC/USD");
  const [activeTimeframe, setActiveTimeframe] = useState("1D");

  const {
    data: candles,
    isLoading: candlesLoading,
    isError: candlesError,
    refetch: refetchCandles,
  } = useQuery<Candle[]>({
    queryKey: ["market-candles", activeSymbol, activeTimeframe],
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/market/candles?symbol=${encodeURIComponent(activeSymbol)}&tf=${activeTimeframe}`,
        { signal },
      );
      if (!r.ok) throw new Error("Failed to fetch candles");
      return r.json() as Promise<Candle[]>;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: prices, isLoading: pricesLoading } = useQuery<Prices>({
    queryKey: ["market-prices"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/prices", { signal });
      if (!r.ok) throw new Error("Failed to fetch prices");
      return r.json() as Promise<Prices>;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  /* Rebuild chart whenever candle data changes */
  useEffect(() => {
    if (!chartContainerRef.current || !candles?.length) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.04)" },
        horzLines: { color: "rgba(0,0,0,0.04)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      crosshair: {
        vertLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" },
        horzLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" },
      },
      rightPriceScale: { borderColor: "rgba(0,0,0,0.06)" },
      timeScale: { borderColor: "rgba(0,0,0,0.06)", timeVisible: true },
    });

    const series = chart.addSeries(CandlestickSeriesDef, {
      upColor:      "#10b981",
      downColor:    "#ef4444",
      borderVisible: false,
      wickUpColor:  "#10b981",
      wickDownColor:"#ef4444",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData(candles as any);
    chart.timeScale().fitContent();

    const onResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.remove(); };
  }, [candles]);

  const activeInfo  = WATCHLIST.find((w) => w.symbol === activeSymbol) ?? WATCHLIST[0];
  const activePrice = prices?.[activeSymbol];
  const lastCandle  = candles?.at(-1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Markets</h1>
          <p className="text-sm text-muted-foreground">Live candlestick charts powered by Deriv</p>
        </div>
        <button
          onClick={() => refetchCandles()}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/70 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* ── Chart panel ─────────────────────────────────────── */}
        <Card className="lg:col-span-3 shadow-xs border-border">
          <CardHeader className="pb-3 border-b border-border">
            {/* Symbol + price row */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-foreground">{activeInfo.symbol}</h2>
                  <Badge variant="secondary" className="text-xs">{activeInfo.market}</Badge>
                  {pricesLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : activePrice ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                      <Wifi className="h-2.5 w-2.5" /> Live
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <WifiOff className="h-2.5 w-2.5" /> Offline
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 mt-1">
                  <span className="text-2xl font-extrabold text-foreground tabular-nums">
                    {pricesLoading
                      ? <span className="inline-block h-7 w-28 bg-secondary rounded animate-pulse align-middle" />
                      : formatPrice(activePrice?.price, activeSymbol)}
                  </span>
                  {activePrice && (
                    <span className={cn(
                      "flex items-center gap-0.5 text-sm font-semibold",
                      activePrice.up ? "text-emerald-600" : "text-red-500",
                    )}>
                      {activePrice.up
                        ? <ArrowUpRight className="h-4 w-4" />
                        : <ArrowDownRight className="h-4 w-4" />}
                      {activePrice.up ? "+" : ""}{activePrice.change}%
                    </span>
                  )}
                </div>
              </div>

              {/* Timeframe picker */}
              <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setActiveTimeframe(tf)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                      activeTimeframe === tf
                        ? "bg-white text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* OHLC row — from real last candle */}
            {lastCandle && (
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                {([
                  ["Open",  lastCandle.open ],
                  ["High",  lastCandle.high ],
                  ["Low",   lastCandle.low  ],
                  ["Close", lastCandle.close],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label}>
                    <span className="font-medium">{label} </span>
                    <span className="text-foreground font-semibold tabular-nums">{formatPrice(val, activeSymbol)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardHeader>

          {/* Chart body */}
          <CardContent className="p-0 pt-2 relative">
            {/* Loading overlay */}
            {candlesLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 rounded-b-xl">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Loading {activeSymbol} · {activeTimeframe} data…
                </p>
              </div>
            )}

            {/* Error state */}
            {candlesError && !candlesLoading && (
              <div className="flex flex-col items-center justify-center h-[400px] gap-3 text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                  <WifiOff className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Chart data unavailable</p>
                  <p className="text-xs mt-0.5">Market may be closed or temporarily offline</p>
                </div>
                <button
                  onClick={() => refetchCandles()}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Try again
                </button>
              </div>
            )}

            <div ref={chartContainerRef} className="w-full" style={{ height: "400px" }} />
          </CardContent>
        </Card>

        {/* ── Watchlist ─────────────────────────────────────── */}
        <Card className="shadow-xs border-border flex flex-col">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm font-semibold">Watchlist</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="divide-y divide-border">
              {WATCHLIST.map((item) => {
                const p = prices?.[item.symbol];
                return (
                  <button
                    key={item.symbol}
                    onClick={() => setActiveSymbol(item.symbol)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors",
                      activeSymbol === item.symbol
                        ? "bg-primary/5 border-l-2 border-primary"
                        : "hover:bg-secondary/50 border-l-2 border-transparent",
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.symbol}</p>
                      <p className="text-xs text-muted-foreground">{item.name}</p>
                    </div>
                    <div className="text-right">
                      {pricesLoading ? (
                        <div className="space-y-1.5">
                          <div className="h-3.5 w-16 bg-secondary rounded animate-pulse" />
                          <div className="h-3 w-10 bg-secondary rounded animate-pulse ml-auto" />
                        </div>
                      ) : p ? (
                        <>
                          <p className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPrice(p.price, item.symbol)}
                          </p>
                          <p className={cn(
                            "text-xs font-semibold flex items-center justify-end gap-0.5",
                            p.up ? "text-emerald-600" : "text-red-500",
                          )}>
                            {p.up
                              ? <ArrowUpRight className="h-3 w-3" />
                              : <ArrowDownRight className="h-3 w-3" />}
                            {p.up ? "+" : ""}{p.change}%
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Market stats ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Market Cap",    value: "$2.37T", sub: "Total crypto",  up: true,  delta: "+2.1%" },
          { label: "24h Volume",    value: "$94.8B", sub: "Global trading", up: true,  delta: "+5.4%" },
          { label: "BTC Dominance", value: "54.2%",  sub: "Market share",  up: false, delta: "-0.3%" },
          { label: "Fear & Greed",  value: "72",     sub: "Greed",         up: true,  delta: "Bullish" },
        ].map((stat) => (
          <Card key={stat.label} className="shadow-xs border-border">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
              <div className="text-2xl font-extrabold text-foreground">{stat.value}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-muted-foreground">{stat.sub}</span>
                <span className={cn("text-xs font-semibold", stat.up ? "text-emerald-600" : "text-red-500")}>
                  {stat.delta}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
