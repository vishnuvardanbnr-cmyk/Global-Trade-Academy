import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Zap, Globe, RefreshCw, Star,
  AlertCircle, ChevronUp, ChevronDown,
} from "lucide-react";

/* ════════════════ Types ════════════════ */
interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  total_volume: number;
}
interface GlobalData {
  total_market_cap?: Record<string, number>;
  total_volume?: Record<string, number>;
  market_cap_percentage?: Record<string, number>;
  market_cap_change_percentage_24h_usd?: number;
  active_cryptocurrencies?: number;
}
interface NewListing {
  id: string;
  symbol: string;
  name: string;
  activated_at: number;
}
interface OverviewData {
  coins: CoinData[];
  global: GlobalData;
  newListings: NewListing[];
}
interface PriceRow {
  price: number;
  change: string;
  up: boolean;
  open: number;
  high: number;
  low: number;
}
interface BubbleState {
  index: number;
  coin: CoinData;
  x: number;
  y: number;
  r: number;
}

/* ════════════════ Helpers ════════════════ */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function getBubbleColor(change: number): { bg: string; light: string } {
  const a = Math.abs(change);
  if (change >= 0) {
    if (a >= 15) return { bg: "#00c853", light: "#69f0ae" };
    if (a >= 8)  return { bg: "#16a34a", light: "#4ade80" };
    if (a >= 3)  return { bg: "#15803d", light: "#22c55e" };
    return        { bg: "#14532d", light: "#16a34a" };
  } else {
    if (a >= 15) return { bg: "#dc2626", light: "#f87171" };
    if (a >= 8)  return { bg: "#b91c1c", light: "#ef4444" };
    if (a >= 3)  return { bg: "#991b1b", light: "#dc2626" };
    return        { bg: "#450a0a", light: "#7f1d1d" };
  }
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return n.toFixed(6).replace(/0+$/, "");
}

function fmtLargeNum(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function computeBubbles(coins: CoinData[], W: number, H: number): BubbleState[] {
  const cx = W / 2;
  const cy = H / 2;
  const scale = Math.min(W, H);
  const list = coins.slice(0, 42);

  const bubbles: BubbleState[] = list.map((coin, i) => {
    const r = Math.max(14, Math.min(scale * 0.095, scale * 0.095 * Math.pow(0.87, i)));
    const spiralR = scale * 0.042 * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    return {
      index: i,
      coin,
      x: cx + spiralR * Math.cos(angle),
      y: cy + spiralR * Math.sin(angle),
      r,
    };
  });

  /* collision resolution — 60 iterations */
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dx = bubbles[j].x - bubbles[i].x;
        const dy = bubbles[j].y - bubbles[i].y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minD = bubbles[i].r + bubbles[j].r + 3;
        if (dist < minD) {
          const push = (minD - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          bubbles[i].x -= nx * push;
          bubbles[i].y -= ny * push;
          bubbles[j].x += nx * push;
          bubbles[j].y += ny * push;
        }
      }
    }
  }

  /* clamp to canvas bounds */
  for (const b of bubbles) {
    b.x = Math.max(b.r + 4, Math.min(W - b.r - 4, b.x));
    b.y = Math.max(b.r + 4, Math.min(H - b.r - 4, b.y));
  }

  return bubbles;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  b: BubbleState,
  hovered: boolean,
  t: number,
) {
  const floatY = Math.sin(t * 0.0008 + b.index * 0.7) * (b.r * 0.015);
  const floatX = Math.cos(t * 0.0006 + b.index * 0.5) * (b.r * 0.01);
  const x = b.x + floatX;
  const y = b.y + floatY;
  const r = hovered ? b.r * 1.06 : b.r;
  const { bg, light } = getBubbleColor(b.coin.price_change_percentage_24h ?? 0);

  /* glow */
  if (hovered) {
    ctx.shadowColor = light;
    ctx.shadowBlur = 18;
  }

  /* bubble fill with radial gradient */
  const grad = ctx.createRadialGradient(x - r * 0.28, y - r * 0.28, r * 0.05, x, y, r);
  grad.addColorStop(0, light + "cc");
  grad.addColorStop(0.5, bg + "ee");
  grad.addColorStop(1, bg + "aa");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;

  /* border */
  ctx.strokeStyle = hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.12)";
  ctx.lineWidth = hovered ? 1.5 : 0.8;
  ctx.stroke();

  /* text */
  if (r >= 18) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const hasChange = r >= 30;
    const symSize  = Math.min(r * 0.36, 13);
    const chgSize  = Math.min(r * 0.27, 10.5);
    const symY     = hasChange ? y - chgSize * 0.7 : y;

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `700 ${symSize}px 'Inter',system-ui,sans-serif`;
    ctx.fillText(b.coin.symbol.toUpperCase(), x, symY);

    if (hasChange) {
      const pct = b.coin.price_change_percentage_24h ?? 0;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = `500 ${chgSize}px 'Inter',system-ui,sans-serif`;
      ctx.fillText(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, x, symY + symSize * 0.85);
    }
  }
}

