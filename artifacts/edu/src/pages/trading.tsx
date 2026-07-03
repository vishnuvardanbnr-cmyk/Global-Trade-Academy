import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw, TrendingUp, TrendingDown, Zap, Wifi, WifiOff } from "lucide-react";

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

interface NewListing { id: string; symbol: string; name: string; activated_at: number; }
interface OverviewData { coins: CoinData[]; global: GlobalData; newListings: NewListing[]; }
type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y";
type MainCategory = "crypto" | "forex" | "commodities" | "stocks";
type CryptoTab = "bubble" | "gainers" | "losers" | "new";

/* live tick keyed by UPPERCASE symbol */
interface LiveTick { price: number; pct24h: number; updatedAt: number; }

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function getPct(coin: CoinData, tf: Timeframe, live: Map<string, LiveTick>): number {
  if (tf === "1D") {
    const tick = live.get(coin.symbol.toUpperCase());
    if (tick) return tick.pct24h;
  }
  switch (tf) {
    case "1H": return coin.price_change_percentage_1h_in_currency ?? 0;
    case "1W": return coin.price_change_percentage_7d_in_currency ?? 0;
    case "1M": return coin.price_change_percentage_30d_in_currency ?? 0;
    case "1Y": return coin.price_change_percentage_1y_in_currency ?? 0;
    default:   return coin.price_change_percentage_24h ?? 0;
  }
}

