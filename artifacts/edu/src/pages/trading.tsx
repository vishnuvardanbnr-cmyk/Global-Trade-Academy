import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw, TrendingUp, TrendingDown, Zap } from "lucide-react";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_1y_in_currency?: number | null;
  total_volume: number;
}

interface GlobalData {
  total_market_cap?: Record<string, number>;
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

type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y";
type MainCategory = "crypto" | "forex" | "commodities" | "stocks";
type CryptoTab = "bubble" | "gainers" | "losers" | "new";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function getPct(coin: CoinData, tf: Timeframe): number {
  switch (tf) {
    case "1H": return coin.price_change_percentage_1h_in_currency ?? 0;
    case "1W": return coin.price_change_percentage_7d_in_currency ?? 0;
    case "1M": return coin.price_change_percentage_30d_in_currency ?? 0;
    case "1Y": return coin.price_change_percentage_1y_in_currency ?? 0;
    default:   return coin.price_change_percentage_24h ?? 0;
  }
}

function fmtPrice(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return "$" + n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return "$" + n.toFixed(6).replace(/0+$/, "");
}

function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

function getBubbleColor(pct: number): { fill: string; glow: string; border: string } {
  const a = Math.abs(pct);
  if (pct >= 0) {
    if (a >= 10) return { fill: "#00c853", glow: "#00e676", border: "#69f0ae" };
    if (a >= 5)  return { fill: "#00a152", glow: "#00c853", border: "#00e676" };
    if (a >= 2)  return { fill: "#1b5e20", glow: "#388e3c", border: "#4caf50" };
    return        { fill: "#0d2e14", glow: "#1b5e20", border: "#2e7d32" };
  } else {
    if (a >= 10) return { fill: "#d32f2f", glow: "#f44336", border: "#ef9a9a" };
    if (a >= 5)  return { fill: "#b71c1c", glow: "#d32f2f", border: "#f44336" };
    if (a >= 2)  return { fill: "#7f0000", glow: "#b71c1c", border: "#d32f2f" };
    return        { fill: "#2d0000", glow: "#7f0000", border: "#b71c1c" };
  }
}

/* ─────────────────────────────────────────
   Image cache
───────────────────────────────────────── */
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

/* ─────────────────────────────────────────
   Bubble layout
───────────────────────────────────────── */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

interface Bubble {
  index: number;
  coin: CoinData;
  x: number;
  y: number;
  r: number;
  pct: number;
}

function computeBubbles(coins: CoinData[], W: number, H: number, tf: Timeframe): Bubble[] {
  const list = coins.slice(0, 60);
  const maxMcap = Math.max(...list.map(c => c.market_cap), 1);
  const scale = Math.min(W, H);
  const cx = W / 2, cy = H / 2;

  const bubbles: Bubble[] = list.map((coin, i) => {
    const frac = Math.sqrt(coin.market_cap / maxMcap);
    const r = Math.max(14, Math.min(scale * 0.16, scale * 0.16 * frac));
    const spiral = scale * 0.038 * Math.sqrt(i + 0.5);
    const angle  = i * GOLDEN;
    return {
      index: i, coin,
      x: cx + spiral * Math.cos(angle),
      y: cy + spiral * Math.sin(angle),
      r,
      pct: getPct(coin, tf),
    };
  });

  /* Separation pass */
  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dx = bubbles[j].x - bubbles[i].x;
        const dy = bubbles[j].y - bubbles[i].y;
        const d  = Math.hypot(dx, dy) || 0.001;
        const minD = bubbles[i].r + bubbles[j].r + 2;
        if (d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          bubbles[i].x -= nx * push; bubbles[i].y -= ny * push;
          bubbles[j].x += nx * push; bubbles[j].y += ny * push;
        }
      }
    }
  }

  /* Clamp to canvas */
  for (const b of bubbles) {
    b.x = Math.max(b.r + 2, Math.min(W - b.r - 2, b.x));
    b.y = Math.max(b.r + 2, Math.min(H - b.r - 2, b.y));
  }
  return bubbles;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  b: Bubble,
  hovered: boolean,
  t: number,
  imgs: Map<string, HTMLImageElement | null>,
) {
  const floatY = Math.sin(t * 0.0006 + b.index * 0.7) * (b.r * 0.012);
  const floatX = Math.cos(t * 0.0005 + b.index * 0.55) * (b.r * 0.008);
  const x = b.x + floatX;
  const y = b.y + floatY;
  const r = hovered ? b.r * 1.07 : b.r;
  const { fill, glow, border } = getBubbleColor(b.pct);

  ctx.save();

  /* Glow on hover */
  if (hovered) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 32;
  }

  /* Radial gradient fill */
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.04, x, y, r);
  grad.addColorStop(0, glow + "cc");
  grad.addColorStop(0.5, fill + "ff");
  grad.addColorStop(1,   fill + "aa");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;

  /* Border */
  ctx.strokeStyle = hovered ? border + "99" : border + "33";
  ctx.lineWidth   = hovered ? 1.5 : 0.8;
  ctx.stroke();

  /* Text */
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  if (r < 18) { ctx.restore(); return; }

  const hasPct  = r >= 28;
  const hasLogo = r >= 36;
  const img = imgs.get(b.coin.image);

  if (hasLogo && img) {
    /* Logo + symbol + pct */
    const logoR = r * 0.33;
    const logoY = hasPct ? y - r * 0.34 : y;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, logoY, logoR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x - logoR, logoY - logoR, logoR * 2, logoR * 2);
    ctx.restore();

    const symSz = Math.min(r * 0.22, 11);
    const symY  = logoY + logoR + symSz * 0.75;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `700 ${symSz}px Inter,sans-serif`;
    ctx.fillText(b.coin.symbol.toUpperCase(), x, symY);

    if (hasPct) {
      const pctSz = Math.min(r * 0.20, 10);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 ${pctSz}px Inter,sans-serif`;
      ctx.fillText(`${b.pct >= 0 ? "+" : ""}${b.pct.toFixed(1)}%`, x, symY + symSz * 1.1);
    }
  } else {
    /* Symbol + pct only */
    const symSz = Math.min(r * (hasPct ? 0.32 : 0.40), 15);
    const symY  = hasPct ? y - symSz * 0.55 : y;
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.font = `700 ${symSz}px Inter,sans-serif`;
    ctx.fillText(b.coin.symbol.toUpperCase(), x, symY);

    if (hasPct) {
      const pctSz = Math.min(r * 0.24, 11);
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = `600 ${pctSz}px Inter,sans-serif`;
      ctx.fillText(`${b.pct >= 0 ? "+" : ""}${b.pct.toFixed(1)}%`, x, symY + symSz * 0.95);
    }
  }

  ctx.restore();
}

/* ─────────────────────────────────────────
   Bubble Map component
───────────────────────────────────────── */
function BubbleMap({ coins, loading, tf }: { coins: CoinData[]; loading: boolean; tf: Timeframe }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const bubblesRef   = useRef<Bubble[]>([]);
  const hoveredRef   = useRef<number | null>(null);
  const rafRef       = useRef(0);
  const imgsRef      = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const [dims, setDims]     = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; b: Bubble } | null>(null);

  /* Resize observer */
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

  /* HiDPI canvas */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims.w || !dims.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = dims.w * dpr;
    canvas.height = dims.h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
  }, [dims]);

  /* Recompute bubbles + preload logos */
  useEffect(() => {
    if (!dims.w || !dims.h || coins.length === 0) return;
    bubblesRef.current = computeBubbles(coins, dims.w, dims.h, tf);
    coins.slice(0, 60).forEach((c) => {
      if (c.image && !imgsRef.current.has(c.image)) {
        loadImg(c.image).then((img) => imgsRef.current.set(c.image, img));
      }
    });
  }, [coins, dims, tf]);

  /* Render loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims.w) return;
    const frame = (t: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, dims.w, dims.h);
      const bs = bubblesRef.current;
      for (let i = 0; i < bs.length; i++) {
        drawBubble(ctx, bs[i], hoveredRef.current === i, t, imgsRef.current);
      }
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

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => { hoveredRef.current = null; setTooltip(null); }}
        className="cursor-crosshair"
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 14, dims.w - 200),
            top:  Math.max(tooltip.y - 90, 6),
          }}
        >
          <div className="bg-[#13141a] border border-[#2a2e3d] rounded-2xl px-4 py-3 shadow-2xl min-w-[190px]">
            <div className="flex items-center gap-2 mb-2">
              {tooltip.b.coin.image && (
                <img src={tooltip.b.coin.image} alt="" className="w-6 h-6 rounded-full shrink-0" />
              )}
              <div>
                <p className="text-white font-bold text-sm leading-tight">{tooltip.b.coin.name}</p>
                <p className="text-[#6b7280] text-[10px] uppercase font-semibold tracking-wide">
                  {tooltip.b.coin.symbol} · #{tooltip.b.coin.market_cap_rank}
                </p>
              </div>
            </div>
            <p className="text-white font-mono text-sm font-semibold">{fmtPrice(tooltip.b.coin.current_price)}</p>
            <p className={cn("text-xs font-bold mt-0.5", tooltip.b.pct >= 0 ? "text-[#00c853]" : "text-[#f44336]")}>
              {tooltip.b.pct >= 0 ? "▲" : "▼"} {Math.abs(tooltip.b.pct).toFixed(2)}%
            </p>
            <div className="mt-2 pt-2 border-t border-[#1f2130] space-y-0.5">
              <div className="flex justify-between text-[10.5px]">
                <span className="text-[#6b7280]">Market Cap</span>
                <span className="text-[#c6c9d5] tabular-nums">{fmtLarge(tooltip.b.coin.market_cap)}</span>
              </div>
              <div className="flex justify-between text-[10.5px]">
                <span className="text-[#6b7280]">Volume 24h</span>
                <span className="text-[#c6c9d5] tabular-nums">{fmtLarge(tooltip.b.coin.total_volume)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "#0b0c10dd" }}>
          <div className="w-9 h-9 border-2 border-[#00c853] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#6b7280] text-sm">Loading market data…</p>
        </div>
      )}

      {!loading && coins.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-8 w-8 text-[#6b7280]/50" />
          <p className="text-[#6b7280] text-sm">No data available</p>
        </div>
      )}

      {/* Color legend */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1 pointer-events-none">
        {[
          { color: "#00c853", label: "> +10%" },
          { color: "#00a152", label: "> +5%"  },
          { color: "#1b5e20", label: "> +2%"  },
          { color: "#2d0000", label: "> -2%"  },
          { color: "#7f0000", label: "> -5%"  },
          { color: "#d32f2f", label: "> -10%" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[9px] text-[#4b5563] font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Top Gainers / Losers list
───────────────────────────────────────── */
function MoversList({
  coins,
  type,
  tf,
  loading,
}: {
  coins: CoinData[];
  type: "gainers" | "losers";
  tf: Timeframe;
  loading: boolean;
}) {
  const isUp = type === "gainers";
  const sorted = [...coins]
    .sort((a, b) =>
      isUp
        ? getPct(b, tf) - getPct(a, tf)
        : getPct(a, tf) - getPct(b, tf),
    )
    .slice(0, 50);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#00c853] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!coins.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2">
      <AlertCircle className="h-7 w-7 text-[#6b7280]/50" />
      <p className="text-[#6b7280] text-sm">No data</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header row */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2 border-b border-[#1a1d25] sticky top-0 bg-[#0b0c10] z-10">
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">#</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">Coin</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Price</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Change</span>
      </div>
      {sorted.map((coin, idx) => {
        const pct = getPct(coin, tf);
        return (
          <div
            key={coin.id}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-2.5 border-b border-[#1a1d25]/50 hover:bg-[#13141a] transition-colors"
          >
            <span className="text-[11px] text-[#4b5563] w-5 tabular-nums">{idx + 1}</span>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={coin.image} alt="" className="w-7 h-7 rounded-full shrink-0" loading="lazy" />
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-white leading-tight">{coin.symbol.toUpperCase()}</p>
                <p className="text-[10px] text-[#4b5563] truncate leading-tight">{coin.name}</p>
              </div>
            </div>
            <span className="text-[11.5px] text-white font-mono tabular-nums text-right">
              {fmtPrice(coin.current_price)}
            </span>
            <span className={cn(
              "text-[11.5px] font-bold tabular-nums text-right min-w-[52px]",
              pct >= 0 ? "text-[#00c853]" : "text-[#f44336]",
            )}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   New Listings list
───────────────────────────────────────── */
function NewListedList({ listings, loading }: { listings: NewListing[]; loading: boolean }) {
  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#f0b90b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!listings.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2">
      <Zap className="h-7 w-7 text-[#6b7280]/50" />
      <p className="text-[#6b7280] text-sm">No new listings</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 px-4 py-2 border-b border-[#1a1d25] sticky top-0 bg-[#0b0c10] z-10">
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">#</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">Token</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Listed</span>
      </div>
      {listings.map((l, idx) => {
        const dt = l.activated_at
          ? new Date(l.activated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "Recent";
        return (
          <div
            key={l.id}
            className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center px-4 py-3 border-b border-[#1a1d25]/50 hover:bg-[#13141a] transition-colors"
          >
            <span className="text-[11px] text-[#4b5563] w-5 tabular-nums">{idx + 1}</span>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#f0b90b]/15 flex items-center justify-center shrink-0">
                <span className="text-[8px] font-bold text-[#f0b90b]">{l.symbol.slice(0, 3).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-white leading-tight truncate">{l.name}</p>
                <p className="text-[10px] text-[#4b5563]">{l.symbol.toUpperCase()}</p>
              </div>
            </div>
            <span className="text-[10.5px] text-[#4b5563] text-right tabular-nums whitespace-nowrap">{dt}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   Coming Soon placeholder
───────────────────────────────────────── */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-[#13141a] border border-[#1a1d25] flex items-center justify-center text-2xl">
        📊
      </div>
      <p className="text-white font-semibold">{label}</p>
      <p className="text-[#4b5563] text-sm">Live data coming soon</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   Main page
───────────────────────────────────────── */
const TF_TABS: Timeframe[] = ["1H", "1D", "1W", "1M", "1Y"];

const MAIN_CATEGORIES: { key: MainCategory; label: string; emoji: string }[] = [
  { key: "crypto",      label: "Crypto",      emoji: "₿"  },
  { key: "forex",       label: "Forex",        emoji: "💱" },
  { key: "commodities", label: "Commodities",  emoji: "🪙" },
  { key: "stocks",      label: "Stocks",       emoji: "📈" },
];

const CRYPTO_TABS: { key: CryptoTab; label: string; icon: React.ReactNode }[] = [
  { key: "bubble",  label: "Bubble Map",   icon: <span className="text-xs">🫧</span> },
  { key: "gainers", label: "Top Gainers",  icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: "losers",  label: "Top Losers",   icon: <TrendingDown className="h-3.5 w-3.5" /> },
  { key: "new",     label: "New Listed",   icon: <Zap className="h-3.5 w-3.5" /> },
];

export default function Trading() {
  const [category, setCategory] = useState<MainCategory>("crypto");
  const [cryptoTab, setCryptoTab] = useState<CryptoTab>("bubble");
  const [tf, setTf] = useState<Timeframe>("1D");

  const { data: overview, isLoading: ovLoading, refetch } = useQuery<OverviewData>({
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

  const coins    = overview?.coins     ?? [];
  const listings = overview?.newListings ?? [];

  const showTf = category === "crypto" && cryptoTab !== "new";

  return (
    <div
      className="flex flex-col h-full overflow-hidden rounded-xl select-none"
      style={{ background: "#0b0c10", color: "#c6c9d5" }}
    >

      {/* ── Top bar: main category tabs ── */}
      <div className="flex items-center border-b border-[#1a1d25] shrink-0">
        <div className="flex flex-1 overflow-x-auto scrollbar-hide">
          {MAIN_CATEGORIES.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 border-b-2 shrink-0 font-semibold text-[13px] transition-all",
                category === key
                  ? "border-[#00c853] text-white"
                  : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={() => void refetch()}
          className="p-3 text-[#4b5563] hover:text-white transition-colors border-l border-[#1a1d25] shrink-0"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Crypto sub-tabs ── */}
      {category === "crypto" && (
        <div className="flex items-center border-b border-[#1a1d25] bg-[#0d0e13] shrink-0 overflow-x-auto scrollbar-hide">
          {CRYPTO_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setCryptoTab(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 border-b-2 shrink-0 text-[12px] font-semibold transition-all",
                cryptoTab === key
                  ? "border-[#00c853] text-white bg-[#00c853]/5"
                  : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span className={cn(cryptoTab === key ? "text-[#00c853]" : "text-[#4b5563]")}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Timeframe bar — shown below sub-tabs for crypto (not on New Listed) ── */}
      {category === "crypto" && cryptoTab !== "new" && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#1a1d25] bg-[#0b0c10] shrink-0">
          <span className="text-[10px] text-[#4b5563] font-semibold uppercase tracking-wide mr-1">Timeframe</span>
          {TF_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                "px-3 py-1 rounded-lg text-[11px] font-bold transition-all",
                tf === t
                  ? "bg-[#00c853]/15 text-[#00c853] border border-[#00c853]/30"
                  : "text-[#4b5563] hover:text-[#9ca3af] border border-transparent",
              )}
            >{t}</button>
          ))}
        </div>
      )}

      {/* ── Content area ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Crypto views */}
        {category === "crypto" && cryptoTab === "bubble" && (
          <BubbleMap coins={coins} loading={ovLoading} tf={tf} />
        )}
        {category === "crypto" && cryptoTab === "gainers" && (
          <MoversList coins={coins} type="gainers" tf={tf} loading={ovLoading} />
        )}
        {category === "crypto" && cryptoTab === "losers" && (
          <MoversList coins={coins} type="losers" tf={tf} loading={ovLoading} />
        )}
        {category === "crypto" && cryptoTab === "new" && (
          <NewListedList listings={listings} loading={ovLoading} />
        )}

        {/* Other categories */}
        {category === "forex"       && <ComingSoon label="Forex Markets" />}
        {category === "commodities" && <ComingSoon label="Commodities" />}
        {category === "stocks"      && <ComingSoon label="US & Global Stocks" />}
      </div>

    </div>
  );
}
