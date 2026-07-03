import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Zap, Globe, RefreshCw,
  AlertCircle, ChevronUp, ChevronDown, BarChart2, List, X,
} from "lucide-react";

/* ════════════════ Types ════════════════ */
interface CoinData {
  id: string; symbol: string; name: string; image: string;
  current_price: number; market_cap: number; market_cap_rank: number;
  price_change_percentage_24h: number;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_1y_in_currency?: number | null;
  total_volume: number;
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
interface BubbleState { index: number; coin: CoinData; x: number; y: number; r: number; pct: number; }
type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y";

/* ════════════════ Helpers ════════════════ */
function getPct(coin: CoinData, tf: Timeframe): number {
  switch (tf) {
    case "1H": return coin.price_change_percentage_1h_in_currency ?? 0;
    case "1W": return coin.price_change_percentage_7d_in_currency ?? 0;
    case "1M": return coin.price_change_percentage_30d_in_currency ?? 0;
    case "1Y": return coin.price_change_percentage_1y_in_currency ?? 0;
    default:   return coin.price_change_percentage_24h ?? 0;
  }
}

function getBubbleColor(pct: number): { bg: string; glow: string } {
  const a = Math.abs(pct);
  if (pct >= 0) {
    if (a >= 10) return { bg: "#00c853", glow: "#00e676" };
    if (a >= 5)  return { bg: "#00a152", glow: "#00c853" };
    if (a >= 2)  return { bg: "#1b5e20", glow: "#2e7d32" };
    return        { bg: "#0d3318", glow: "#1b5e20" };
  } else {
    if (a >= 10) return { bg: "#d32f2f", glow: "#ef5350" };
    if (a >= 5)  return { bg: "#c62828", glow: "#e53935" };
    if (a >= 2)  return { bg: "#7f0000", glow: "#b71c1c" };
    return        { bg: "#3e0000", glow: "#7f0000" };
  }
}

function fmtPrice(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return "$" + n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return "$" + n.toFixed(6).replace(/0+$/, "");
}
function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

/* ════════════════ Image Cache ════════════════ */
const imgCache = new Map<string, HTMLImageElement | null>();
function loadImg(url: string): Promise<HTMLImageElement | null> {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => { imgCache.set(url, img); resolve(img); };
    img.onerror = () => { imgCache.set(url, null); resolve(null); };
    img.src = url;
  });
}

