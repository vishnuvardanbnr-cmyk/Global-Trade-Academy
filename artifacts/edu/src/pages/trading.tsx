import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Zap, Globe, RefreshCw,
  AlertCircle, ChevronUp, ChevronDown, BarChart2,
} from "lucide-react";

/* ════════════════ Types ════════════════ */
interface CoinData {
  id: string; symbol: string; name: string; image: string;
  current_price: number; market_cap: number; market_cap_rank: number;
  price_change_percentage_24h: number; total_volume: number;
}
interface GlobalData {
  total_market_cap?: Record<string, number>;
  total_volume?: Record<string, number>;
  market_cap_percentage?: Record<string, number>;
  market_cap_change_percentage_24h_usd?: number;
  active_cryptocurrencies?: number;
}
interface NewListing { id: string; symbol: string; name: string; activated_at: number; }
interface OverviewData { coins: CoinData[]; global: GlobalData; newListings: NewListing[]; }
interface PriceRow { price: number; change: string; up: boolean; open: number; high: number; low: number; }
interface StockQuote {
  symbol: string; shortName: string;
  regularMarketPrice: number; regularMarketChange: number;
  regularMarketChangePercent: number; marketCap: number;
  regularMarketVolume: number; regularMarketDayHigh: number;
  regularMarketDayLow: number;
}
interface BubbleState { index: number; coin: CoinData; x: number; y: number; r: number; }

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
function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

/* ════════════════ Bubble Map Internals ════════════════ */
function computeBubbles(coins: CoinData[], W: number, H: number): BubbleState[] {
  const cx = W / 2, cy = H / 2, scale = Math.min(W, H);
  const list = coins.slice(0, 42);
  const bubbles: BubbleState[] = list.map((coin, i) => {
    const r = Math.max(14, Math.min(scale * 0.095, scale * 0.095 * Math.pow(0.87, i)));
    const spiralR = scale * 0.042 * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    return { index: i, coin, x: cx + spiralR * Math.cos(angle), y: cy + spiralR * Math.sin(angle), r };
  });
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dx = bubbles[j].x - bubbles[i].x, dy = bubbles[j].y - bubbles[i].y;
        const dist = Math.hypot(dx, dy) || 0.001, minD = bubbles[i].r + bubbles[j].r + 3;
        if (dist < minD) {
          const push = (minD - dist) / 2, nx = dx / dist, ny = dy / dist;
          bubbles[i].x -= nx * push; bubbles[i].y -= ny * push;
          bubbles[j].x += nx * push; bubbles[j].y += ny * push;
        }
      }
    }
  }
  for (const b of bubbles) {
    b.x = Math.max(b.r + 4, Math.min(W - b.r - 4, b.x));
    b.y = Math.max(b.r + 4, Math.min(H - b.r - 4, b.y));
  }
  return bubbles;
}

function drawBubble(ctx: CanvasRenderingContext2D, b: BubbleState, hovered: boolean, t: number) {
  const floatY = Math.sin(t * 0.0008 + b.index * 0.7) * (b.r * 0.015);
  const floatX = Math.cos(t * 0.0006 + b.index * 0.5) * (b.r * 0.01);
  const x = b.x + floatX, y = b.y + floatY, r = hovered ? b.r * 1.06 : b.r;
  const { bg, light } = getBubbleColor(b.coin.price_change_percentage_24h ?? 0);
  if (hovered) { ctx.shadowColor = light; ctx.shadowBlur = 18; }
  const grad = ctx.createRadialGradient(x - r * 0.28, y - r * 0.28, r * 0.05, x, y, r);
  grad.addColorStop(0, light + "cc"); grad.addColorStop(0.5, bg + "ee"); grad.addColorStop(1, bg + "aa");
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.12)";
  ctx.lineWidth = hovered ? 1.5 : 0.8; ctx.stroke();
  if (r >= 18) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const hasChange = r >= 30;
    const symSize = Math.min(r * 0.36, 13), chgSize = Math.min(r * 0.27, 10.5);
    const symY = hasChange ? y - chgSize * 0.7 : y;
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

