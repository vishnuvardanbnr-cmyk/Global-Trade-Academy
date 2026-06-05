import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickChart, type Candle, type ChartHandle } from "@/components/chart/CandlestickChart";
import {
  MousePointer2,
  Crosshair,
  Minus,
  TrendingUp,
  Pencil,
  Type,
  Ruler,
  ZoomIn,
  Trash2,
  Square,
  Circle,
  GitBranch,
  SlidersHorizontal,
  Bell,
  RotateCcw,
  RotateCw,
  RefreshCw,
  ChevronDown,
  Loader2,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PriceData = { price: number; change: string; up: boolean; open: number; high: number; low: number };
type Prices    = Record<string, PriceData>;

const SYMBOLS = [
  { symbol: "BTC/USD",  name: "Bitcoin",       market: "Crypto"    },
  { symbol: "ETH/USD",  name: "Ethereum",      market: "Crypto"    },
  { symbol: "EUR/USD",  name: "Euro/Dollar",   market: "Forex"     },
  { symbol: "GBP/USD",  name: "Pound/Dollar",  market: "Forex"     },
  { symbol: "XAU/USD",  name: "Gold",          market: "Commodity" },
  { symbol: "SPX500",   name: "S&P 500",       market: "Index"     },
  { symbol: "USD/JPY",  name: "Dollar/Yen",    market: "Forex"     },
  { symbol: "AUD/USD",  name: "Aussie/Dollar", market: "Forex"     },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"] as const;

const LEFT_TOOLS = [
  { icon: MousePointer2, label: "Cursor",      group: 1 },
  { icon: Crosshair,     label: "Crosshair",   group: 1 },
  { icon: TrendingUp,    label: "Trend Line",  group: 2 },
  { icon: Minus,         label: "Horiz. Line", group: 2 },
  { icon: GitBranch,     label: "Vert. Line",  group: 2 },
  { icon: Pencil,        label: "Brush",       group: 3 },
  { icon: Square,        label: "Rectangle",   group: 3 },
  { icon: Circle,        label: "Circle",      group: 3 },
  { icon: Type,          label: "Text",        group: 4 },
  { icon: Ruler,         label: "Measure",     group: 5 },
  { icon: ZoomIn,        label: "Zoom",        group: 5 },
];

function formatPrice(price: number | undefined, symbol: string): string {
  if (price == null) return "—";
  if (symbol === "USD/JPY") return price.toFixed(3);
  if (["EUR/USD", "GBP/USD", "AUD/USD"].includes(symbol)) return price.toFixed(5);
  if (symbol === "XAU/USD") return price.toFixed(2);
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Trading() {
  const [activeSymbol, setActiveSymbol]       = useState("BTC/USD");
  const [activeTimeframe, setActiveTimeframe] = useState<typeof TIMEFRAMES[number]>("1D");
  const [activeTool, setActiveTool]           = useState("Cursor");
  const [tooltipCandle, setTooltipCandle]     = useState<Candle | null>(null);
  const [symbolOpen, setSymbolOpen]           = useState(false);
  const chartRef = useRef<ChartHandle>(null);

  const { data: candles, isLoading, isError, refetch } = useQuery<Candle[]>({
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

  const { data: prices } = useQuery<Prices>({
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

  /* ── OHLC fields ── */
  const ohlc = displayCandle
    ? [
        { k: "O", v: formatPrice(displayCandle.open,  activeSymbol) },
        { k: "H", v: formatPrice(displayCandle.high,  activeSymbol) },
        { k: "L", v: formatPrice(displayCandle.low,   activeSymbol) },
        { k: "C", v: formatPrice(displayCandle.close, activeSymbol) },
      ]
    : [];

  return (
    /* Full dark container — overrides page background */
    <div className="flex flex-col h-full bg-[#131722] text-white select-none overflow-hidden rounded-xl">

      {/* ══ TOP BAR ════════════════════════════════════════════════ */}
      <div className="flex items-center gap-0 h-[46px] border-b border-[#2a2e39] shrink-0 px-1">

        {/* Symbol picker */}
        <div className="relative">
          <button
            onClick={() => setSymbolOpen((o) => !o)}
            className="flex items-center gap-1.5 h-[46px] px-3 hover:bg-[#1e222d] transition-colors font-semibold text-sm"
          >
            <span className="text-white">{activeSymbol}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#787b86] transition-transform", symbolOpen && "rotate-180")} />
          </button>
          {symbolOpen && (
            <div className="absolute top-full left-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-52 mt-0.5">
              {SYMBOLS.map((s) => {
                const p = prices?.[s.symbol];
                return (
                  <button
                    key={s.symbol}
                    onClick={() => { setActiveSymbol(s.symbol); setSymbolOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#2a2e39] transition-colors",
                      activeSymbol === s.symbol && "bg-[#2a2e39]",
                    )}
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{s.symbol}</p>
                      <p className="text-[10px] text-[#787b86]">{s.name} · {s.market}</p>
                    </div>
                    {p && (
                      <span className={cn("text-[10px] font-bold", p.up ? "text-[#26a69a]" : "text-[#ef5350]")}>
                        {p.up ? "+" : ""}{p.change}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[#2a2e39] mx-1" />

        {/* Timeframes */}
        <div className="flex items-center">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={cn(
                "px-2.5 h-[46px] text-xs font-semibold transition-colors",
                activeTimeframe === tf
                  ? "text-white bg-[#2962ff]/20 border-b-2 border-[#2962ff]"
                  : "text-[#787b86] hover:text-white hover:bg-[#1e222d]",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[#2a2e39] mx-1" />

        {/* Action buttons */}
        <div className="flex items-center">
          {[
            { icon: SlidersHorizontal, label: "Indicators" },
            { icon: Bell,              label: "Alert"       },
            { icon: RotateCcw,         label: "Undo"        },
            { icon: RotateCw,          label: "Redo"        },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              className="flex items-center gap-1.5 px-2.5 h-[46px] text-[#787b86] hover:text-white hover:bg-[#1e222d] transition-colors text-xs"
            >
              <Icon className="h-4 w-4" />
              {label === "Indicators" && <span className="text-xs font-medium hidden sm:inline">{label}</span>}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* OHLC display */}
        {displayCandle && (
          <div className="hidden lg:flex items-center gap-3 text-xs mr-3">
            {ohlc.map(({ k, v }) => (
              <span key={k} className="text-[#787b86]">
                {k} <span className={cn("font-semibold", k === "H" ? "text-[#26a69a]" : k === "L" ? "text-[#ef5350]" : "text-white")}>{v}</span>
              </span>
            ))}
            <span className={cn("font-bold text-xs", isUp ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {isUp ? "+" : ""}{(((displayCandle.close - displayCandle.open) / displayCandle.open) * 100).toFixed(2)}%
            </span>
          </div>
        )}

        {/* Price + change */}
        <div className="flex items-center gap-2 px-3 border-l border-[#2a2e39] h-full">
          {activePrice ? (
            <>
              <span className="font-bold text-sm text-white tabular-nums">
                {formatPrice(activePrice.price, activeSymbol)}
              </span>
              <span className={cn("text-xs font-bold", activePrice.up ? "text-[#26a69a]" : "text-[#ef5350]")}>
                {activePrice.up ? "+" : ""}{activePrice.change}%
              </span>
            </>
          ) : (
            <span className="text-[#787b86] text-xs">{activeInfo.market}</span>
          )}
          <button
            onClick={() => refetch()}
            title="Refresh"
            className="text-[#787b86] hover:text-white transition-colors ml-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ══ MAIN AREA ══════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left toolbar ────────────────────────────────────── */}
        <div className="w-10 border-r border-[#2a2e39] flex flex-col items-center pt-2 pb-2 gap-0.5 shrink-0">
          {LEFT_TOOLS.map(({ icon: Icon, label }, i) => {
            const prev = LEFT_TOOLS[i - 1];
            const showDivider = i > 0 && prev && prev.group !== LEFT_TOOLS[i].group;
            return (
              <div key={label} className="w-full flex flex-col items-center">
                {showDivider && <div className="w-6 h-px bg-[#2a2e39] my-1" />}
                <button
                  title={label}
                  onClick={() => setActiveTool(label)}
                  className={cn(
                    "w-8 h-8 flex items-center justify-center rounded transition-colors",
                    activeTool === label
                      ? "bg-[#2962ff]/20 text-[#2962ff]"
                      : "text-[#787b86] hover:text-white hover:bg-[#1e222d]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          {/* Push delete to bottom */}
          <div className="flex-1" />
          <div className="w-6 h-px bg-[#2a2e39] mb-1" />
          {/* Delete mode button — select to click-erase individual drawings */}
          <button
            title="Delete drawing (click one)"
            onClick={() => setActiveTool("Delete")}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded transition-colors",
              activeTool === "Delete"
                ? "bg-[#ef5350]/20 text-[#ef5350]"
                : "text-[#787b86] hover:text-[#ef5350] hover:bg-[#1e222d]",
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {/* Clear all drawings */}
          <button
            title="Clear all drawings"
            onClick={() => chartRef.current?.clearDrawings()}
            className="w-8 h-8 flex items-center justify-center rounded text-[#787b86] hover:text-white hover:bg-[#1e222d] transition-colors text-[9px] font-bold mt-0.5"
          >
            ALL
          </button>
        </div>

        {/* ── Chart canvas ────────────────────────────────────── */}
        <div className="flex-1 relative min-w-0 min-h-0">
          {/* Symbol + market label overlay */}
          <div className="absolute top-2 left-3 z-10 pointer-events-none">
            <span className="text-[#787b86] text-[11px] font-medium">
              {activeInfo.symbol} · {activeInfo.market} · {activeTimeframe}
            </span>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#131722]/90">
              <Loader2 className="h-8 w-8 text-[#2962ff] animate-spin" />
              <p className="text-sm text-[#787b86]">
                Loading {activeSymbol} · {activeTimeframe}…
              </p>
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
              <WifiOff className="h-8 w-8 text-[#ef5350]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Chart data unavailable</p>
                <p className="text-xs text-[#787b86] mt-1">Market may be closed or Deriv is unreachable</p>
              </div>
              <button
                onClick={() => refetch()}
                className="text-xs font-semibold text-[#2962ff] hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {candles && candles.length > 0 && (
            <CandlestickChart
              ref={chartRef}
              candles={candles}
              symbol={activeSymbol}
              timeframe={activeTimeframe}
              activeTool={activeTool}
              onCrosshairMove={setTooltipCandle}
            />
          )}
        </div>
      </div>
    </div>
  );
}