/* ════════════════ Bubble Layout ════════════════ */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
function computeBubbles(coins: CoinData[], W: number, H: number, tf: Timeframe): BubbleState[] {
  const list = coins.slice(0, 70);
  const maxMcap = list[0]?.market_cap ?? 1;
  const scale = Math.min(W, H);
  const cx = W / 2, cy = H / 2;

  const bubbles: BubbleState[] = list.map((coin, i) => {
    const mcapFrac = Math.sqrt(coin.market_cap / maxMcap);
    const r = Math.max(12, Math.min(scale * 0.17, scale * 0.17 * mcapFrac));
    const spiral = scale * 0.04 * Math.sqrt(i + 0.5);
    const angle  = i * GOLDEN;
    return { index: i, coin, x: cx + spiral * Math.cos(angle), y: cy + spiral * Math.sin(angle), r, pct: getPct(coin, tf) };
  });

  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dx = bubbles[j].x - bubbles[i].x, dy = bubbles[j].y - bubbles[i].y;
        const d = Math.hypot(dx, dy) || 0.001, minD = bubbles[i].r + bubbles[j].r + 2.5;
        if (d < minD) {
          const push = (minD - d) * 0.5, nx = dx / d, ny = dy / d;
          bubbles[i].x -= nx * push; bubbles[i].y -= ny * push;
          bubbles[j].x += nx * push; bubbles[j].y += ny * push;
        }
      }
    }
  }
  for (const b of bubbles) {
    b.x = Math.max(b.r + 2, Math.min(W - b.r - 2, b.x));
    b.y = Math.max(b.r + 2, Math.min(H - b.r - 2, b.y));
  }
  return bubbles;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  b: BubbleState,
  hovered: boolean,
  t: number,
  imgs: Map<string, HTMLImageElement | null>,
) {
  const floatY = Math.sin(t * 0.0007 + b.index * 0.65) * (b.r * 0.012);
  const floatX = Math.cos(t * 0.0005 + b.index * 0.55) * (b.r * 0.008);
  const x = b.x + floatX, y = b.y + floatY;
  const r = hovered ? b.r * 1.08 : b.r;
  const { bg, glow } = getBubbleColor(b.pct);

  ctx.save();
  if (hovered) { ctx.shadowColor = glow; ctx.shadowBlur = 28; }

  const grad = ctx.createRadialGradient(x - r * 0.32, y - r * 0.32, r * 0.04, x, y, r);
  grad.addColorStop(0, glow + "dd");
  grad.addColorStop(0.45, bg + "ff");
  grad.addColorStop(1, bg + "bb");
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = hovered ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.09)";
  ctx.lineWidth = hovered ? 1.5 : 0.7; ctx.stroke();

  if (r >= 16) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const hasPct = r >= 26;
    const hasLogo = r >= 34;
    const img = imgs.get(b.coin.image);

    if (hasLogo && img) {
      const logoR = r * 0.35;
      const logoY = hasPct ? y - r * 0.38 : y;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, logoY, logoR, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, x - logoR, logoY - logoR, logoR * 2, logoR * 2);
      ctx.restore();
      const symSize = Math.min(r * 0.24, 11);
      const symY = logoY + logoR + symSize * 0.7;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `700 ${symSize}px Inter,system-ui,sans-serif`;
      ctx.fillText(b.coin.symbol.toUpperCase(), x, symY);
      if (hasPct) {
        const pctSize = Math.min(r * 0.22, 10.5);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.font = `600 ${pctSize}px Inter,system-ui,sans-serif`;
        ctx.fillText(`${b.pct >= 0 ? "+" : ""}${b.pct.toFixed(1)}%`, x, symY + symSize * 1.05);
      }
    } else {
      const symSize = Math.min(r * (hasPct ? 0.34 : 0.42), hasPct ? 14 : 16);
      const symY = hasPct ? y - symSize * 0.6 : y;
      ctx.fillStyle = "rgba(255,255,255,0.97)";
      ctx.font = `700 ${symSize}px Inter,system-ui,sans-serif`;
      ctx.fillText(b.coin.symbol.toUpperCase(), x, symY);
      if (hasPct) {
        const pctSize = Math.min(r * 0.26, 11);
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.font = `600 ${pctSize}px Inter,system-ui,sans-serif`;
        ctx.fillText(`${b.pct >= 0 ? "+" : ""}${b.pct.toFixed(1)}%`, x, symY + symSize * 0.95);
      }
    }
  }
  ctx.restore();
}

