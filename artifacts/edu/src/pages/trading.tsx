import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickChart, type Candle } from "@/components/chart/CandlestickChart";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpRight,
  ArrowDownRight,
  Wifi,
  WifiOff,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PriceData = { price: number; change: string; up: boolean; open: number; high: number; low: number };
type Prices    = Record<string, PriceData>;

const SYMBOLS = [
  { symbol: "BTC/USD", name: "Bitcoin",       market: "Crypto"    },
  { symbol: "ETH/USD", name: "Ethereum",      market: "Crypto"    },
  { symbol: "EUR/USD", name: "Euro/Dollar",   market: "Forex"     },
  { symbol: "GBP/USD", name: "Pound/Dollar",  market: "Forex"     },
  { symbol: "XAU/USD", name: "Gold",          market: "Commodity" },
  { symbol: "SPX500",  name: "S&P 500",       market: "Index"     },
  { symbol: "USD/JPY", name: "Dollar/Yen",    market: "Forex"     },
  { symbol: "AUD/USD", name: "Aussie/Dollar", market: "Forex"     },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"] as const;

function formatPrice(price: number | undefined, symbol: string): string {
  if (price == null) return "—";
  if (symbol === "USD/JPY") return price.toFixed(3);
  if (["EUR/USD", "GBP/USD", "AUD/USD"].includes(symbol)) return price.toFixed(5);
  if (symbol === "XAU/USD") return "$" + price.toFixed(2);
  return "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Trading() {
  const [activeSymbol, setActiveSymbol]       = useState("BTC/USD");
  const [activeTimeframe, setActiveTimeframe] = useState<typeof TIMEFRAMES[number]>("1D");
  const [tooltipCandle, setTooltipCandle]     = useState<Candle | null>(null);

  const { data: candles, isLoading: candlesLoading, isError: candlesError, refetch } = useQuery<Candle[]>({
    queryKey: ["market-candles", activeSymbol, activeTimeframe],
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/market/candles?symbol=${encodeURIComponent(activeSymbol)}&tf=${activeTimeframe}`,
        { signal },
      );
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

  const activeInfo    = SYMBOLS.find((s) => s.symbol === activeSymbol) ?? SYMBOLS[0];
  const activePrice   = prices?.[activeSymbol];
  const displayCandle = tooltipCandle ?? candles?.at(-1);
  const isUp          = displayCandle ? displayCandle.close >= displayCandle.open : true;

  return (
    <Card className="flex flex-col h-full shadow-xs border-border min-h-0">
      {/* ── Chart header ───────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-border shrink-0">
        {/* Left: symbol selector + price + OHLC */}
        <div className="flex flex-col gap-1.5">
          {/* Symbol tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {SYMBOLS.map((s) => (
              <button
                key={s.symbol}
                onClick={() => setActiveSymbol(s.symbol)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
                  activeSymbol === s.symbol
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
              >
                {s.symbol}
              </button>
            ))}
          </div>

          {/* Price row */}
          <div className="flex items-center gap-2.5 mt-0.5">
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
              {(["open", "high", "low", "close"] as const).map((k) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="text-muted-foreground uppercase font-medium tracking-wide">{k[0]}</span>
                  <span className={cn(
                    "font-bold tabular-nums",
                    k === "close" ? (isUp ? "text-emerald-600" : "text-red-500")
                      : k === "high" ? "text-emerald-600"
                      : k === "low"  ? "text-red-500"
                      : "text-foreground",
                  )}>
                    {formatPrice(displayCandle[k], activeSymbol)}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground uppercase font-medium tracking-wide">Chg</span>
                <span className={cn("font-bold tabular-nums flex items-center gap-0.5", isUp ? "text-emerald-600" : "text-red-500")}>
                  {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {(((displayCandle.close - displayCandle.open) / displayCandle.open) * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: timeframe picker + refresh */}
        <div className="flex flex-col items-end gap-2 self-start">
          <div className="flex items-center gap-0.5 bg-secondary rounded-xl p-1">
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
          <button
            onClick={() => refetch()}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Chart body ─────────────────────────────────────── */}
      <CardContent className="flex-1 p-0 relative min-h-0">
        {/* Loading */}
        {candlesLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Fetching {activeSymbol} · {activeTimeframe} candles…
            </p>
          </div>
        )}

        {/* Error */}
        {candlesError && !candlesLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
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

        {/* Canvas chart */}
        {candles && candles.length > 0 && (
          <CandlestickChart
            candles={candles}
            symbol={activeSymbol}
            timeframe={activeTimeframe}
            onCrosshairMove={setTooltipCandle}
          />
        )}
      </CardContent>
    </Card>
  );
}