/* ════════════════ Crypto Bubble Map ════════════════ */
function CryptoBubbleMap({ coins, loading }: { coins: CoinData[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const bubblesRef   = useRef<BubbleState[]>([]);
  const hoveredRef   = useRef<number | null>(null);
  const rafRef       = useRef(0);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; b: BubbleState } | null>(null);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !dims.w || !dims.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dims.w * dpr; canvas.height = dims.h * dpr;
    const ctx = canvas.getContext("2d")!; ctx.scale(dpr, dpr);
  }, [dims]);

  useEffect(() => {
    if (!dims.w || !dims.h || coins.length === 0) return;
    bubblesRef.current = computeBubbles(coins, dims.w, dims.h);
  }, [coins, dims]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !dims.w) return;
    const frame = (t: number) => {
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, dims.w, dims.h);
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let gx = 0; gx < dims.w; gx += 40)
        for (let gy = 0; gy < dims.h; gy += 40) {
          ctx.beginPath(); ctx.arc(gx, gy, 0.8, 0, Math.PI * 2); ctx.fill();
        }
      const bs = bubblesRef.current;
      for (let i = 0; i < bs.length; i++) drawBubble(ctx, bs[i], hoveredRef.current === i, t);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let found = -1;
    const bs = bubblesRef.current;
    for (let i = 0; i < bs.length; i++) {
      if (Math.hypot(mx - bs[i].x, my - bs[i].y) <= bs[i].r + 2) { found = i; break; }
    }
    hoveredRef.current = found >= 0 ? found : null;
    if (found >= 0) setTooltip({ x: mx, y: my, b: bs[found] });
    else setTooltip(null);
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
        <div className="absolute z-50 pointer-events-none"
          style={{ left: Math.min(tooltip.x + 14, dims.w - 180), top: Math.max(tooltip.y - 80, 4) }}>
          <div className="bg-[#1a1d27] border border-[#2a2e39] rounded-xl px-3.5 py-3 shadow-2xl min-w-[170px]">
            <p className="text-white font-bold text-sm mb-1">{tooltip.b.coin.name}</p>
            <p className="text-[#c6c9d5] text-xs font-mono">${fmtPrice(tooltip.b.coin.current_price)}</p>
            <p className={cn("text-xs font-semibold mt-0.5", tooltip.b.coin.price_change_percentage_24h >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {tooltip.b.coin.price_change_percentage_24h >= 0 ? "▲" : "▼"} {Math.abs(tooltip.b.coin.price_change_percentage_24h ?? 0).toFixed(2)}% (24h)
            </p>
            <p className="text-[#787b86] text-[10.5px] mt-1">Vol: {fmtLarge(tooltip.b.coin.total_volume)}</p>
            <p className="text-[#787b86] text-[10.5px]">MCap: {fmtLarge(tooltip.b.coin.market_cap)}</p>
          </div>
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0f14]/85 backdrop-blur-sm">
          <div className="w-9 h-9 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-[#787b86] text-sm">Fetching crypto data…</p>
        </div>
      )}
      {!loading && coins.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="h-10 w-10 text-[#ef5350]/60" />
          <p className="text-[#787b86] text-sm">Crypto data unavailable</p>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-2.5 pointer-events-none flex-wrap">
        {[
          { color: "#00c853", label: ">+8%" }, { color: "#16a34a", label: ">+3%" },
          { color: "#14532d", label: "+0%" },  { color: "#450a0a", label: "-0%" },
          { color: "#b91c1c", label: "<-3%" }, { color: "#dc2626", label: "<-8%" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[9.5px] text-[#787b86] font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ Stock Heat Grid ════════════════ */
function stockColor(pct: number) {
  const a = Math.abs(pct);
  if (pct >= 0) {
    if (a >= 5) return "bg-[#00c853]/20 border-[#00c853]/40 text-[#00c853]";
    if (a >= 2) return "bg-[#16a34a]/20 border-[#16a34a]/40 text-[#26a69a]";
    return "bg-[#14532d]/20 border-[#14532d]/30 text-[#4ade80]";
  } else {
    if (a >= 5) return "bg-[#dc2626]/20 border-[#dc2626]/40 text-[#ef5350]";
    if (a >= 2) return "bg-[#b91c1c]/20 border-[#b91c1c]/40 text-[#ef5350]";
    return "bg-[#450a0a]/20 border-[#450a0a]/30 text-[#f87171]";
  }
}

function StockHeatGrid({ stocks, loading }: { stocks: StockQuote[]; loading: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!stocks.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#787b86]">
      <AlertCircle className="h-8 w-8" />
      <p className="text-sm">Stock data unavailable</p>
    </div>
  );
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {stocks.map((s) => {
          const pct = s.regularMarketChangePercent ?? 0;
          const isHov = hovered === s.symbol;
          return (
            <div
              key={s.symbol}
              className={cn(
                "relative border rounded-xl p-2.5 cursor-default transition-all",
                stockColor(pct),
                isHov && "scale-105 z-10 shadow-xl",
              )}
              onMouseEnter={() => setHovered(s.symbol)}
              onMouseLeave={() => setHovered(null)}
            >
              <p className="text-white font-bold text-[12px] leading-tight">{s.symbol}</p>
              <p className="text-[10px] text-[#787b86] truncate leading-tight mb-1">{s.shortName?.replace(" Inc.", "").replace(" Corp.", "").replace(" Co.", "")}</p>
              <p className="text-white font-mono text-[11px] tabular-nums">
                ${s.regularMarketPrice?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </p>
              <p className={cn("text-[10.5px] font-bold tabular-nums mt-0.5",
                pct >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
                {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
              </p>
              {isHov && (
                <div className="absolute z-50 left-full ml-2 top-0 bg-[#1a1d27] border border-[#2a2e39] rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px] pointer-events-none">
                  <p className="text-white font-bold text-xs mb-1.5">{s.shortName}</p>
                  <div className="space-y-0.5 text-[10.5px]">
                    <div className="flex justify-between gap-3">
                      <span className="text-[#787b86]">Open</span>
                      <span className="text-white tabular-nums">${s.regularMarketPrice?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#787b86]">High</span>
                      <span className="text-[#26a69a] tabular-nums">${s.regularMarketDayHigh?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#787b86]">Low</span>
                      <span className="text-[#ef5350] tabular-nums">${s.regularMarketDayLow?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#787b86]">MCap</span>
                      <span className="text-white tabular-nums">{fmtLarge(s.marketCap)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#787b86]">Vol</span>
                      <span className="text-white tabular-nums">{(s.regularMarketVolume / 1e6).toFixed(1)}M</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════ Global Stats Bar ════════════════ */
function GlobalStatsBar({ data, stocks }: { data: GlobalData; stocks: StockQuote[] }) {
  const totalMcap = data.total_market_cap?.["usd"] ?? 0;
  const mcapChange = data.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom = data.market_cap_percentage?.["btc"] ?? 0;
  const activeCrypto = data.active_cryptocurrencies ?? 0;
  const gainers = stocks.filter((s) => (s.regularMarketChangePercent ?? 0) > 0).length;
  const losers  = stocks.filter((s) => (s.regularMarketChangePercent ?? 0) < 0).length;

  const stats = [
    { label: "Crypto MCap",    value: fmtLarge(totalMcap), sub: `${mcapChange >= 0 ? "+" : ""}${mcapChange.toFixed(2)}%`, up: mcapChange >= 0 },
    { label: "BTC Dominance",  value: `${btcDom.toFixed(1)}%`,       sub: null, up: null },
    { label: "Active Cryptos", value: activeCrypto.toLocaleString(), sub: null, up: null },
    { label: "Stock Gainers",  value: gainers ? `${gainers}/${stocks.length}` : "—", sub: null, up: gainers > losers || null },
    { label: "Stock Losers",   value: losers  ? `${losers}/${stocks.length}` : "—",  sub: null, up: losers > 0 ? false : null },
  ];

  return (
    <div className="flex items-center border-b border-[#1e222d] bg-[#0d0f14]/80 shrink-0 overflow-x-auto scrollbar-hide">
      {stats.map(({ label, value, sub, up }, i) => (
        <div key={label} className={cn("flex flex-col px-4 py-2.5 shrink-0 border-r border-[#1e222d]", i === 0 && "pl-5")}>
          <span className="text-[10px] font-medium text-[#787b86] uppercase tracking-wide whitespace-nowrap">{label}</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={cn("text-[13px] font-bold tabular-nums",
              up === null ? "text-white" : up ? "text-[#26a69a]" : "text-[#ef5350]")}>{value || "—"}</span>
            {sub && (
              <span className={cn("text-[10px] font-semibold tabular-nums",
                up === null ? "text-[#787b86]" : up ? "text-[#26a69a]" : "text-[#ef5350]")}>{sub}</span>
            )}
          </div>
        </div>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 px-4 text-[10px] text-[#787b86] shrink-0">
        <Globe className="h-3 w-3" />
        <span>CoinGecko · Yahoo Finance · Deriv</span>
      </div>
    </div>
  );
}

/* ════════════════ Sidebar: Movers ════════════════ */
function CryptoMoversList({ coins, type }: { coins: CoinData[]; type: "gainers" | "losers" }) {
  const sorted = [...coins]
    .sort((a, b) => type === "gainers"
      ? (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)
      : (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0))
    .slice(0, 7);
  const isUp = type === "gainers";
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-1.5 px-3 py-2 border-b border-[#1e222d]", isUp ? "bg-[#0d2218]" : "bg-[#1e0d0d]")}>
        {isUp ? <TrendingUp className="h-3.5 w-3.5 text-[#26a69a]" /> : <TrendingDown className="h-3.5 w-3.5 text-[#ef5350]" />}
        <span className={cn("text-[11.5px] font-bold uppercase tracking-wide", isUp ? "text-[#26a69a]" : "text-[#ef5350]")}>
          Crypto {isUp ? "Gainers" : "Losers"}
        </span>
      </div>
      {sorted.map((coin) => {
        const pct = coin.price_change_percentage_24h ?? 0;
        return (
          <div key={coin.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#1a1d27] transition-colors border-b border-[#1e222d]/50">
            <img src={coin.image} alt={coin.symbol} className="w-5 h-5 rounded-full shrink-0" loading="lazy" />
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white">{coin.symbol.toUpperCase()}</p>
              <p className="text-[9.5px] text-[#787b86]">${fmtPrice(coin.current_price)}</p>
            </div>
            <span className={cn("text-[11px] font-bold tabular-nums", pct >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StockMoversList({ stocks, type }: { stocks: StockQuote[]; type: "gainers" | "losers" }) {
  const sorted = [...stocks]
    .sort((a, b) => type === "gainers"
      ? (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0)
      : (a.regularMarketChangePercent ?? 0) - (b.regularMarketChangePercent ?? 0))
    .slice(0, 7);
  const isUp = type === "gainers";
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-1.5 px-3 py-2 border-b border-[#1e222d]", isUp ? "bg-[#0d1e2a]" : "bg-[#1e0d16]")}>
        <BarChart2 className={cn("h-3.5 w-3.5", isUp ? "text-[#2962ff]" : "text-[#ff6b35]")} />
        <span className={cn("text-[11.5px] font-bold uppercase tracking-wide", isUp ? "text-[#2962ff]" : "text-[#ff6b35]")}>
          Stock {isUp ? "Gainers" : "Losers"}
        </span>
      </div>
      {sorted.map((s) => {
        const pct = s.regularMarketChangePercent ?? 0;
        return (
          <div key={s.symbol} className="flex items-center gap-2 px-3 py-2 hover:bg-[#1a1d27] transition-colors border-b border-[#1e222d]/50">
            <div className="w-5 h-5 rounded-full bg-[#2962ff]/20 flex items-center justify-center shrink-0">
              <span className="text-[6px] font-bold text-[#2962ff]">{s.symbol.slice(0, 2)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white">{s.symbol}</p>
              <p className="text-[9.5px] text-[#787b86]">${s.regularMarketPrice?.toFixed(2)}</p>
            </div>
            <span className={cn("text-[11px] font-bold tabular-nums", pct >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NewListings({ listings }: { listings: NewListing[] }) {
  if (!listings.length) return null;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1e222d] bg-[#0d0f1f]">
        <Zap className="h-3.5 w-3.5 text-[#f0b90b]" />
        <span className="text-[11.5px] font-bold text-[#f0b90b] uppercase tracking-wide">New Listings</span>
      </div>
      {listings.slice(0, 6).map((l) => {
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

/* ════════════════ Bottom Market Strip ════════════════ */
type BottomTab = "indices" | "forex" | "commodities" | "crypto";

const BOTTOM_CATEGORIES: { key: BottomTab; label: string; rows: { symbol: string; name: string; emoji: string }[] }[] = [
  {
    key: "indices", label: "📈 Indices",
    rows: [
      { symbol: "SPX500",  name: "S&P 500",    emoji: "🇺🇸" },
      { symbol: "NDX100",  name: "Nasdaq 100",  emoji: "💻" },
      { symbol: "DJI",     name: "Dow Jones",   emoji: "🏛️" },
      { symbol: "FTSE100", name: "FTSE 100",    emoji: "🇬🇧" },
    ],
  },
  {
    key: "forex", label: "💱 Forex",
    rows: [
      { symbol: "EUR/USD", name: "Euro/Dollar",   emoji: "€" },
      { symbol: "GBP/USD", name: "Pound/Dollar",  emoji: "£" },
      { symbol: "USD/JPY", name: "Dollar/Yen",    emoji: "¥" },
      { symbol: "AUD/USD", name: "Aussie/Dollar", emoji: "A$" },
      { symbol: "NZD/USD", name: "Kiwi/Dollar",   emoji: "🥝" },
      { symbol: "USD/CAD", name: "Dollar/Loonie", emoji: "C$" },
      { symbol: "USD/CHF", name: "Dollar/Franc",  emoji: "🇨🇭" },
    ],
  },
  {
    key: "commodities", label: "🥇 Commodities",
    rows: [
      { symbol: "XAU/USD", name: "Gold",   emoji: "🥇" },
      { symbol: "XAG/USD", name: "Silver", emoji: "🥈" },
    ],
  },
  {
    key: "crypto", label: "₿ Crypto",
    rows: [
      { symbol: "BTC/USD", name: "Bitcoin",  emoji: "₿" },
      { symbol: "ETH/USD", name: "Ethereum", emoji: "Ξ" },
    ],
  },
];

function MarketStrip({ prices, loading }: { prices: Record<string, PriceRow>; loading: boolean }) {
  const [activeTab, setActiveTab] = useState<BottomTab>("indices");
  const cat = BOTTOM_CATEGORIES.find((c) => c.key === activeTab)!;

  return (
    <div className="shrink-0 border-t border-[#1e222d] bg-[#0d0f14]">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-[#1e222d] overflow-x-auto scrollbar-hide">
        {BOTTOM_CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap shrink-0 border-b-2 transition-all",
              activeTab === key
                ? "border-[#2962ff] text-white bg-[#2962ff]/10"
                : "border-transparent text-[#787b86] hover:text-white hover:bg-[#1a1d27]",
            )}
          >
            {label}
          </button>
        ))}
        <div className="flex-1 border-b-2 border-transparent" />
      </div>
      {/* Price row */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-0 min-w-max">
          {cat.rows.map(({ symbol, name, emoji }) => {
            const p = prices?.[symbol];
            const up = p?.up ?? true;
            return (
              <div key={symbol} className="flex flex-col border-r border-[#1e222d] px-4 py-3 min-w-[140px] hover:bg-[#1a1d27] transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px]">{emoji}</span>
                  <span className="text-[10px] font-bold text-[#787b86] uppercase tracking-wide truncate">{symbol}</span>
                </div>
                <p className="text-[13px] font-bold text-white tabular-nums">
                  {loading ? <span className="text-[#787b86]">…</span>
                    : p ? p.price.toLocaleString("en-US", { maximumFractionDigits: p.price < 10 ? 5 : 2 })
                    : "—"}
                </p>
                <p className="text-[10px] text-[#787b86] truncate">{name}</p>
                {p && (
                  <div className={cn("flex items-center gap-0.5 mt-0.5", up ? "text-[#26a69a]" : "text-[#ef5350]")}>
                    {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span className="text-[10.5px] font-semibold tabular-nums">{up ? "+" : ""}{p.change}%</span>
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

/* ════════════════ Main View: Bubble + Sidebar ════════════════ */
type MainView = "crypto" | "stocks";
type Filter    = "all" | "gainers" | "losers";
type SideTab   = "crypto-g" | "crypto-l" | "stock-g" | "stock-l" | "new";

export default function Trading() {
  const [mainView, setMainView] = useState<MainView>("crypto");
  const [filter, setFilter]     = useState<Filter>("all");
  const [sideTab, setSideTab]   = useState<SideTab>("stock-g");

  /* CoinGecko overview */
  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery<OverviewData>({
    queryKey: ["market-overview"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/overview", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<OverviewData>;
    },
    staleTime: 2 * 60_000, refetchInterval: 3 * 60_000, retry: 2,
  });

  /* Deriv prices */
  const { data: prices = {} as Record<string, PriceRow>, isLoading: pricesLoading } = useQuery<Record<string, PriceRow>>({
    queryKey: ["market-prices"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/prices", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Record<string, PriceRow>>;
    },
    staleTime: 60_000, refetchInterval: 90_000, retry: 1,
  });

  /* Yahoo Finance stocks */
  const { data: stocks = [] as StockQuote[], isLoading: stocksLoading, refetch: refetchStocks } = useQuery<StockQuote[]>({
    queryKey: ["market-stocks"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/stocks", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<StockQuote[]>;
    },
    staleTime: 90_000, refetchInterval: 2 * 60_000, retry: 2,
  });

  const allCoins = overview?.coins ?? [];
  const displayCoins = filter === "gainers"
    ? allCoins.filter((c) => (c.price_change_percentage_24h ?? 0) > 0)
    : filter === "losers"
    ? allCoins.filter((c) => (c.price_change_percentage_24h ?? 0) < 0)
    : allCoins;

  const SIDE_TABS: { key: SideTab; label: string }[] = [
    { key: "stock-g",  label: "📈 Stocks↑" },
    { key: "stock-l",  label: "📉 Stocks↓" },
    { key: "crypto-g", label: "🟢 Crypto↑" },
    { key: "crypto-l", label: "🔴 Crypto↓" },
    { key: "new",      label: "⚡ New" },
  ];

  return (
    <div className="flex flex-col h-full select-none overflow-hidden rounded-xl" style={{ background: "#0d0f14", color: "#c6c9d5" }}>

      {/* ── Global Stats Bar ── */}
      <GlobalStatsBar data={overview?.global ?? {}} stocks={stocks} />

      {/* ── Main View Toggle ── */}
      <div className="flex items-center gap-0 border-b border-[#1e222d] bg-[#0d0f14] shrink-0 overflow-x-auto scrollbar-hide">
        {([
          { key: "crypto" as const, label: "₿  Crypto Bubble Map", desc: "Top 42 coins by market cap" },
          { key: "stocks" as const, label: "📊  US Stocks Heat Map", desc: "Top 30 stocks · Yahoo Finance" },
        ] as const).map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => setMainView(key)}
            className={cn(
              "flex flex-col px-5 py-2.5 border-b-2 shrink-0 transition-all text-left",
              mainView === key
                ? "border-[#2962ff] bg-[#2962ff]/10"
                : "border-transparent hover:bg-[#1a1d27]",
            )}
          >
            <span className={cn("text-[12px] font-bold", mainView === key ? "text-white" : "text-[#787b86]")}>{label}</span>
            <span className="text-[9.5px] text-[#787b86]">{desc}</span>
          </button>
        ))}

        {/* Crypto filter pills — only show when on crypto view */}
        {mainView === "crypto" && (
          <div className="flex items-center gap-1 ml-4">
            {(["all", "gainers", "losers"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10.5px] font-semibold capitalize transition-all",
                  filter === f
                    ? "bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/40"
                    : "text-[#787b86] hover:text-white hover:bg-[#1a1d27]",
                )}
              >{f}</button>
            ))}
          </div>
        )}

        <div className="flex-1" />
        <button
          onClick={() => { void refetchOv(); void refetchStocks(); }}
          className="flex items-center gap-1 text-[10px] text-[#787b86] hover:text-white transition-colors px-4 shrink-0"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* ── Main Body ── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

        {/* Left: Bubble map or Stock grid */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col" style={{ minHeight: "260px" }}>
          {mainView === "crypto" && (
            <>
              <div className="flex items-center justify-between px-4 py-1 shrink-0 border-b border-[#1e222d]">
                <span className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest">
                  Bubble size = market cap · color = 24h performance
                </span>
              </div>
              <CryptoBubbleMap coins={displayCoins} loading={ovLoading} />
            </>
          )}
          {mainView === "stocks" && (
            <>
              <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-[#1e222d]">
                <span className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest">
                  Cell color = daily % change · hover for details
                </span>
                <span className="text-[10px] text-[#787b86]">Source: Yahoo Finance · {stocks.length} stocks</span>
              </div>
              <StockHeatGrid stocks={stocks} loading={stocksLoading} />
            </>
          )}
        </div>

        {/* Right: Sidebar movers */}
        <div className="w-full md:w-64 shrink-0 flex flex-col border-l border-[#1e222d] overflow-hidden">
          {/* Tab row — scrollable on mobile */}
          <div className="flex border-b border-[#1e222d] shrink-0 overflow-x-auto scrollbar-hide">
            {SIDE_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSideTab(key)}
                className={cn(
                  "px-2.5 py-2 text-[9.5px] font-bold whitespace-nowrap shrink-0 border-b-2 transition-all",
                  sideTab === key
                    ? "border-[#2962ff] text-white bg-[#2962ff]/10"
                    : "border-transparent text-[#787b86] hover:text-white",
                )}
              >{label}</button>
            ))}
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {sideTab === "crypto-g" && <CryptoMoversList coins={allCoins} type="gainers" />}
            {sideTab === "crypto-l" && <CryptoMoversList coins={allCoins} type="losers" />}
            {sideTab === "stock-g"  && <StockMoversList  stocks={stocks}  type="gainers" />}
            {sideTab === "stock-l"  && <StockMoversList  stocks={stocks}  type="losers" />}
            {sideTab === "new"      && <NewListings listings={overview?.newListings ?? []} />}
          </div>
        </div>
      </div>

      {/* ── Bottom Market Strip: Indices / Forex / Commodities / Crypto ── */}
      <MarketStrip prices={prices} loading={pricesLoading} />
    </div>
  );
}