function getLivePrice(coin: CoinData, live: Map<string, LiveTick>): number {
  return live.get(coin.symbol.toUpperCase())?.price ?? coin.current_price;
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

interface BubbleTheme {
  center: string;   /* bright inner highlight colour */
  mid: string;      /* main body colour              */
  edge: string;     /* dark rim colour               */
  glow: string;     /* outer shadow colour           */
}

function getBubbleTheme(pct: number): BubbleTheme {
  const a = Math.abs(pct);
  if (pct >= 0) {
    if (a >= 8)  return { center: "#b9f6ca", mid: "#00e676", edge: "#00210d", glow: "#00e676" };
    if (a >= 4)  return { center: "#69f0ae", mid: "#00c853", edge: "#003018", glow: "#00c853" };
    if (a >= 1.5)return { center: "#4caf50", mid: "#2e7d32", edge: "#0a2010", glow: "#388e3c" };
    return        { center: "#388e3c", mid: "#1b5e20", edge: "#071409", glow: "#2e7d32" };
  } else {
    if (a >= 8)  return { center: "#ffcdd2", mid: "#f44336", edge: "#1a0000", glow: "#f44336" };
    if (a >= 4)  return { center: "#ef9a9a", mid: "#d32f2f", edge: "#200000", glow: "#d32f2f" };
    if (a >= 1.5)return { center: "#e57373", mid: "#b71c1c", edge: "#180000", glow: "#c62828" };
    return        { center: "#c62828", mid: "#7f0000", edge: "#100000", glow: "#b71c1c" };
  }
}

/* ─────────────────────────────────────────
   Binance WebSocket live ticker hook
───────────────────────────────────────── */
const STABLE = new Set(["USDT","USDC","BUSD","DAI","TUSD","USDP","FDUSD","PYUSD"]);

function useBinanceTicker(symbols: string[]) {
  const [ticks, setTicks]   = useState<Map<string, LiveTick>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!symbols.length) return;

    const tradeable = symbols
      .map(s => s.toUpperCase())
      .filter(s => !STABLE.has(s))
      .slice(0, 50);

    if (!tradeable.length) return;

    const streams = tradeable.map(s => `${s.toLowerCase()}usdt@miniTicker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    let ws: WebSocket;
    let dead = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (dead) return;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { if (!dead) setConnected(true); };

      ws.onmessage = (ev) => {
        if (dead) return;
        try {
          const msg = JSON.parse(ev.data as string) as {
            data?: { s: string; c: string; P: string };
          };
          const d = msg.data;
          if (!d) return;
          const sym = d.s.replace("USDT", "");
          const price  = parseFloat(d.c);
          const pct24h = parseFloat(d.P);
          if (isNaN(price)) return;
          setTicks(prev => {
            const next = new Map(prev);
            next.set(sym, { price, pct24h, updatedAt: Date.now() });
            return next;
          });
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!dead) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      dead = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      setConnected(false);
    };
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ticks, connected };
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
  index: number; coin: CoinData;
  x: number; y: number; r: number; pct: number;
}

function computeBubbles(
  coins: CoinData[], W: number, H: number,
  tf: Timeframe,
  /* live intentionally omitted — layout only recomputes on static data changes */
): Bubble[] {
  if (W === 0 || H === 0) return [];
  const list = coins.slice(0, 75);
  const n = list.length;

  /* ── Radius based on |pct| from static CoinGecko data (not live ticks) ── */
  const BASE = 1.2;
  const pctAbs = list.map(c => Math.abs(getPct(c, tf, new Map())));
  const weights = pctAbs.map(p => p + BASE);
  const sumW    = weights.reduce((a, b) => a + b, 0);

  /* Derive K so Σ π·(K·w_i)² ≈ 0.90·W·H  →  K = sqrt(0.90·W·H / (π·Σw_i²)) */
  const sumWSq = weights.reduce((a, w) => a + w * w, 0);
  const K = Math.sqrt((W * H * 0.90) / (Math.PI * sumWSq));
  const minR = 11, maxR = Math.min(W, H) * 0.22;

  /* Build raw bubbles, sorted largest-first for grid placement */
  const raw = list.map((coin, i) => ({
    origIdx: i, coin,
    pct: getPct(coin, tf, live),
    r: Math.max(minR, Math.min(maxR, K * weights[i])),
  })).sort((a, b) => b.r - a.r);

  /* ── Initial placement: grid across the full canvas ── */
  const cols = Math.max(1, Math.round(Math.sqrt(n * (W / H))));
  const rows = Math.ceil(n / cols);
  const cw   = W / cols, ch = H / rows;

  const bubbles: Bubble[] = raw.map((s, gi) => ({
    index: s.origIdx, coin: s.coin, pct: s.pct, r: s.r,
    x: (gi % cols + 0.5) * cw,
    y: (Math.floor(gi / cols) + 0.5) * ch,
  }));

  /* ── Collision resolution (push-apart + boundary clamp) ── */
  for (let iter = 0; iter < 160; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bubbles[j].x - bubbles[i].x;
        const dy = bubbles[j].y - bubbles[i].y;
        const d   = Math.hypot(dx, dy) || 0.001;
        const gap = bubbles[i].r + bubbles[j].r + 1.5;
        if (d < gap) {
          const push = (gap - d) * 0.52;
          const nx = dx / d, ny = dy / d;
          bubbles[i].x -= nx * push;  bubbles[i].y -= ny * push;
          bubbles[j].x += nx * push;  bubbles[j].y += ny * push;
        }
      }
      /* Clamp inside canvas on every inner pass */
      const b = bubbles[i];
      b.x = Math.max(b.r + 1, Math.min(W - b.r - 1, b.x));
      b.y = Math.max(b.r + 1, Math.min(H - b.r - 1, b.y));
    }
  }

  return bubbles;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  b: Bubble,
  hovered: boolean,
  t: number,
  imgs: Map<string, HTMLImageElement | null>,
  flashAge: number,
) {
  /* Organic float — unique speed & phase per bubble */
  const s1 = 0.0007 + b.index * 0.000025;
  const s2 = 0.0005 + b.index * 0.000018;
  const floatY = Math.sin(t * s1 + b.index * 0.95) * (b.r * 0.06);
  const floatX = Math.cos(t * s2 + b.index * 0.75) * (b.r * 0.04);
  const breathe = 1 + 0.016 * Math.sin(t * 0.0013 + b.index * 1.5);

  const x = b.x + floatX;
  const y = b.y + floatY;
  const r = (hovered ? b.r * 1.09 : b.r) * breathe;

  const { center, mid, edge, glow } = getBubbleTheme(b.pct);

  ctx.save();

  /* ── Outer glow ── */
  ctx.shadowColor = glow;
  ctx.shadowBlur  = hovered ? r * 1.1 : r * 0.55;

  /* ── Sphere body: off-centre radial gradient (light from top-left) ── */
  const lx = x - r * 0.28, ly = y - r * 0.30;
  const body = ctx.createRadialGradient(lx, ly, r * 0.02, x, y, r);
  body.addColorStop(0,    center);
  body.addColorStop(0.35, mid);
  body.addColorStop(0.75, mid + "cc");
  body.addColorStop(1,    edge);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();

  ctx.shadowBlur = 0;

  /* ── Specular highlight (glassy top-left shine) ── */
  const hx = x - r * 0.36, hy = y - r * 0.36;
  const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.45);
  spec.addColorStop(0,   "rgba(255,255,255,0.55)");
  spec.addColorStop(0.5, "rgba(255,255,255,0.10)");
  spec.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = spec; ctx.fill();

  /* ── Inner rim (thin bright edge on hover) ── */
  if (hovered) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5; ctx.stroke();
  }

  /* ── Live-tick flash ── */
  const fa = flashAge > 0 ? Math.max(0, 1 - flashAge / 700) : 0;
  if (fa > 0.02) {
    ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${fa * 0.65})`;
    ctx.lineWidth = 2.5; ctx.stroke();
  }

  /* ── Text ── */
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (r < 14) { ctx.restore(); return; }

  const hasPct  = r >= 24;
  const hasLogo = r >= 32;
  const img = imgs.get(b.coin.image);
  const sym = b.coin.symbol.toUpperCase();

  if (hasLogo && img) {
    /* Logo → symbol → % stacked */
    const logoR = r * 0.30;
    const gap   = r * 0.06;
    const symSz = Math.min(r * 0.26, hasPct ? 13 : 16);
    const pctSz = Math.min(r * 0.21, 11);
    const totalH = logoR * 2 + gap + symSz * 1.2 + (hasPct ? gap * 0.5 + pctSz * 1.2 : 0);
    const topY = y - totalH / 2 + logoR;

    /* circular-clipped logo */
    ctx.save();
    ctx.beginPath(); ctx.arc(x, topY, logoR, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, x - logoR, topY - logoR, logoR * 2, logoR * 2);
    ctx.restore();

    const symY = topY + logoR + gap + symSz * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${symSz}px Inter,system-ui,sans-serif`;
    ctx.fillText(sym, x, symY);

    if (hasPct) {
      const pctY = symY + symSz * 0.65 + gap * 0.5 + pctSz * 0.6;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = `600 ${pctSz}px Inter,system-ui,sans-serif`;
      ctx.fillText(`${b.pct >= 0 ? "+" : ""}${b.pct.toFixed(1)}%`, x, pctY);
    }
  } else {
    /* symbol + % only */
    const symSz = Math.min(r * (hasPct ? 0.38 : 0.46), hasPct ? 18 : 22);
    const pctSz = Math.min(r * 0.25, 12);
    const totalH = symSz * 1.1 + (hasPct ? pctSz * 1.3 : 0);
    const symY  = y - totalH / 2 + symSz * 0.55;

    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${symSz}px Inter,system-ui,sans-serif`;
    ctx.fillText(sym, x, symY);

    if (hasPct) {
      const pctY = symY + symSz * 0.6 + pctSz * 0.7;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = `600 ${pctSz}px Inter,system-ui,sans-serif`;
      ctx.fillText(`${b.pct >= 0 ? "+" : ""}${b.pct.toFixed(1)}%`, x, pctY);
    }
  }

  ctx.restore();
}