/* ════════════════ CryptoBubbleMap ════════════════ */
function CryptoBubbleMap({ coins, loading }: { coins: CoinData[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const bubblesRef   = useRef<BubbleState[]>([]);
  const hoveredRef   = useRef<number | null>(null);
  const rafRef       = useRef(0);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; b: BubbleState } | null>(null);

  /* observe container size */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* set canvas dimensions with DPR */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims.w || !dims.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = dims.w * dpr;
    canvas.height = dims.h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
  }, [dims]);

  /* recompute bubbles when coins or dims change */
  useEffect(() => {
    if (!dims.w || !dims.h || coins.length === 0) return;
    bubblesRef.current = computeBubbles(coins, dims.w, dims.h);
  }, [coins, dims]);

  /* animation loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims.w) return;

    const frame = (t: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, dims.w, dims.h);

      /* subtle grid dots */
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let gx = 0; gx < dims.w; gx += 40) {
        for (let gy = 0; gy < dims.h; gy += 40) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const bs = bubblesRef.current;
      for (let i = 0; i < bs.length; i++) {
        drawBubble(ctx, bs[i], hoveredRef.current === i, t);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found = -1;
    const bs = bubblesRef.current;
    for (let i = 0; i < bs.length; i++) {
      const dx = mx - bs[i].x, dy = my - bs[i].y;
      if (Math.hypot(dx, dy) <= bs[i].r + 2) { found = i; break; }
    }
    hoveredRef.current = found >= 0 ? found : null;
    if (found >= 0) setTooltip({ x: mx, y: my, b: bs[found] });
    else            setTooltip(null);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => { hoveredRef.current = null; setTooltip(null); }}
        className="cursor-crosshair"
      />
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ left: Math.min(tooltip.x + 14, dims.w - 180), top: Math.max(tooltip.y - 80, 4) }}
        >
          <div className="bg-[#1a1d27] border border-[#2a2e39] rounded-xl px-3.5 py-3 shadow-2xl min-w-[170px]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-white font-bold text-sm">{tooltip.b.coin.name}</span>
            </div>
            <p className="text-[#c6c9d5] text-xs font-mono">${fmtPrice(tooltip.b.coin.current_price)}</p>
            <p className={cn("text-xs font-semibold mt-0.5", tooltip.b.coin.price_change_percentage_24h >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {tooltip.b.coin.price_change_percentage_24h >= 0 ? "▲" : "▼"}{" "}
              {Math.abs(tooltip.b.coin.price_change_percentage_24h ?? 0).toFixed(2)}% (24h)
            </p>
            <p className="text-[#787b86] text-[10.5px] mt-1">Vol: {fmtLargeNum(tooltip.b.coin.total_volume)}</p>
            <p className="text-[#787b86] text-[10.5px]">MCap: {fmtLargeNum(tooltip.b.coin.market_cap)}</p>
          </div>
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0f14]/85 backdrop-blur-sm">
          <div className="w-9 h-9 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-[#787b86] text-sm">Fetching market data…</p>
        </div>
      )}
      {!loading && coins.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="h-10 w-10 text-[#ef5350]/60" />
          <p className="text-[#787b86] text-sm">Market data unavailable</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2.5 pointer-events-none">
        {[
          { color: "#00c853", label: "> +8%" },
          { color: "#16a34a", label: "> +3%" },
          { color: "#14532d", label: "+0%" },
          { color: "#450a0a", label: "-0%" },
          { color: "#b91c1c", label: "< -3%" },
          { color: "#dc2626", label: "< -8%" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-[9.5px] text-[#787b86] font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ Global Stats Bar ════════════════ */
function GlobalStatsBar({ data, prices }: { data: GlobalData; prices: Record<string, PriceRow> }) {
  const totalMcap = data.total_market_cap?.["usd"] ?? 0;
  const mcapChange = data.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom = data.market_cap_percentage?.["btc"] ?? 0;
  const ethDom = data.market_cap_percentage?.["eth"] ?? 0;
  const activeCrypto = data.active_cryptocurrencies ?? 0;
  const btcPrice = prices?.["BTC/USD"]?.price;

  const stats = [
    { label: "Market Cap", value: fmtLargeNum(totalMcap), sub: `${mcapChange >= 0 ? "+" : ""}${mcapChange.toFixed(2)}%`, up: mcapChange >= 0 },
    { label: "BTC Dominance", value: `${btcDom.toFixed(1)}%`, sub: btcPrice ? `$${btcPrice.toLocaleString()}` : "", up: null },
    { label: "ETH Dominance", value: `${ethDom.toFixed(1)}%`, sub: null, up: null },
    { label: "Active Cryptos", value: activeCrypto.toLocaleString(), sub: null, up: null },
  ];

  return (
    <div className="flex items-center gap-0 border-b border-[#1e222d] bg-[#0d0f14]/80 shrink-0 overflow-x-auto scrollbar-hide">
      {stats.map(({ label, value, sub, up }, i) => (
        <div key={label} className={cn("flex flex-col px-4 py-2.5 shrink-0 border-r border-[#1e222d]", i === 0 && "pl-5")}>
          <span className="text-[10px] font-medium text-[#787b86] uppercase tracking-wide whitespace-nowrap">{label}</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-[13px] font-bold text-white tabular-nums">{value || "—"}</span>
            {sub && (
              <span className={cn("text-[10px] font-semibold tabular-nums", up === null ? "text-[#787b86]" : up ? "text-[#26a69a]" : "text-[#ef5350]")}>
                {sub}
              </span>
            )}
          </div>
        </div>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 px-4 text-[10px] text-[#787b86] shrink-0">
        <Globe className="h-3 w-3" />
        <span>CoinGecko · Deriv</span>
      </div>
    </div>
  );
}

/* ════════════════ Movers List ════════════════ */
function MoversList({ coins, type }: { coins: CoinData[]; type: "gainers" | "losers" }) {
  const sorted = [...coins].sort((a, b) =>
    type === "gainers"
      ? (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)
      : (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0),
  ).slice(0, 7);

  const isUp = type === "gainers";
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-1.5 px-3 py-2 border-b border-[#1e222d]", isUp ? "bg-[#0d2218]" : "bg-[#1e0d0d]")}>
        {isUp
          ? <TrendingUp className="h-3.5 w-3.5 text-[#26a69a]" />
          : <TrendingDown className="h-3.5 w-3.5 text-[#ef5350]" />}
        <span className={cn("text-[11.5px] font-bold uppercase tracking-wide", isUp ? "text-[#26a69a]" : "text-[#ef5350]")}>
          {isUp ? "Top Gainers" : "Top Losers"}
        </span>
        <span className="text-[10px] text-[#787b86] ml-0.5">24h</span>
      </div>
      {sorted.map((coin) => {
        const pct = coin.price_change_percentage_24h ?? 0;
        return (
          <div key={coin.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#1a1d27] transition-colors border-b border-[#1e222d]/50">
            <img src={coin.image} alt={coin.symbol} className="w-5 h-5 rounded-full shrink-0" loading="lazy" />
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white">{coin.symbol.toUpperCase()}</p>
              <p className="text-[9.5px] text-[#787b86] truncate">${fmtPrice(coin.current_price)}</p>
            </div>
            <span className={cn("text-[11px] font-bold tabular-nums shrink-0", pct >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════ New Listings ════════════════ */
function NewListings({ listings }: { listings: NewListing[] }) {
  if (!listings.length) return null;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1e222d] bg-[#0d0f1f]">
        <Zap className="h-3.5 w-3.5 text-[#f0b90b]" />
        <span className="text-[11.5px] font-bold text-[#f0b90b] uppercase tracking-wide">New Listings</span>
      </div>
      {listings.slice(0, 8).map((l) => {
        const dt = l.activated_at
          ? new Date(l.activated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Recent";
        return (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-[#1a1d27] transition-colors border-b border-[#1e222d]/50">
            <div className="w-5 h-5 rounded-full bg-[#f0b90b]/20 flex items-center justify-center shrink-0">
              <span className="text-[7px] font-bold text-[#f0b90b]">{l.symbol.slice(0, 3).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white truncate">{l.name}</p>
              <p className="text-[9.5px] text-[#787b86]">{l.symbol.toUpperCase()}</p>
            </div>
            <span className="text-[9.5px] text-[#787b86] shrink-0">{dt}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════ Market Table (bottom strip) ════════════════ */
const MARKET_ROWS = [
  { symbol: "BTC/USD",  name: "Bitcoin",      cat: "Crypto",    emoji: "₿" },
  { symbol: "ETH/USD",  name: "Ethereum",     cat: "Crypto",    emoji: "Ξ" },
  { symbol: "SPX500",   name: "S&P 500",      cat: "Index",     emoji: "📈" },
  { symbol: "XAU/USD",  name: "Gold",         cat: "Commodity", emoji: "🥇" },
  { symbol: "EUR/USD",  name: "Euro/Dollar",  cat: "Forex",     emoji: "€" },
  { symbol: "GBP/USD",  name: "Pound/Dollar", cat: "Forex",     emoji: "£" },
  { symbol: "USD/JPY",  name: "Dollar/Yen",   cat: "Forex",     emoji: "¥" },
  { symbol: "AUD/USD",  name: "Aussie/Dollar", cat: "Forex",    emoji: "A$" },
];

function MarketTable({ prices, loading }: { prices: Record<string, PriceRow>; loading: boolean }) {
  return (
    <div className="shrink-0 border-t border-[#1e222d] bg-[#0d0f14]">
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[#1e222d]">
        <Star className="h-3.5 w-3.5 text-[#f0b90b]" />
        <span className="text-[11.5px] font-bold text-white uppercase tracking-wide">Markets Overview</span>
      </div>
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-0 min-w-max">
          {MARKET_ROWS.map(({ symbol, name, cat, emoji }) => {
            const p = prices?.[symbol];
            const up = p?.up ?? true;
            return (
              <div key={symbol} className="flex flex-col border-r border-[#1e222d] px-4 py-3 min-w-[140px] hover:bg-[#1a1d27] transition-colors cursor-default">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px]">{emoji}</span>
                  <span className="text-[10px] font-medium text-[#787b86] uppercase tracking-wide">{cat}</span>
                </div>
                <p className="text-[12.5px] font-bold text-white tabular-nums">
                  {loading ? <span className="text-[#787b86]">—</span> : p ? `${p.up ? "" : ""}${Number(p.price).toLocaleString("en-US", { maximumFractionDigits: p.price < 10 ? 5 : 2 })}` : "—"}
                </p>
                <p className="text-[10px] text-[#787b86] truncate">{name}</p>
                {p && (
                  <div className={cn("flex items-center gap-0.5 mt-0.5", up ? "text-[#26a69a]" : "text-[#ef5350]")}>
                    {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span className="text-[10.5px] font-semibold tabular-nums">
                      {up ? "+" : ""}{p.change}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Filter Bar ════════════════ */
type Filter = "all" | "gainers" | "losers";

function FilterBar({ active, onChange }: { active: Filter; onChange: (f: Filter) => void }) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1e222d] shrink-0 bg-[#0d0f14]">
      <span className="text-[11px] font-bold text-[#787b86] uppercase tracking-wide mr-2">View</span>
      {([
        { k: "all",     label: "All Coins" },
        { k: "gainers", label: "🟢 Gainers" },
        { k: "losers",  label: "🔴 Losers"  },
      ] as { k: Filter; label: string }[]).map(({ k, label }) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all",
            active === k
              ? "bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/40"
              : "text-[#787b86] hover:text-white hover:bg-[#1a1d27]",
          )}
        >
          {label}
        </button>
      ))}
      <div className="flex-1" />
      <span className="text-[10px] text-[#787b86] font-medium hidden sm:block">Bubble size = market cap · Color = 24h change</span>
    </div>
  );
}

/* ════════════════ Main Component ════════════════ */
export default function Trading() {
  const [filter, setFilter] = useState<Filter>("all");
  const [mobileTab, setMobileTab] = useState<"gainers" | "losers" | "new">("gainers");

  /* CoinGecko overview */
  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery<OverviewData>({
    queryKey: ["market-overview"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/overview", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<OverviewData>;
    },
    staleTime: 2 * 60_000,
    refetchInterval: 3 * 60_000,
    retry: 2,
  });

  /* Deriv prices for market table */
  const { data: prices = {} as Record<string, PriceRow>, isLoading: pricesLoading } = useQuery<Record<string, PriceRow>>({
    queryKey: ["market-prices"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/prices", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Record<string, PriceRow>>;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const allCoins = overview?.coins ?? [];

  const displayCoins = filter === "gainers"
    ? allCoins.filter((c) => (c.price_change_percentage_24h ?? 0) > 0)
    : filter === "losers"
    ? allCoins.filter((c) => (c.price_change_percentage_24h ?? 0) < 0)
    : allCoins;

  return (
    <div
      className="flex flex-col h-full select-none overflow-hidden rounded-xl"
      style={{ background: "#0d0f14", color: "#c6c9d5" }}
    >
      {/* Global stats */}
      <GlobalStatsBar data={overview?.global ?? {}} prices={prices} />

      {/* Filter bar */}
      <FilterBar active={filter} onChange={setFilter} />

      {/* Main body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

        {/* ── Left: Bubble map ── */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col" style={{ minHeight: "280px" }}>
          <div className="flex items-center justify-between px-4 py-1.5 shrink-0 border-b border-[#1e222d]">
            <span className="text-[10.5px] font-bold text-[#787b86] uppercase tracking-widest">
              Crypto Bubble Map — Top 42 by Market Cap
            </span>
            <button
              onClick={() => refetchOv()}
              className="flex items-center gap-1 text-[10px] text-[#787b86] hover:text-white transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
          <CryptoBubbleMap coins={displayCoins} loading={ovLoading} />
        </div>

        {/* ── Right: Gainers / Losers / New Listings ── */}
        <div className="w-full md:w-64 shrink-0 flex flex-col border-l border-[#1e222d] overflow-hidden">
          {/* Mobile tab switcher */}
          <div className="flex md:hidden border-b border-[#1e222d] shrink-0">
            {(["gainers", "losers", "new"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMobileTab(t)}
                className={cn(
                  "flex-1 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors",
                  mobileTab === t
                    ? t === "gainers" ? "text-[#26a69a] border-b-2 border-[#26a69a]"
                    : t === "losers"  ? "text-[#ef5350] border-b-2 border-[#ef5350]"
                    : "text-[#f0b90b] border-b-2 border-[#f0b90b]"
                    : "text-[#787b86]",
                )}
              >
                {t === "gainers" ? "▲ Gainers" : t === "losers" ? "▼ Losers" : "⚡ New"}
              </button>
            ))}
          </div>

          {/* Desktop: show all three stacked; Mobile: show selected */}
          <div className="flex-1 overflow-y-auto">
            <div className={cn("md:block", mobileTab === "gainers" ? "block" : "hidden")}>
              <MoversList coins={allCoins} type="gainers" />
            </div>
            <div className={cn("md:block", mobileTab === "losers" ? "block" : "hidden")}>
              <MoversList coins={allCoins} type="losers" />
            </div>
            <div className={cn("md:block", mobileTab === "new" ? "block" : "hidden")}>
              <NewListings listings={overview?.newListings ?? []} />
            </div>
          </div>
        </div>
      </div>

      {/* Market table strip */}
      <MarketTable prices={prices} loading={pricesLoading} />
    </div>
  );
}