/* ════════════════ Crypto Bubble Map ════════════════ */
function CryptoBubbleMap({ coins, loading, tf }: { coins: CoinData[]; loading: boolean; tf: Timeframe }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const bubblesRef   = useRef<BubbleState[]>([]);
  const hoveredRef   = useRef<number | null>(null);
  const rafRef       = useRef(0);
  const imgsRef      = useRef<Map<string, HTMLImageElement | null>>(new Map());
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
    bubblesRef.current = computeBubbles(coins, dims.w, dims.h, tf);
    const urls = coins.slice(0, 70).map(c => c.image).filter(Boolean);
    urls.forEach(url => { if (!imgsRef.current.has(url)) loadImg(url).then(img => { imgsRef.current.set(url, img); }); });
  }, [coins, dims, tf]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !dims.w) return;
    const frame = (t: number) => {
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, dims.w, dims.h);
      const bs = bubblesRef.current;
      for (let i = 0; i < bs.length; i++) drawBubble(ctx, bs[i], hoveredRef.current === i, t, imgsRef.current);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims]);

  const hitTest = useCallback((mx: number, my: number) => {
    const bs = bubblesRef.current;
    for (let i = 0; i < bs.length; i++) {
      if (Math.hypot(mx - bs[i].x, my - bs[i].y) <= bs[i].r + 3) return i;
    }
    return -1;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const found = hitTest(mx, my);
    hoveredRef.current = found >= 0 ? found : null;
    if (found >= 0) setTooltip({ x: mx, y: my, b: bubblesRef.current[found] });
    else setTooltip(null);
  }, [hitTest]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const t = e.touches[0];
    const mx = t.clientX - rect.left, my = t.clientY - rect.top;
    const found = hitTest(mx, my);
    hoveredRef.current = found >= 0 ? found : null;
    if (found >= 0) setTooltip({ x: mx, y: my, b: bubblesRef.current[found] });
    else setTooltip(null);
  }, [hitTest]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ background: "#0b0c10" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => { hoveredRef.current = null; setTooltip(null); }}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { hoveredRef.current = null; setTooltip(null); }}
        className="cursor-crosshair touch-none"
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ left: Math.min(tooltip.x + 16, dims.w - 192), top: Math.max(tooltip.y - 96, 6) }}
        >
          <div className="bg-[#13141a] border border-[#2a2e3d] rounded-2xl px-4 py-3 shadow-2xl min-w-[184px]">
            <div className="flex items-center gap-2 mb-2">
              {imgCache.get(tooltip.b.coin.image) && (
                <img src={tooltip.b.coin.image} alt={tooltip.b.coin.symbol} className="w-6 h-6 rounded-full" />
              )}
              <div>
                <p className="text-white font-bold text-sm leading-tight">{tooltip.b.coin.name}</p>
                <p className="text-[#6b7280] text-[10px] uppercase font-semibold">{tooltip.b.coin.symbol}</p>
              </div>
            </div>
            <p className="text-white font-mono text-sm font-semibold">{fmtPrice(tooltip.b.coin.current_price)}</p>
            <p className={cn("text-xs font-bold mt-0.5", tooltip.b.pct >= 0 ? "text-[#00c853]" : "text-[#ef5350]")}>
              {tooltip.b.pct >= 0 ? "▲" : "▼"} {Math.abs(tooltip.b.pct).toFixed(2)}%
            </p>
            <div className="mt-2 pt-2 border-t border-[#2a2e3d] space-y-0.5">
              <div className="flex justify-between text-[10.5px]">
                <span className="text-[#6b7280]">Market Cap</span>
                <span className="text-[#c6c9d5] tabular-nums">{fmtLarge(tooltip.b.coin.market_cap)}</span>
              </div>
              <div className="flex justify-between text-[10.5px]">
                <span className="text-[#6b7280]">Volume 24h</span>
                <span className="text-[#c6c9d5] tabular-nums">{fmtLarge(tooltip.b.coin.total_volume)}</span>
              </div>
              <div className="flex justify-between text-[10.5px]">
                <span className="text-[#6b7280]">Rank</span>
                <span className="text-[#c6c9d5]">#{tooltip.b.coin.market_cap_rank}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "#0b0c10e8" }}>
          <div className="w-10 h-10 border-2 border-[#00c853] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-[#6b7280] text-sm">Loading market data…</p>
        </div>
      )}
      {!loading && coins.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="h-10 w-10 text-[#ef5350]/50" />
          <p className="text-[#6b7280] text-sm">Market data unavailable</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 pointer-events-none">
        {[
          { color: "#00c853", label: ">+10%" },
          { color: "#00a152", label: ">+5%" },
          { color: "#1b5e20", label: "+2%" },
          { color: "#3e0000", label: "-2%" },
          { color: "#c62828", label: "<-5%" },
          { color: "#d32f2f", label: "<-10%" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[9px] text-[#6b7280] font-medium tabular-nums">{label}</span>
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
    if (a >= 5) return "bg-[#00c853]/20 border-[#00c853]/40";
    if (a >= 2) return "bg-[#00a152]/20 border-[#00a152]/40";
    return "bg-[#1b5e20]/20 border-[#1b5e20]/30";
  } else {
    if (a >= 5) return "bg-[#d32f2f]/20 border-[#d32f2f]/40";
    if (a >= 2) return "bg-[#c62828]/20 border-[#c62828]/40";
    return "bg-[#7f0000]/20 border-[#7f0000]/30";
  }
}

function StockHeatGrid({ stocks, loading }: { stocks: StockQuote[]; loading: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#00c853] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!stocks.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#6b7280]">
      <AlertCircle className="h-8 w-8" />
      <p className="text-sm">Stock data unavailable</p>
    </div>
  );
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {stocks.map((s) => {
          const pct = s.regularMarketChangePercent ?? 0;
          const isPos = pct >= 0;
          const isHov = hovered === s.symbol;
          return (
            <div
              key={s.symbol}
              className={cn("relative border rounded-xl p-2.5 cursor-default transition-all", stockColor(pct), isHov && "scale-105 z-10 shadow-2xl")}
              onMouseEnter={() => setHovered(s.symbol)}
              onMouseLeave={() => setHovered(null)}
            >
              <p className="text-white font-bold text-[12px] leading-tight">{s.symbol}</p>
              <p className="text-[10px] text-[#6b7280] truncate leading-tight mb-1">
                {s.shortName?.replace(" Inc.", "").replace(" Corp.", "").replace(" Co.", "")}
              </p>
              <p className="text-white font-mono text-[11px] tabular-nums">
                ${s.regularMarketPrice?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </p>
              <p className={cn("text-[10.5px] font-bold tabular-nums mt-0.5", isPos ? "text-[#00c853]" : "text-[#ef5350]")}>
                {isPos ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
              </p>
              {isHov && (
                <div className="absolute z-50 left-full ml-2 top-0 bg-[#13141a] border border-[#2a2e3d] rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px] pointer-events-none">
                  <p className="text-white font-bold text-xs mb-1.5">{s.shortName}</p>
                  <div className="space-y-0.5 text-[10.5px]">
                    {[
                      ["Price",   `$${s.regularMarketPrice?.toFixed(2)}`,          "text-white"],
                      ["High",    `$${s.regularMarketDayHigh?.toFixed(2)}`,         "text-[#00c853]"],
                      ["Low",     `$${s.regularMarketDayLow?.toFixed(2)}`,          "text-[#ef5350]"],
                      ["MCap",    fmtLarge(s.marketCap),                            "text-white"],
                      ["Vol",     `${(s.regularMarketVolume / 1e6).toFixed(1)}M`,   "text-white"],
                    ].map(([label, value, cls]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <span className="text-[#6b7280]">{label}</span>
                        <span className={cn("tabular-nums", cls)}>{value}</span>
                      </div>
                    ))}
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
function GlobalStatsBar({ data, coins, tf }: { data: GlobalData; coins: CoinData[]; tf: Timeframe }) {
  const mcap    = data.total_market_cap?.["usd"] ?? 0;
  const mcapChg = data.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom  = data.market_cap_percentage?.["btc"] ?? 0;
  const ethDom  = data.market_cap_percentage?.["eth"] ?? 0;
  const gainers = coins.filter(c => getPct(c, tf) > 0).length;
  const losers  = coins.filter(c => getPct(c, tf) < 0).length;
  const stats = [
    { label: "Market Cap",   value: fmtLarge(mcap), sub: `${mcapChg >= 0 ? "+" : ""}${mcapChg.toFixed(2)}%`, up: mcapChg >= 0 },
    { label: "BTC Dom",      value: `${btcDom.toFixed(1)}%`,  sub: null, up: null },
    { label: "ETH Dom",      value: `${ethDom.toFixed(1)}%`,  sub: null, up: null },
    { label: "Gainers",      value: `${gainers}`, sub: null, up: true },
    { label: "Losers",       value: `${losers}`,  sub: null, up: false },
  ];
  return (
    <div className="flex items-center border-b border-[#1a1d25] bg-[#0b0c10] shrink-0 overflow-x-auto scrollbar-hide">
      {stats.map(({ label, value, sub, up }, i) => (
        <div key={label} className={cn("flex flex-col px-3.5 py-2 shrink-0 border-r border-[#1a1d25]", i === 0 && "pl-4")}>
          <span className="text-[9.5px] font-semibold text-[#4b5563] uppercase tracking-wide whitespace-nowrap">{label}</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={cn("text-[12.5px] font-bold tabular-nums",
              up === null ? "text-white" : up ? "text-[#00c853]" : "text-[#ef5350]")}>{value}</span>
            {sub && <span className={cn("text-[9.5px] font-semibold", up ? "text-[#00c853]" : "text-[#ef5350]")}>{sub}</span>}
          </div>
        </div>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 px-4 text-[9.5px] text-[#4b5563] shrink-0">
        <Globe className="h-3 w-3" />
        <span className="hidden sm:inline">CoinGecko · Yahoo Finance</span>
      </div>
    </div>
  );
}

/* ════════════════ Sidebar ════════════════ */
function CryptoMoversList({ coins, type, tf }: { coins: CoinData[]; type: "gainers" | "losers"; tf: Timeframe }) {
  const sorted = [...coins]
    .sort((a, b) => type === "gainers"
      ? getPct(b, tf) - getPct(a, tf)
      : getPct(a, tf) - getPct(b, tf))
    .slice(0, 10);
  const isUp = type === "gainers";
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-1.5 px-3 py-2 border-b border-[#1a1d25]", isUp ? "bg-[#00c853]/5" : "bg-[#ef5350]/5")}>
        {isUp ? <TrendingUp className="h-3.5 w-3.5 text-[#00c853]" /> : <TrendingDown className="h-3.5 w-3.5 text-[#ef5350]" />}
        <span className={cn("text-[11px] font-bold uppercase tracking-wide", isUp ? "text-[#00c853]" : "text-[#ef5350]")}>
          Top {isUp ? "Gainers" : "Losers"}
        </span>
      </div>
      {sorted.map((coin) => {
        const pct = getPct(coin, tf);
        return (
          <div key={coin.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#13141a] transition-colors border-b border-[#1a1d25]/60">
            <img src={coin.image} alt={coin.symbol} className="w-6 h-6 rounded-full shrink-0" loading="lazy" />
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white">{coin.symbol.toUpperCase()}</p>
              <p className="text-[9.5px] text-[#4b5563] tabular-nums">{fmtPrice(coin.current_price)}</p>
            </div>
            <span className={cn("text-[11.5px] font-bold tabular-nums shrink-0", pct >= 0 ? "text-[#00c853]" : "text-[#ef5350]")}>
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
    .slice(0, 10);
  const isUp = type === "gainers";
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-1.5 px-3 py-2 border-b border-[#1a1d25]", isUp ? "bg-[#2962ff]/5" : "bg-[#ff6b35]/5")}>
        <BarChart2 className={cn("h-3.5 w-3.5", isUp ? "text-[#2962ff]" : "text-[#ff6b35]")} />
        <span className={cn("text-[11px] font-bold uppercase tracking-wide", isUp ? "text-[#2962ff]" : "text-[#ff6b35]")}>
          Stock {isUp ? "Gainers" : "Losers"}
        </span>
      </div>
      {sorted.map((s) => {
        const pct = s.regularMarketChangePercent ?? 0;
        return (
          <div key={s.symbol} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#13141a] transition-colors border-b border-[#1a1d25]/60">
            <div className="w-6 h-6 rounded-full bg-[#2962ff]/15 flex items-center justify-center shrink-0">
              <span className="text-[7px] font-bold text-[#2962ff]">{s.symbol.slice(0, 2)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white">{s.symbol}</p>
              <p className="text-[9.5px] text-[#4b5563] tabular-nums">${s.regularMarketPrice?.toFixed(2)}</p>
            </div>
            <span className={cn("text-[11.5px] font-bold tabular-nums shrink-0", pct >= 0 ? "text-[#00c853]" : "text-[#ef5350]")}>
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
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1a1d25] bg-[#f0b90b]/5">
        <Zap className="h-3.5 w-3.5 text-[#f0b90b]" />
        <span className="text-[11px] font-bold text-[#f0b90b] uppercase tracking-wide">New Listings</span>
      </div>
      {listings.slice(0, 8).map((l) => {
        const dt = l.activated_at
          ? new Date(l.activated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Recent";
        return (
          <div key={l.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#13141a] transition-colors border-b border-[#1a1d25]/60">
            <div className="w-6 h-6 rounded-full bg-[#f0b90b]/15 flex items-center justify-center shrink-0">
              <span className="text-[7px] font-bold text-[#f0b90b]">{l.symbol.slice(0, 3).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white truncate">{l.name}</p>
              <p className="text-[9.5px] text-[#4b5563]">{l.symbol.toUpperCase()}</p>
            </div>
            <span className="text-[9.5px] text-[#4b5563] shrink-0">{dt}</span>
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
      { symbol: "EUR/USD", name: "Euro",    emoji: "€" },
      { symbol: "GBP/USD", name: "Pound",   emoji: "£" },
      { symbol: "USD/JPY", name: "Yen",     emoji: "¥" },
      { symbol: "AUD/USD", name: "Aussie",  emoji: "🦘" },
    ],
  },
  {
    key: "commodities", label: "🪙 Commodities",
    rows: [
      { symbol: "XAU/USD", name: "Gold",   emoji: "🥇" },
      { symbol: "XAG/USD", name: "Silver", emoji: "🥈" },
      { symbol: "BTC/USD", name: "Bitcoin",emoji: "₿" },
      { symbol: "ETH/USD", name: "Ethereum",emoji: "Ξ" },
    ],
  },
];

function MarketStrip({ prices, loading }: { prices: Record<string, PriceRow>; loading: boolean }) {
  const [activeTab, setActiveTab] = useState<BottomTab>("forex");
  const rows = BOTTOM_CATEGORIES.find(c => c.key === activeTab)?.rows ?? [];
  return (
    <div className="shrink-0 border-t border-[#1a1d25] bg-[#0b0c10]">
      <div className="flex items-center border-b border-[#1a1d25] overflow-x-auto scrollbar-hide">
        {BOTTOM_CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-4 py-2 text-[10.5px] font-bold shrink-0 border-b-2 transition-all whitespace-nowrap",
              activeTab === key ? "border-[#00c853] text-white" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
            )}
          >{label}</button>
        ))}
      </div>
      <div className="flex overflow-x-auto scrollbar-hide py-1">
        {rows.map(({ symbol, name, emoji }) => {
          const p = prices[symbol];
          const up = p?.up ?? true;
          return (
            <div key={symbol} className="flex flex-col items-start px-4 py-2 border-r border-[#1a1d25] shrink-0 min-w-[100px]">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px]">{emoji}</span>
                <span className="text-[9.5px] font-bold text-[#4b5563] uppercase tracking-wide truncate">{symbol}</span>
              </div>
              <p className="text-[13px] font-bold text-white tabular-nums">
                {loading ? <span className="text-[#4b5563]">…</span>
                  : p ? p.price.toLocaleString("en-US", { maximumFractionDigits: p.price < 10 ? 5 : 2 })
                  : "—"}
              </p>
              <p className="text-[9.5px] text-[#4b5563] truncate">{name}</p>
              {p && (
                <div className={cn("flex items-center gap-0.5 mt-0.5", up ? "text-[#00c853]" : "text-[#ef5350]")}>
                  {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span className="text-[10px] font-bold tabular-nums">{p.change}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════ Main ════════════════ */
type MainView  = "crypto" | "stocks";
type SideTab   = "crypto-g" | "crypto-l" | "stock-g" | "stock-l" | "new";

const TF_TABS: { key: Timeframe; label: string }[] = [
  { key: "1H", label: "1H" },
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "1Y", label: "1Y" },
];

export default function Trading() {
  const [mainView, setMainView] = useState<MainView>("crypto");
  const [tf, setTf]             = useState<Timeframe>("1D");
  const [sideTab, setSideTab]   = useState<SideTab>("crypto-g");
  const [sideOpen, setSideOpen] = useState(true);

  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery<OverviewData>({
    queryKey: ["market-overview"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/overview", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<OverviewData>;
    },
    staleTime: 2 * 60_000, refetchInterval: 3 * 60_000, retry: 2,
  });

  const { data: prices = {} as Record<string, PriceRow>, isLoading: pricesLoading } = useQuery<Record<string, PriceRow>>({
    queryKey: ["market-prices"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/prices", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Record<string, PriceRow>>;
    },
    staleTime: 60_000, refetchInterval: 90_000, retry: 1,
  });

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

  const SIDE_TABS: { key: SideTab; label: string }[] = [
    { key: "crypto-g", label: "🟢 Crypto↑" },
    { key: "crypto-l", label: "🔴 Crypto↓" },
    { key: "stock-g",  label: "📈 Stocks↑" },
    { key: "stock-l",  label: "📉 Stocks↓" },
    { key: "new",      label: "⚡ New" },
  ];

  return (
    <div className="flex flex-col h-full select-none overflow-hidden rounded-xl" style={{ background: "#0b0c10", color: "#c6c9d5" }}>

      {/* ── Top: Stats + View Switch ── */}
      <GlobalStatsBar data={overview?.global ?? {}} coins={allCoins} tf={tf} />

      {/* ── View Toggle + Controls ── */}
      <div className="flex items-center gap-0 border-b border-[#1a1d25] bg-[#0b0c10] shrink-0 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setMainView("crypto")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 border-b-2 shrink-0 transition-all text-[12px] font-bold",
            mainView === "crypto" ? "border-[#00c853] text-white" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
          )}
        >₿ Crypto Bubbles</button>
        <button
          onClick={() => setMainView("stocks")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 border-b-2 shrink-0 transition-all text-[12px] font-bold",
            mainView === "stocks" ? "border-[#2962ff] text-white" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
          )}
        >📊 Stocks</button>

        <div className="w-px h-6 bg-[#1a1d25] mx-1 shrink-0" />

        {/* Timeframe — only on crypto view */}
        {mainView === "crypto" && TF_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTf(key)}
            className={cn(
              "px-3 py-1.5 mx-0.5 my-auto rounded-lg text-[11px] font-bold shrink-0 transition-all",
              tf === key
                ? "bg-[#00c853]/20 text-[#00c853] border border-[#00c853]/40"
                : "text-[#4b5563] hover:text-[#9ca3af]",
            )}
          >{label}</button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setSideOpen(v => !v)}
          className="flex items-center gap-1 text-[10.5px] text-[#4b5563] hover:text-white transition-colors px-3 py-2 shrink-0"
        >
          {sideOpen ? <X className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{sideOpen ? "Hide" : "Movers"}</span>
        </button>
        <button
          onClick={() => { void refetchOv(); void refetchStocks(); }}
          className="flex items-center gap-1 text-[10.5px] text-[#4b5563] hover:text-white transition-colors px-3 py-2 shrink-0 border-l border-[#1a1d25]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Main Body ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Bubble / Stock map */}
        <div className="flex-1 min-h-0 min-w-0">
          {mainView === "crypto" && <CryptoBubbleMap coins={allCoins} loading={ovLoading} tf={tf} />}
          {mainView === "stocks" && (
            <div className="flex flex-col h-full" style={{ background: "#0b0c10" }}>
              <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-[#1a1d25]">
                <span className="text-[10px] font-bold text-[#4b5563] uppercase tracking-widest">Color = daily % · Hover for details</span>
                <span className="text-[10px] text-[#4b5563]">{stocks.length} stocks · Yahoo Finance</span>
              </div>
              <StockHeatGrid stocks={stocks} loading={stocksLoading} />
            </div>
          )}
        </div>

        {/* Sidebar movers */}
        {sideOpen && (
          <div className="w-56 shrink-0 flex flex-col border-l border-[#1a1d25] overflow-hidden" style={{ background: "#0b0c10" }}>
            <div className="flex border-b border-[#1a1d25] shrink-0 overflow-x-auto scrollbar-hide">
              {SIDE_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSideTab(key)}
                  className={cn(
                    "px-2 py-2 text-[9px] font-bold whitespace-nowrap shrink-0 border-b-2 transition-all",
                    sideTab === key ? "border-[#00c853] text-white" : "border-transparent text-[#4b5563] hover:text-white",
                  )}
                >{label}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {sideTab === "crypto-g" && <CryptoMoversList coins={allCoins} type="gainers" tf={tf} />}
              {sideTab === "crypto-l" && <CryptoMoversList coins={allCoins} type="losers"  tf={tf} />}
              {sideTab === "stock-g"  && <StockMoversList  stocks={stocks}  type="gainers" />}
              {sideTab === "stock-l"  && <StockMoversList  stocks={stocks}  type="losers"  />}
              {sideTab === "new"      && <NewListings listings={overview?.newListings ?? []} />}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom: Timeframe bar + Market strip ── */}
      <MarketStrip prices={prices} loading={pricesLoading} />
    </div>
  );
}