/* ─────────────────────────────────────────
   Bubble Map component
───────────────────────────────────────── */
function BubbleMap({
  coins, loading, tf, live, connected,
}: {
  coins: CoinData[];
  loading: boolean;
  tf: Timeframe;
  live: Map<string, LiveTick>;
  connected: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const bubblesRef   = useRef<Bubble[]>([]);
  const hoveredRef   = useRef<number | null>(null);
  const rafRef       = useRef(0);
  const imgsRef      = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const flashRef     = useRef<Map<string, number>>(new Map());
  const prevLiveRef  = useRef<Map<string, LiveTick>>(new Map());
  /* live data kept in a ref so the render loop reads it every frame without re-renders */
  const liveRef      = useRef<Map<string, LiveTick>>(new Map());

  const [dims, setDims]       = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; b: Bubble } | null>(null);

  /* Resize */
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  /* HiDPI */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !dims.w || !dims.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = dims.w * dpr; canvas.height = dims.h * dpr;
    const ctx = canvas.getContext("2d")!; ctx.scale(dpr, dpr);
  }, [dims]);

  /* Recompute bubbles + preload logos — does NOT depend on live ticks */
  useEffect(() => {
    if (!dims.w || !dims.h || coins.length === 0) return;
    bubblesRef.current = computeBubbles(coins, dims.w, dims.h, tf);
    coins.slice(0, 75).forEach((c) => {
      if (c.image && !imgsRef.current.has(c.image))
        loadImg(c.image).then(img => imgsRef.current.set(c.image, img));
    });
  }, [coins, dims, tf]); // ← live intentionally excluded

  /* Keep liveRef current + track flash timestamps — never triggers layout recompute */
  useEffect(() => {
    liveRef.current = live;
    const now = Date.now();
    live.forEach((tick, sym) => {
      const prev = prevLiveRef.current.get(sym);
      if (!prev || prev.updatedAt !== tick.updatedAt) flashRef.current.set(sym, now);
    });
    prevLiveRef.current = new Map(live);
  }, [live]);

  /* Render loop — reads liveRef every frame for colour/text, never recomputes layout */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !dims.w) return;
    const frame = (t: number) => {
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, dims.w, dims.h);
      const now  = Date.now();
      const bs   = bubblesRef.current;
      const live = liveRef.current;
      for (let i = 0; i < bs.length; i++) {
        const b   = bs[i];
        const sym = b.coin.symbol.toUpperCase();
        /* patch pct from live tick each frame so colour/text stay current */
        const tick = live.get(sym);
        if (tick) b.pct = tick.pct24h;
        const flashedAt = flashRef.current.get(sym) ?? 0;
        const flashAge  = flashedAt ? now - flashedAt : 0;
        drawBubble(ctx, b, hoveredRef.current === i, t, imgsRef.current, flashAge);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims]);

  const hitTest = useCallback((mx: number, my: number) => {
    const bs = bubblesRef.current;
    for (let i = 0; i < bs.length; i++)
      if (Math.hypot(mx - bs[i].x, my - bs[i].y) <= bs[i].r + 4) return i;
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

      {/* Live indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-none">
        {connected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-[#00c853] animate-pulse" />
            <span className="text-[10px] text-[#00c853] font-semibold">LIVE</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3 text-[#4b5563]" />
            <span className="text-[10px] text-[#4b5563]">Connecting…</span>
          </>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (() => {
        const price = getLivePrice(tooltip.b.coin, live);
        return (
          <div
            className="absolute z-50 pointer-events-none"
            style={{ left: Math.min(tooltip.x + 14, dims.w - 200), top: Math.max(tooltip.y - 90, 6) }}
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
              <div className="flex items-center gap-1.5">
                <p className="text-white font-mono text-sm font-semibold">{fmtPrice(price)}</p>
                {live.has(tooltip.b.coin.symbol.toUpperCase()) && (
                  <span className="text-[9px] text-[#00c853] font-bold border border-[#00c853]/30 rounded px-1">LIVE</span>
                )}
              </div>
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
        );
      })()}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "#0a0a0add" }}>
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

      {/* Legend */}
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
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[9px] text-[#4b5563] font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Gainers / Losers list
───────────────────────────────────────── */
function MoversList({
  coins, type, tf, live, loading,
}: {
  coins: CoinData[]; type: "gainers" | "losers";
  tf: Timeframe; live: Map<string, LiveTick>; loading: boolean;
}) {
  const isUp = type === "gainers";
  const sorted = useMemo(() =>
    [...coins]
      .sort((a, b) => isUp
        ? getPct(b, tf, live) - getPct(a, tf, live)
        : getPct(a, tf, live) - getPct(b, tf, live))
      .slice(0, 50),
    [coins, tf, live, isUp],
  );

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
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2 border-b border-[#1a1d1a] sticky top-0 bg-[#0a0a0a] z-10">
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">#</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">Coin</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Price</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Change</span>
      </div>
      {sorted.map((coin, idx) => {
        const pct   = getPct(coin, tf, live);
        const price = getLivePrice(coin, live);
        const isLive = live.has(coin.symbol.toUpperCase());
        return (
          <div
            key={coin.id}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-2.5 border-b border-[#1a1d1a]/50 hover:bg-[#13141a] transition-colors"
          >
            <span className="text-[11px] text-[#4b5563] w-5 tabular-nums">{idx + 1}</span>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={coin.image} alt="" className="w-7 h-7 rounded-full shrink-0" loading="lazy" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-[12px] font-bold text-white leading-tight">{coin.symbol.toUpperCase()}</p>
                  {isLive && <span className="w-1.5 h-1.5 rounded-full bg-[#00c853] animate-pulse shrink-0" />}
                </div>
                <p className="text-[10px] text-[#4b5563] truncate leading-tight">{coin.name}</p>
              </div>
            </div>
            <span className="text-[11.5px] text-white font-mono tabular-nums text-right">{fmtPrice(price)}</span>
            <span className={cn("text-[11.5px] font-bold tabular-nums text-right min-w-[56px]",
              pct >= 0 ? "text-[#00c853]" : "text-[#f44336]")}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   New Listed
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
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 px-4 py-2 border-b border-[#1a1d1a] sticky top-0 bg-[#0a0a0a] z-10">
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">#</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">Token</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Listed</span>
      </div>
      {listings.map((l, idx) => {
        const dt = l.activated_at
          ? new Date(l.activated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "Recent";
        return (
          <div key={l.id} className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center px-4 py-3 border-b border-[#1a1d1a]/50 hover:bg-[#13141a] transition-colors">
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
            <span className="text-[10.5px] text-[#4b5563] text-right whitespace-nowrap">{dt}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   Coming Soon
───────────────────────────────────────── */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-[#13141a] border border-[#1a1d1a] flex items-center justify-center text-2xl">📊</div>
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
  { key: "bubble",  label: "Bubble Map",  icon: <span className="text-xs">🫧</span> },
  { key: "gainers", label: "Top Gainers", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: "losers",  label: "Top Losers",  icon: <TrendingDown className="h-3.5 w-3.5" /> },
  { key: "new",     label: "New Listed",  icon: <Zap className="h-3.5 w-3.5" /> },
];

export default function Trading() {
  const [category,  setCategory]  = useState<MainCategory>("crypto");
  const [cryptoTab, setCryptoTab] = useState<CryptoTab>("bubble");
  const [tf, setTf]               = useState<Timeframe>("1D");

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

  /* Build symbol list for Binance WS — derived from CoinGecko data */
  const symbols = useMemo(() => coins.map(c => c.symbol), [coins]);
  const { ticks: live, connected } = useBinanceTicker(symbols);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-xl select-none" style={{ background: "#0a0a0a", color: "#c6c9d5" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center border-b border-[#1a1d1a] shrink-0">
        <div className="flex flex-1 overflow-x-auto scrollbar-hide">
          {MAIN_CATEGORIES.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 border-b-2 shrink-0 font-semibold text-[13px] transition-all",
                category === key ? "border-[#00c853] text-white" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span>{emoji}</span><span>{label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => void refetch()}
          className="p-3 text-[#4b5563] hover:text-white transition-colors border-l border-[#1a1d1a] shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Crypto sub-tabs ── */}
      {category === "crypto" && (
        <div className="flex items-center border-b border-[#1a1d1a] bg-[#0d0e13] shrink-0 overflow-x-auto scrollbar-hide">
          {CRYPTO_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setCryptoTab(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 border-b-2 shrink-0 text-[12px] font-semibold transition-all",
                cryptoTab === key ? "border-[#00c853] text-white bg-[#00c853]/5" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span className={cn(cryptoTab === key ? "text-[#00c853]" : "text-[#4b5563]")}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Timeframe bar ── */}
      {category === "crypto" && cryptoTab !== "new" && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#1a1d1a] bg-[#0a0a0a] shrink-0">
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

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {category === "crypto" && cryptoTab === "bubble" && (
          <BubbleMap coins={coins} loading={ovLoading} tf={tf} live={live} connected={connected} />
        )}
        {category === "crypto" && cryptoTab === "gainers" && (
          <MoversList coins={coins} type="gainers" tf={tf} live={live} loading={ovLoading} />
        )}
        {category === "crypto" && cryptoTab === "losers" && (
          <MoversList coins={coins} type="losers" tf={tf} live={live} loading={ovLoading} />
        )}
        {category === "crypto" && cryptoTab === "new" && (
          <NewListedList listings={listings} loading={ovLoading} />
        )}
        {category === "forex"       && <ComingSoon label="Forex Markets" />}
        {category === "commodities" && <ComingSoon label="Commodities" />}
        {category === "stocks"      && <ComingSoon label="US & Global Stocks" />}
      </div>
    </div>
  );
}
