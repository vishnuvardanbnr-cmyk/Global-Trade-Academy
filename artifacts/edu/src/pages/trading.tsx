import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CandlestickChart,
  type Candle,
  type ChartHandle,
  type ChartType,
} from "@/components/chart/CandlestickChart";
import { useDerivLiveCandles } from "@/hooks/useDerivLiveCandles";
import {
  MousePointer2, Crosshair, Minus, TrendingUp,
  Trash2, ChevronDown, Loader2, WifiOff, RefreshCw,
  CandlestickChart as CandleIcon, BarChart2, LineChart, Activity,
  LayoutDashboard, Check,
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

const CHART_TYPES: { type: ChartType; icon: React.ElementType; label: string }[] = [
  { type: "candle", icon: CandleIcon, label: "Candles"  },
  { type: "bar",    icon: BarChart2,  label: "Bars"     },
  { type: "line",   icon: LineChart,  label: "Line"     },
  { type: "area",   icon: Activity,   label: "Area"     },
];

const DRAWING_TOOLS = [
  { icon: MousePointer2, label: "Cursor",      group: 1 },
  { icon: Crosshair,     label: "Crosshair",   group: 1 },
  { icon: TrendingUp,    label: "Trend Line",  group: 2 },
  { icon: Minus,         label: "Horiz. Line", group: 2 },
];

interface IndicatorDef {
  id:        string;
  label:     string;
  sublabel?: string;
  color:     string;
  section:   "chart" | "panel";
}

const INDICATORS: IndicatorDef[] = [
  { id: "ma20",  label: "MA",     sublabel: "20",       color: "#f0b90b", section: "chart" },
  { id: "ma50",  label: "MA",     sublabel: "50",       color: "#2196f3", section: "chart" },
  { id: "ema20", label: "EMA",    sublabel: "20",       color: "#ff9800", section: "chart" },
  { id: "bb",    label: "BB",     sublabel: "20, 2",    color: "#9c27b0", section: "chart" },
  { id: "rsi",   label: "RSI",    sublabel: "14",       color: "#ce93d8", section: "panel" },
  { id: "macd",  label: "MACD",   sublabel: "12,26,9",  color: "#2196f3", section: "panel" },
];

function formatPrice(price: number | undefined, symbol: string): string {
  if (price == null) return "—";
  if (symbol === "USD/JPY") return price.toFixed(3);
  if (["EUR/USD", "GBP/USD", "AUD/USD"].includes(symbol)) return price.toFixed(5);
  if (symbol === "XAU/USD") return price.toFixed(2);
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Trading() {
  const [activeSymbol,    setActiveSymbol]    = useState("BTC/USD");
  const [activeTimeframe, setActiveTimeframe] = useState<typeof TIMEFRAMES[number]>("1m");
  const [activeTool,      setActiveTool]      = useState("Cursor");
  const [chartType,       setChartType]       = useState<ChartType>("candle");
  const [indicators,      setIndicators]      = useState<Set<string>>(new Set(["ma20", "ma50"]));
  const [tooltipCandle,   setTooltipCandle]   = useState<Candle | null>(null);
  const [symbolOpen,      setSymbolOpen]      = useState(false);
  const [indOpen,         setIndOpen]         = useState(false);

  const chartRef = useRef<ChartHandle>(null);

  const { candles, status, refetch } = useDerivLiveCandles(activeSymbol, activeTimeframe);
  const isLoading = status === "connecting" && candles.length === 0;
  const isError   = status === "error"      && candles.length === 0;

  const { data: prices } = useQuery<Prices>({
    queryKey:       ["market-prices"],
    queryFn:        async ({ signal }) => {
      const r = await fetch("/api/market/prices", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Prices>;
    },
    staleTime:      60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const activeInfo = SYMBOLS.find(s => s.symbol === activeSymbol) ?? SYMBOLS[0];
  const livePrice  = candles.at(-1)?.close;
  const prevClose  = candles.at(-2)?.close ?? candles.at(-1)?.open;
  const liveChange = livePrice && prevClose
    ? (((livePrice - prevClose) / prevClose) * 100)
    : null;
  const livePriceUp = liveChange !== null ? liveChange >= 0 : true;

  const displayCandle = tooltipCandle ?? candles.at(-1);
  const isUp = displayCandle ? displayCandle.close >= displayCandle.open : true;

  const ohlc = displayCandle
    ? [
        { k: "O", v: formatPrice(displayCandle.open,  activeSymbol) },
        { k: "H", v: formatPrice(displayCandle.high,  activeSymbol) },
        { k: "L", v: formatPrice(displayCandle.low,   activeSymbol) },
        { k: "C", v: formatPrice(displayCandle.close, activeSymbol) },
      ]
    : [];

  function toggleIndicator(id: string) {
    setIndicators(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full bg-[#131722] text-white select-none overflow-hidden rounded-xl">

      {/* ══ TOP BAR ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-center h-[46px] border-b border-[#2a2e39] shrink-0 px-1 gap-0.5">

        {/* Symbol picker */}
        <div className="relative">
          <button
            onClick={() => { setSymbolOpen(o => !o); setIndOpen(false); }}
            className="flex items-center gap-1.5 h-[46px] px-3 hover:bg-[#1e222d] transition-colors font-semibold text-sm"
          >
            <span className="text-white">{activeSymbol}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#787b86] transition-transform", symbolOpen && "rotate-180")} />
          </button>
          {symbolOpen && (
            <div className="absolute top-full left-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-56 mt-0.5">
              {SYMBOLS.map(s => {
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

        <div className="w-px h-5 bg-[#2a2e39]" />

        {/* Timeframes */}
        <div className="flex items-center">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={cn(
                "px-2 h-[46px] text-xs font-semibold transition-colors",
                activeTimeframe === tf
                  ? "text-white bg-[#2962ff]/20 border-b-2 border-[#2962ff]"
                  : "text-[#787b86] hover:text-white hover:bg-[#1e222d]",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#2a2e39]" />

        {/* Chart types */}
        <div className="flex items-center">
          {CHART_TYPES.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              title={label}
              onClick={() => setChartType(type)}
              className={cn(
                "w-8 h-[46px] flex items-center justify-center transition-colors",
                chartType === type
                  ? "text-[#2962ff]"
                  : "text-[#787b86] hover:text-white hover:bg-[#1e222d]",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#2a2e39]" />

        {/* Indicators */}
        <div className="relative">
          <button
            onClick={() => { setIndOpen(o => !o); setSymbolOpen(false); }}
            className={cn(
              "flex items-center gap-1.5 h-[46px] px-3 text-xs font-semibold transition-colors",
              indOpen ? "text-white bg-[#1e222d]" : "text-[#787b86] hover:text-white hover:bg-[#1e222d]",
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Indicators</span>
            {indicators.size > 0 && (
              <span className="ml-0.5 bg-[#2962ff] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {indicators.size}
              </span>
            )}
          </button>

          {indOpen && (
            <div className="absolute top-full left-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-2 w-52 mt-0.5">
              {/* On Chart section */}
              <p className="text-[10px] text-[#787b86] font-semibold uppercase tracking-wider px-3 pb-1.5">
                On Chart
              </p>
              {INDICATORS.filter(i => i.section === "chart").map(ind => (
                <button
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#2a2e39] transition-colors"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ind.color }} />
                  <span className="flex-1 text-left text-xs text-white">
                    {ind.label}
                    {ind.sublabel && <span className="text-[#787b86] ml-1">({ind.sublabel})</span>}
                  </span>
                  {indicators.has(ind.id) && <Check className="h-3.5 w-3.5 text-[#2962ff]" />}
                </button>
              ))}

              <div className="my-1.5 border-t border-[#2a2e39]" />

              {/* Sub-panels section */}
              <p className="text-[10px] text-[#787b86] font-semibold uppercase tracking-wider px-3 pb-1.5">
                Sub-Panel
              </p>
              {INDICATORS.filter(i => i.section === "panel").map(ind => (
                <button
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#2a2e39] transition-colors"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ind.color }} />
                  <span className="flex-1 text-left text-xs text-white">
                    {ind.label}
                    {ind.sublabel && <span className="text-[#787b86] ml-1">({ind.sublabel})</span>}
                  </span>
                  {indicators.has(ind.id) && <Check className="h-3.5 w-3.5 text-[#2962ff]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* OHLC */}
        {displayCandle && (
          <div className="hidden lg:flex items-center gap-3 text-xs mr-3">
            {ohlc.map(({ k, v }) => (
              <span key={k} className="text-[#787b86]">
                {k} <span className={cn(
                  "font-semibold tabular-nums",
                  k === "H" ? "text-[#26a69a]" : k === "L" ? "text-[#ef5350]" : "text-white",
                )}>{v}</span>
              </span>
            ))}
            <span className={cn("font-bold tabular-nums", isUp ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {isUp ? "+" : ""}
              {(((displayCandle.close - displayCandle.open) / displayCandle.open) * 100).toFixed(2)}%
            </span>
          </div>
        )}

        {/* Live price + status */}
        <div className="flex items-center gap-2 px-3 border-l border-[#2a2e39] h-full">
          {livePrice != null ? (
            <>
              <span className={cn(
                "font-bold text-sm tabular-nums transition-colors",
                livePriceUp ? "text-[#26a69a]" : "text-[#ef5350]",
              )}>
                {formatPrice(livePrice, activeSymbol)}
              </span>
              {liveChange !== null && (
                <span className={cn("text-xs font-bold tabular-nums", livePriceUp ? "text-[#26a69a]" : "text-[#ef5350]")}>
                  {livePriceUp ? "+" : ""}{liveChange.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-[#787b86] text-xs">{activeInfo.market}</span>
          )}

          <div className="flex items-center gap-1 ml-1" title={`Status: ${status}`}>
            {status === "live" ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#26a69a] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#26a69a]" />
              </span>
            ) : status === "connecting" || status === "closed" ? (
              <span className="h-2 w-2 rounded-full bg-[#f0b90b] animate-pulse" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-[#ef5350]" />
            )}
          </div>

          <button onClick={refetch} title="Reconnect" className="text-[#787b86] hover:text-white transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ══ MAIN AREA ═════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0" onClick={() => { setSymbolOpen(false); setIndOpen(false); }}>

        {/* Left toolbar */}
        <div className="w-10 border-r border-[#2a2e39] flex flex-col items-center pt-2 pb-2 gap-0.5 shrink-0">
          {DRAWING_TOOLS.map(({ icon: Icon, label }, i) => {
            const prev = DRAWING_TOOLS[i - 1];
            const showDivider = i > 0 && prev && prev.group !== DRAWING_TOOLS[i].group;
            return (
              <div key={label} className="w-full flex flex-col items-center">
                {showDivider && <div className="w-6 h-px bg-[#2a2e39] my-1" />}
                <button
                  title={label}
                  onClick={e => { e.stopPropagation(); setActiveTool(label); }}
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

          <div className="flex-1" />
          <div className="w-6 h-px bg-[#2a2e39] mb-1" />

          <button
            title="Delete drawing"
            onClick={e => { e.stopPropagation(); setActiveTool("Delete"); }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded transition-colors",
              activeTool === "Delete"
                ? "bg-[#ef5350]/20 text-[#ef5350]"
                : "text-[#787b86] hover:text-[#ef5350] hover:bg-[#1e222d]",
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            title="Clear all drawings"
            onClick={e => { e.stopPropagation(); chartRef.current?.clearDrawings(); setActiveTool("Cursor"); }}
            className="w-8 h-8 flex items-center justify-center rounded text-[#787b86] hover:text-white hover:bg-[#1e222d] transition-colors text-[9px] font-bold mt-0.5"
          >
            ALL
          </button>
        </div>

        {/* Chart area */}
        <div className="flex-1 relative min-w-0 min-h-0">

          {/* Corner label */}
          <div className="absolute top-2 left-3 z-10 pointer-events-none flex items-center gap-2">
            <span className="text-[#787b86] text-[11px] font-medium">
              {activeInfo.symbol} · {activeInfo.market} · {activeTimeframe}
            </span>
            {status === "live" && (
              <span className="text-[10px] font-bold text-[#26a69a] uppercase tracking-wider">LIVE</span>
            )}
          </div>

          {/* Indicator legend */}
          {indicators.size > 0 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-3">
              {INDICATORS.filter(i => indicators.has(i.id)).map(ind => (
                <span key={ind.id} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: ind.color }}>
                  <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: ind.color }} />
                  {ind.label}({ind.sublabel})
                </span>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#131722]/90">
              <Loader2 className="h-8 w-8 text-[#2962ff] animate-spin" />
              <p className="text-sm text-[#787b86]">
                Connecting to {activeSymbol} · {activeTimeframe}…
              </p>
            </div>
          )}

          {isError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
              <WifiOff className="h-8 w-8 text-[#ef5350]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Chart data unavailable</p>
                <p className="text-xs text-[#787b86] mt-1">Market may be closed or Deriv is unreachable</p>
              </div>
              <button onClick={refetch} className="text-xs font-semibold text-[#2962ff] hover:underline">
                Try again
              </button>
            </div>
          )}

          {candles.length > 0 && (
            <CandlestickChart
              ref={chartRef}
              candles={candles}
              symbol={activeSymbol}
              timeframe={activeTimeframe}
              chartType={chartType}
              activeIndicators={indicators}
              activeTool={activeTool}
              onCrosshairMove={setTooltipCandle}
            />
          )}
        </div>
      </div>
    </div>
  );
}
