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

interface NewListing {
  id: string; symbol: string; name: string; activated_at: number;
  image?: string; current_price?: number; market_cap?: number;
  market_cap_rank?: number; price_change_percentage_24h?: number; total_volume?: number;
}
interface OverviewData { coins: CoinData[]; global: GlobalData; newListings: NewListing[]; }
type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y";
type MainCategory = "crypto" | "forex" | "commodities" | "stocks";
type StocksTab    = "watchlist" | "indices";
type CryptoTab = "bubble" | "gainers" | "losers" | "new";
type ForexTab = "pairs" | "news" | "upcoming";
type CommoditiesTab = "pairs" | "news" | "upcoming";

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
          if (isNaN(price) || isNaN(pct24h)) return;
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
   Deriv WebSocket live tick hook (forex + metals)
───────────────────────────────────────── */
/* Deriv symbol → display key (pair name or commodity symbol) */
const DERIV_PAIR_MAP: Record<string, string> = {
  frxEURUSD: "EUR/USD", frxGBPUSD: "GBP/USD", frxUSDJPY: "USD/JPY",
  frxUSDCHF: "USD/CHF", frxAUDUSD: "AUD/USD", frxNZDUSD: "NZD/USD",
  frxUSDCAD: "USD/CAD", frxEURGBP: "EUR/GBP", frxEURJPY: "EUR/JPY",
  frxGBPJPY: "GBP/JPY", frxXAUUSD: "gold",    frxXAGUSD: "silver",
};

function useDerivTicker(derivSymbols: string[]) {
  const [ticks, setTicks]     = useState<Map<string, number>>(new Map());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!derivSymbols.length) return;
    let ws: WebSocket;
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;

    function connect() {
      if (dead) return;
      ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
      wsRef.current = ws;
      ws.onopen = () => {
        if (dead) return;
        setConnected(true);
        derivSymbols.forEach(sym =>
          ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }))
        );
      };
      ws.onmessage = (ev) => {
        if (dead) return;
        try {
          const msg = JSON.parse(ev.data as string) as {
            tick?: { symbol: string; ask?: number; bid?: number; quote?: number };
          };
          const t = msg.tick;
          if (!t) return;
          const price = t.ask && t.bid ? (t.ask + t.bid) / 2 : (t.quote ?? null);
          if (price) {
            const key = DERIV_PAIR_MAP[t.symbol];
            if (key) setTicks(prev => new Map(prev).set(key, price));
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) { setConnected(false); timer = setTimeout(connect, 4000); } };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => { dead = true; clearTimeout(timer); wsRef.current?.close(); setConnected(false); };
  }, [derivSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* Derive K so Σ π·(K·w_i)² ≈ 0.90·W·H  →  K = sqrt(0.90·W·H / (π·Σw_i²)) */
  const sumWSq = weights.reduce((a, w) => a + w * w, 0);
  const K = Math.sqrt((W * H * 0.90) / (Math.PI * sumWSq));
  const minR = 11, maxR = Math.min(W, H) * 0.22;

  /* Build raw bubbles, sorted largest-first for grid placement */
  const raw = list.map((coin, i) => ({
    origIdx: i, coin,
    pct: getPct(coin, tf, new Map()),
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
  /* Sanitise pct — guard against NaN from stale/missing data */
  if (!isFinite(b.pct)) b.pct = 0;

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
        if (tick && !isNaN(tick.pct24h)) b.pct = tick.pct24h;
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
                {tooltip.b.pct >= 0 ? "▲" : "▼"} {isFinite(tooltip.b.pct) ? Math.abs(tooltip.b.pct).toFixed(2) : "0.00"}%
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
      {/* header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2 border-b border-[#1a1d1a] sticky top-0 bg-[#0a0a0a] z-10">
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase w-5">#</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase">Token</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right">Price</span>
        <span className="text-[10px] text-[#4b5563] font-semibold uppercase text-right w-16">24h</span>
      </div>

      {listings.map((l, idx) => {
        const pct   = l.price_change_percentage_24h;
        const hasP  = typeof pct === "number" && isFinite(pct);
        const up    = hasP && pct! >= 0;
        const dt    = l.activated_at
          ? new Date(l.activated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Recent";

        return (
          <div key={l.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-3 border-b border-[#1a1d1a]/50 hover:bg-[#111] transition-colors">
            {/* rank */}
            <span className="text-[11px] text-[#4b5563] w-5 tabular-nums">{idx + 1}</span>

            {/* logo + name */}
            <div className="flex items-center gap-2.5 min-w-0">
              {l.image
                ? <img src={l.image} alt={l.symbol} className="w-7 h-7 rounded-full shrink-0 bg-[#1a1d1a]" />
                : (
                  <div className="w-7 h-7 rounded-full bg-[#f0b90b]/15 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-[#f0b90b]">{l.symbol.slice(0, 3).toUpperCase()}</span>
                  </div>
                )}
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-white leading-tight truncate">{l.name}</p>
                <p className="text-[10px] text-[#4b5563]">{l.symbol.toUpperCase()} · {dt}</p>
              </div>
            </div>

            {/* price */}
            <div className="text-right">
              {typeof l.current_price === "number"
                ? <p className="text-[12px] font-semibold text-white tabular-nums">{fmtPrice(l.current_price)}</p>
                : <p className="text-[11px] text-[#4b5563]">—</p>}
              {l.market_cap ? <p className="text-[9.5px] text-[#4b5563] tabular-nums">{fmtLarge(l.market_cap)}</p> : null}
            </div>

            {/* 24h change */}
            <div className="w-16 text-right">
              {hasP
                ? (
                  <span className={cn(
                    "text-[11.5px] font-bold tabular-nums px-1.5 py-0.5 rounded",
                    up ? "text-[#00c853] bg-[#00c853]/10" : "text-[#f44336] bg-[#f44336]/10",
                  )}>
                    {up ? "+" : ""}{pct!.toFixed(2)}%
                  </span>
                )
                : <span className="text-[11px] text-[#4b5563]">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   Forex Pairs Panel
───────────────────────────────────────── */
interface ForexPairRow { pair: string; flags: string; price: number | null; change: number | null; }

function fmtFxPrice(n: number): string {
  if (n >= 100) return n.toFixed(3);
  return n.toFixed(5);
}

const FOREX_DERIV_SYMS = [
  "frxEURUSD","frxGBPUSD","frxUSDJPY","frxUSDCHF",
  "frxAUDUSD","frxNZDUSD","frxUSDCAD","frxEURGBP","frxEURJPY","frxGBPJPY",
];

function ForexPairsPanel() {
  const { data, isLoading, error } = useQuery<ForexPairRow[]>({
    queryKey: ["forex-pairs"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/forex-pairs", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const { ticks: liveTicks, connected } = useDerivTicker(FOREX_DERIV_SYMS);

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );
  if (error || !data?.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">Rates unavailable</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Live status bar */}
      <div className="flex items-center justify-end gap-1.5 px-4 py-1.5 border-b border-[#1a1d1a] shrink-0">
        <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-[#00c853] animate-pulse" : "bg-[#4b5563]")} />
        <span className="text-[10px] text-[#4b5563]">{connected ? "Live" : "Connecting…"}</span>
      </div>
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563] border-b border-[#1a1d1a]">
            <th className="text-left px-4 py-2.5">Pair</th>
            <th className="text-right px-4 py-2.5">Rate</th>
            <th className="text-right px-4 py-2.5">24h Change</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const livePrice = liveTicks.get(row.pair) ?? null;
            const displayPrice = livePrice ?? row.price;
            const up = (row.change ?? 0) >= 0;
            return (
              <tr key={row.pair} className="border-b border-[#1a1d1a]/60 hover:bg-[#ffffff05] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">{row.flags}</span>
                    <span className="text-white font-bold tracking-wide">{row.pair}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-white font-semibold tabular-nums">
                  {displayPrice !== null ? fmtFxPrice(displayPrice) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.change !== null ? (
                    <span className={cn(
                      "inline-flex items-center gap-0.5 font-bold",
                      up ? "text-[#00c853]" : "text-[#f44336]",
                    )}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? "+" : ""}{row.change.toFixed(4)}%
                    </span>
                  ) : <span className="text-[#4b5563]">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] text-[#4b5563] text-center mt-auto">
        Live prices via Deriv · 24h change from ECB close
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Commodities Pairs Panel
───────────────────────────────────────── */
interface CommodityRow {
  symbol: string; name: string; unit: string; emoji: string;
  price: number | null; change: number | null; prevClose: number | null;
}

function fmtCommodityPrice(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 10)   return "$" + n.toFixed(3);
  return "$" + n.toFixed(4);
}

const COMMODITY_DERIV_SYMS = ["frxXAUUSD", "frxXAGUSD"];

function CommoditiesPairsPanel() {
  const { data, isLoading, error } = useQuery<CommodityRow[]>({
    queryKey: ["commodities-pairs"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/commodities-pairs", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { ticks: liveTicks, connected } = useDerivTicker(COMMODITY_DERIV_SYMS);

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );
  if (error || !data?.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">Prices unavailable</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Live status bar */}
      <div className="flex items-center justify-end gap-1.5 px-4 py-1.5 border-b border-[#1a1d1a] shrink-0">
        <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-[#00c853] animate-pulse" : "bg-[#4b5563]")} />
        <span className="text-[10px] text-[#4b5563]">{connected ? "Live (Gold · Silver)" : "Connecting…"}</span>
      </div>
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563] border-b border-[#1a1d1a]">
            <th className="text-left px-4 py-2.5">Commodity</th>
            <th className="text-right px-4 py-2.5">Price</th>
            <th className="text-right px-4 py-2.5">24h Change</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const livePrice =
              row.symbol === "gold"   ? (liveTicks.get("gold")   ?? null) :
              row.symbol === "silver" ? (liveTicks.get("silver") ?? null) : null;
            const displayPrice = livePrice ?? row.price;
            const up = (row.change ?? 0) >= 0;
            return (
              <tr key={row.symbol} className="border-b border-[#1a1d1a]/60 hover:bg-[#ffffff05] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl leading-none">{row.emoji}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-white font-bold">{row.name}</p>
                        {livePrice && (
                          <span className="w-1 h-1 rounded-full bg-[#00c853]" title="Live price" />
                        )}
                      </div>
                      <p className="text-[#4b5563] text-[11px]">per {row.unit}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-white font-semibold tabular-nums">
                  {displayPrice !== null ? fmtCommodityPrice(displayPrice) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.change !== null ? (
                    <span className={cn(
                      "inline-flex items-center gap-0.5 font-bold",
                      up ? "text-[#00c853]" : "text-[#f44336]",
                    )}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? "+" : ""}{row.change.toFixed(2)}%
                    </span>
                  ) : <span className="text-[#4b5563]">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] text-[#4b5563] text-center mt-auto">
        Gold & Silver live via Deriv · Other commodities via Yahoo Finance
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   News Panel (shared for Forex + Commodities)
───────────────────────────────────────── */
interface NewsItem { title: string; link: string; description: string; pubDate: string; publisher?: string; }
interface CalendarEvent {
  id: string; title: string; country: string; date: string;
  time: string; impact: string; forecast: string; previous: string; actual: string;
}

const IMPACT_CFG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  High:   { label: "High",     dot: "bg-[#ef4444]", text: "text-[#ef4444]", bg: "bg-[#ef4444]/10", border: "border-[#ef4444]/30" },
  Medium: { label: "Moderate", dot: "bg-[#f59e0b]", text: "text-[#f59e0b]", bg: "bg-[#f59e0b]/10", border: "border-[#f59e0b]/30" },
  Low:    { label: "Low",      dot: "bg-[#22c55e]", text: "text-[#22c55e]", bg: "bg-[#22c55e]/10", border: "border-[#22c55e]/30" },
};

const COUNTRY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
  CNY: "🇨🇳", KRW: "🇰🇷", SGD: "🇸🇬", INR: "🇮🇳",
  NOK: "🇳🇴", SEK: "🇸🇪", MXN: "🇲🇽", TRY: "🇹🇷",
};

function fmtCalDate(d: string): string {
  const [mo, dy, yr] = d.split("-").map(Number);
  const dt = new Date(yr, mo - 1, dy);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (dt.getTime() === now.getTime()) return "Today";
  if (dt.getTime() === tom.getTime()) return "Tomorrow";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/* Parse ForexFactory date "MM-DD-YYYY" + time "8:30am" → UTC Date (FF times are US Eastern = UTC-4 EDT / UTC-5 EST) */
function parseFFDateTime(date: string, time: string): Date {
  const [mo, dy, yr] = date.split("-").map(Number);
  const mm = String(mo).padStart(2, "0");
  const dd = String(dy).padStart(2, "0");
  const m = /^(\d+):(\d+)(am|pm)$/i.exec(time ?? "");
  if (!m) return new Date(`${yr}-${mm}-${dd}T23:59:00-04:00`);
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3].toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return new Date(`${yr}-${mm}-${dd}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-04:00`);
}

/* ── Malaysia Time (MYT = UTC+8) helpers ── */
const MYT = "Asia/Kuala_Lumpur";

/** Format a UTC Date as a MYT time string, e.g. "8:30 PM" */
function toMYTTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { timeZone: MYT, hour: "numeric", minute: "2-digit", hour12: true });
}

/** YYYY-MM-DD key for the date in MYT (for grouping) */
function toMYTDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: MYT });
}

/** Human label for a MYT date key: "Today", "Tomorrow", or "Mon, Jul 7" */
function mytKeyToLabel(key: string): string {
  const today    = new Date().toLocaleDateString("en-CA", { timeZone: MYT });
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: MYT });
  if (key === today)    return "Today";
  if (key === tomorrow) return "Tomorrow";
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NewsPanel({ type }: { type: "forex" | "commodities" }) {
  const [selected, setSelected] = useState<NewsItem | null>(null);

  const { data, isLoading, error } = useQuery<NewsItem[]>({
    queryKey: ["market-news", type],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/market/news?type=${type}`, { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );
  if (error || !data?.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">News unavailable</p>
    </div>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto divide-y divide-[#1a1d1a]">
        {data.map((item, i) => (
          <button
            key={i}
            onClick={() => setSelected(item)}
            className="w-full flex flex-col gap-1 px-4 py-3.5 hover:bg-[#ffffff06] transition-colors group text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-white text-[13px] font-semibold leading-snug group-hover:text-[#00c853] transition-colors line-clamp-2">
                {item.title}
              </p>
              {item.pubDate && (
                <span className="text-[10px] text-[#4b5563] shrink-0 mt-0.5">{timeAgo(item.pubDate)}</span>
              )}
            </div>
            {item.description && (
              <p className="text-[#4b5563] text-[12px] leading-relaxed line-clamp-2">{item.description}</p>
            )}
            <span className="text-[10px] text-[#00c853]/60 font-medium uppercase tracking-wider mt-0.5">
              {item.publisher ?? "Yahoo Finance"}
            </span>
          </button>
        ))}
      </div>

      {/* News article modal */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          onClick={() => setSelected(null)}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg mx-0 sm:mx-4 bg-[#0d0e13] rounded-t-2xl sm:rounded-2xl border border-[#1a1d1a] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1d1a]">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#4b5563]">Market News</span>
              <button onClick={() => setSelected(null)} className="text-[#4b5563] hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 flex flex-col gap-4">
              <p className="text-white text-[15px] font-semibold leading-snug">{selected.title}</p>

              <div className="flex items-center gap-3 text-[12px]">
                <span className="text-[#00c853]/80 font-semibold uppercase tracking-wider">
                  {selected.publisher ?? "Yahoo Finance"}
                </span>
                {selected.pubDate && (
                  <span className="text-[#4b5563]">{timeAgo(selected.pubDate)}</span>
                )}
              </div>

              {selected.description && (
                <p className="text-[#9ca3af] text-[13px] leading-relaxed">{selected.description}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <a
                href={selected.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#00c853]/10 border border-[#00c853]/25 text-[#00c853] text-[13px] font-semibold hover:bg-[#00c853]/20 transition-colors"
              >
                Read Full Article →
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────
   Economic Calendar Panel
───────────────────────────────────────── */
function EconomicCalendarPanel() {
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const { data, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["econ-calendar"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/economic-calendar", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );
  if (error || !data?.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">Calendar unavailable</p>
    </div>
  );

  /* Upcoming events within next 7 days (compared in UTC, displayed in MYT) */
  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 86_400_000);
  const upcoming = (data ?? []).filter(ev => {
    const t = parseFFDateTime(ev.date, ev.time);
    return t >= now && t <= oneWeekLater;
  });

  /* Group by MYT date key (YYYY-MM-DD in UTC+8), sorted ascending */
  const grouped: [string, CalendarEvent[]][] = Object.entries(
    upcoming.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
      const key = toMYTDateKey(parseFFDateTime(ev.date, ev.time));
      (acc[key] ??= []).push(ev);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {grouped.map(([date, events]) => (
          <div key={date}>
            {/* Date header */}
            <div className="sticky top-0 z-10 px-4 py-2 bg-[#0a0a0a] border-b border-[#1a1d1a]">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#4b5563]">
                {mytKeyToLabel(date)}
              </span>
            </div>

            {/* Events for this day */}
            {events.map(ev => {
              const cfg = IMPACT_CFG[ev.impact] ?? IMPACT_CFG.Low;
              const flag = COUNTRY_FLAGS[ev.country] ?? "🌐";
              const evDate = parseFFDateTime(ev.date, ev.time);
              return (
                <button
                  key={ev.id}
                  onClick={() => setSelected(ev)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#1a1d1a] hover:bg-[#ffffff05] transition-colors text-left group"
                >
                  {/* Impact stripe */}
                  <div className={cn("w-1 self-stretch rounded-full shrink-0", cfg.dot)} />

                  {/* Time in MYT */}
                  <span className="text-[11px] text-[#4b5563] w-[60px] shrink-0 font-mono">
                    {ev.time ? toMYTTime(evDate) : "—"}
                  </span>

                  {/* Currency */}
                  <span className="text-[12px] w-[42px] shrink-0 font-semibold text-[#9ca3af]">
                    {flag} {ev.country}
                  </span>

                  {/* Title */}
                  <span className="flex-1 text-[12px] text-white group-hover:text-[#00c853] transition-colors leading-snug line-clamp-1">
                    {ev.title}
                  </span>

                  {/* Impact badge */}
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0", cfg.text, cfg.bg, cfg.border)}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        {/* Source note */}
        <div className="px-4 py-3 text-[10px] text-[#4b5563] text-center">
          Times in MYT (UTC+8) · Source: ForexFactory
        </div>
      </div>

      {/* Event detail modal */}
      {selected && (() => {
        const cfg = IMPACT_CFG[selected.impact] ?? IMPACT_CFG.Low;
        const flag = COUNTRY_FLAGS[selected.country] ?? "🌐";
        return (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
            onClick={() => setSelected(null)}
          >
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
            <div
              className="relative z-10 w-full max-w-md mx-0 sm:mx-4 bg-[#0d0e13] rounded-t-2xl sm:rounded-2xl border border-[#1a1d1a] shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header bar */}
              <div className={cn("h-1 w-full", cfg.dot)} />
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1d1a]">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full border", cfg.text, cfg.bg, cfg.border)}>
                    ● {cfg.label} Impact
                  </span>
                </div>
                <button onClick={() => setSelected(null)} className="text-[#4b5563] hover:text-white transition-colors text-lg leading-none">✕</button>
              </div>

              {/* Body */}
              <div className="px-5 py-5 flex flex-col gap-4">
                <div>
                  <p className="text-white text-[16px] font-bold leading-snug">{selected.title}</p>
                  <p className="text-[#4b5563] text-[13px] mt-1">
                    {flag} {selected.country} · {mytKeyToLabel(toMYTDateKey(parseFFDateTime(selected.date, selected.time)))} · {selected.time ? toMYTTime(parseFFDateTime(selected.date, selected.time)) : "All Day"} MYT
                  </p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Forecast", value: selected.forecast, emptyLabel: "N/A"      },
                    { label: "Previous", value: selected.previous, emptyLabel: "N/A"      },
                    { label: "Actual",   value: selected.actual,   emptyLabel: "Upcoming" },
                  ].map(({ label, value, emptyLabel }) => {
                    const display = value || emptyLabel;
                    return (
                      <div key={label} className="bg-[#13141a] rounded-xl border border-[#1a1d1a] px-3 py-3 text-center">
                        <p className="text-[10px] text-[#4b5563] uppercase tracking-wider mb-1">{label}</p>
                        <p className={cn("text-[14px] font-bold", value ? "text-white" : "text-[#4b5563]")}>{display}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

/* ─────────────────────────────────────────
   Calendar News Panel — ended/released events
───────────────────────────────────────── */
function CalendarNewsPanel() {
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const { data, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["econ-calendar"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/economic-calendar", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );

  /* Past DATA events only — skip speech/commentary events that have no numeric data */
  const now = new Date();
  const past = (data ?? [])
    .filter(ev => {
      if (parseFFDateTime(ev.date, ev.time) >= now) return false;
      // Keep only events with at least forecast or previous (data releases, not speeches)
      return ev.forecast || ev.previous || ev.actual;
    })
    .sort((a, b) => parseFFDateTime(b.date, b.time).getTime() - parseFFDateTime(a.date, a.time).getTime());

  if (error || !past.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">No released data events yet this week</p>
    </div>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto divide-y divide-[#1a1d1a]">
        {past.map(ev => {
          const cfg = IMPACT_CFG[ev.impact] ?? IMPACT_CFG.Low;
          const flag = COUNTRY_FLAGS[ev.country] ?? "🌐";
          return (
            <button
              key={ev.id}
              onClick={() => setSelected(ev)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff05] transition-colors text-left group"
            >
              {/* Impact stripe */}
              <div className={cn("w-1 self-stretch rounded-full shrink-0", cfg.dot)} />

              {/* Currency */}
              <span className="text-[12px] w-[44px] shrink-0 font-semibold text-[#9ca3af]">{flag} {ev.country}</span>

              {/* Title */}
              <span className="flex-1 text-[12px] text-white group-hover:text-[#00c853] transition-colors leading-snug line-clamp-1">{ev.title}</span>

              {/* Right side: impact badge + time in MYT */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cfg.text, cfg.bg, cfg.border)}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-[#4b5563]">
                  {mytKeyToLabel(toMYTDateKey(parseFFDateTime(ev.date, ev.time)))} {ev.time ? toMYTTime(parseFFDateTime(ev.date, ev.time)) : ""}
                </span>
              </div>
            </button>
          );
        })}
        <div className="px-4 py-3 text-[10px] text-[#4b5563] text-center">
          Released events · Times in MYT (UTC+8) · Source: ForexFactory
        </div>
      </div>

      {/* Event detail modal */}
      {selected && (() => {
        const cfg = IMPACT_CFG[selected.impact] ?? IMPACT_CFG.Low;
        const flag = COUNTRY_FLAGS[selected.country] ?? "🌐";
        return (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" onClick={() => setSelected(null)}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
            <div
              className="relative z-10 w-full max-w-md mx-0 sm:mx-4 bg-[#0d0e13] rounded-t-2xl sm:rounded-2xl border border-[#1a1d1a] shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className={cn("h-1 w-full", cfg.dot)} />
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1d1a]">
                <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full border", cfg.text, cfg.bg, cfg.border)}>
                  ● {cfg.label} Impact · Released
                </span>
                <button onClick={() => setSelected(null)} className="text-[#4b5563] hover:text-white transition-colors text-lg leading-none">✕</button>
              </div>
              <div className="px-5 py-5 flex flex-col gap-4">
                <div>
                  <p className="text-white text-[16px] font-bold leading-snug">{selected.title}</p>
                  <p className="text-[#4b5563] text-[13px] mt-1">{flag} {selected.country} · {mytKeyToLabel(toMYTDateKey(parseFFDateTime(selected.date, selected.time)))} · {selected.time ? toMYTTime(parseFFDateTime(selected.date, selected.time)) : "All Day"} MYT</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Forecast", value: selected.forecast, pending: false },
                    { label: "Previous", value: selected.previous, pending: false },
                    { label: "Actual",   value: selected.actual,   pending: true  },
                  ].map(({ label, value, pending }) => {
                    const isEmpty = !value;
                    const display = isEmpty ? (pending ? "Pending" : "N/A") : value;
                    return (
                      <div key={label} className="bg-[#13141a] rounded-xl border border-[#1a1d1a] px-3 py-3 text-center">
                        <p className="text-[10px] text-[#4b5563] uppercase tracking-wider mb-1">{label}</p>
                        <p className={cn(
                          "text-[14px] font-bold",
                          !isEmpty ? "text-white" : pending ? "text-[#f59e0b]" : "text-[#4b5563]"
                        )}>{display}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[#4b5563] text-center -mt-1">
                  Source: TradingView · Actuals update within 15 min of release
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

/* ─────────────────────────────────────────
   Stocks — Watchlist Panel
───────────────────────────────────────── */
interface StockRow {
  symbol: string; shortName: string; sector: string;
  regularMarketPrice: number; regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number; regularMarketDayHigh: number; regularMarketDayLow: number;
  fiftyTwoWeekHigh: number; fiftyTwoWeekLow: number;
}

const SECTOR_COLORS: Record<string, string> = {
  Tech:      "text-[#60a5fa] bg-[#60a5fa]/10 border-[#60a5fa]/20",
  Finance:   "text-[#34d399] bg-[#34d399]/10 border-[#34d399]/20",
  Health:    "text-[#f472b6] bg-[#f472b6]/10 border-[#f472b6]/20",
  Energy:    "text-[#fb923c] bg-[#fb923c]/10 border-[#fb923c]/20",
  Retail:    "text-[#a78bfa] bg-[#a78bfa]/10 border-[#a78bfa]/20",
  Auto:      "text-[#2dd4bf] bg-[#2dd4bf]/10 border-[#2dd4bf]/20",
  Transport: "text-[#818cf8] bg-[#818cf8]/10 border-[#818cf8]/20",
  Other:     "text-[#9ca3af] bg-[#9ca3af]/10 border-[#9ca3af]/20",
};

function fmtVol(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + "K";
  return String(n);
}
function fmtStockPrice(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ALL_SECTORS = ["All", "Tech", "Finance", "Health", "Energy", "Retail", "Auto", "Transport"];

function StocksWatchlistPanel() {
  const [sector, setSector] = useState("All");

  const { data, isLoading, error } = useQuery<StockRow[]>({
    queryKey: ["stocks"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/stocks", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );
  if (error || !data?.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">Stock data unavailable</p>
    </div>
  );

  const filtered = sector === "All" ? data : data.filter(s => s.sector === sector);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sector filter chips */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1a1d1a] overflow-x-auto scrollbar-hide shrink-0">
        {ALL_SECTORS.filter(s => s === "All" || data.some(r => r.sector === s)).map(s => (
          <button
            key={s}
            onClick={() => setSector(s)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 border transition-all",
              sector === s
                ? "bg-[#00c853]/15 text-[#00c853] border-[#00c853]/40"
                : "text-[#4b5563] border-[#1a1d1a] hover:text-[#9ca3af] bg-transparent",
            )}
          >{s}</button>
        ))}
      </div>

      {/* Stock table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563] border-b border-[#1a1d1a] sticky top-0 bg-[#0a0a0a]">
              <th className="text-left px-4 py-2.5">Stock</th>
              <th className="text-right px-4 py-2.5">Price</th>
              <th className="text-right px-4 py-2.5">Change</th>
              <th className="text-right px-3 py-2.5 hidden sm:table-cell">Volume</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const up  = row.regularMarketChangePercent >= 0;
              const sc  = SECTOR_COLORS[row.sector] ?? SECTOR_COLORS.Other;
              const rangePct = row.fiftyTwoWeekHigh > row.fiftyTwoWeekLow
                ? ((row.regularMarketPrice - row.fiftyTwoWeekLow) / (row.fiftyTwoWeekHigh - row.fiftyTwoWeekLow)) * 100
                : 50;
              return (
                <tr key={row.symbol} className="border-b border-[#1a1d1a]/60 hover:bg-[#ffffff05] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#13141a] border border-[#1a1d1a] flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-white leading-none">{row.symbol.slice(0, 2)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white font-bold text-[13px]">{row.symbol}</span>
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", sc)}>{row.sector}</span>
                        </div>
                        <p className="text-[#4b5563] text-[11px] truncate">{row.shortName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-white font-bold font-mono tabular-nums text-[13px]">{fmtStockPrice(row.regularMarketPrice)}</p>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <div className="h-1 w-16 bg-[#1a1d1a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#00c853]/40 rounded-full" style={{ width: `${Math.min(100, Math.max(0, rangePct))}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("inline-flex items-center gap-0.5 font-bold text-[12px]", up ? "text-[#00c853]" : "text-[#f44336]")}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? "+" : ""}{row.regularMarketChangePercent.toFixed(2)}%
                    </span>
                    <p className={cn("text-[10px] mt-0.5", up ? "text-[#00c853]/70" : "text-[#f44336]/70")}>
                      {up ? "+" : ""}{fmtStockPrice(Math.abs(row.regularMarketChange))}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right hidden sm:table-cell">
                    <p className="text-[#9ca3af] text-[11px] font-mono">{fmtVol(row.regularMarketVolume)}</p>
                    <p className="text-[#4b5563] text-[10px]">Vol</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-4 py-2 text-[10px] text-[#4b5563] text-center">
          US equities · Refreshes every 5 min · Source: Yahoo Finance
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Stocks — Indices Panel
───────────────────────────────────────── */
interface IndexRow {
  symbol: string; name: string; short: string; emoji: string;
  price: number; change: number; changePct: number;
  dayHigh: number; dayLow: number;
}

function fmtIndexPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1_000)  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return n.toFixed(2);
}

function StocksIndicesPanel() {
  const { data, isLoading, error } = useQuery<IndexRow[]>({
    queryKey: ["indices"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/market/indices", { signal });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
    </div>
  );
  if (error || !data?.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#4b5563]">
      <AlertCircle className="h-5 w-5" />
      <p className="text-sm">Index data unavailable</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
      {data.map((row) => {
        const up = row.changePct >= 0;
        const rangePct = row.dayHigh > row.dayLow
          ? ((row.price - row.dayLow) / (row.dayHigh - row.dayLow)) * 100
          : 50;
        return (
          <div key={row.symbol} className="bg-[#0d0e13] rounded-xl border border-[#1a1d1a] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{row.emoji}</span>
                <div>
                  <p className="text-white font-bold text-[15px]">{row.name}</p>
                  <p className="text-[#4b5563] text-[11px]">{row.short}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-bold font-mono text-[18px] tabular-nums">{fmtIndexPrice(row.price)}</p>
                <span className={cn("inline-flex items-center gap-1 font-bold text-[13px]", up ? "text-[#00c853]" : "text-[#f44336]")}>
                  {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {up ? "+" : ""}{row.changePct.toFixed(2)}%
                  <span className="text-[11px] font-normal ml-0.5">({up ? "+" : ""}{fmtIndexPrice(Math.abs(row.change))})</span>
                </span>
              </div>
            </div>

            {/* Day range bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-[#4b5563] mb-1">
                <span>L {fmtIndexPrice(row.dayLow)}</span>
                <span>Day Range</span>
                <span>H {fmtIndexPrice(row.dayHigh)}</span>
              </div>
              <div className="h-1.5 bg-[#1a1d1a] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", up ? "bg-[#00c853]/50" : "bg-[#f44336]/50")}
                  style={{ width: `${Math.min(100, Math.max(2, rangePct))}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="px-4 py-2 text-[10px] text-[#4b5563] text-center">
        US market indices · Refreshes every 5 min · Source: Yahoo Finance
      </div>
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
  const [category,       setCategory]       = useState<MainCategory>("crypto");
  const [cryptoTab,      setCryptoTab]      = useState<CryptoTab>("bubble");
  const [forexTab,       setForexTab]       = useState<ForexTab>("pairs");
  const [commoditiesTab, setCommoditiesTab] = useState<CommoditiesTab>("pairs");
  const [stocksTab,      setStocksTab]      = useState<StocksTab>("watchlist");
  const [tf, setTf]                         = useState<Timeframe>("1D");

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

      {/* ── Forex sub-tabs ── */}
      {category === "forex" && (
        <div className="flex items-center border-b border-[#1a1d1a] bg-[#0d0e13] shrink-0 overflow-x-auto scrollbar-hide">
          {([
            { key: "pairs"    as const, label: "Pairs",    icon: "📊" },
            { key: "news"     as const, label: "News",     icon: "📰" },
            { key: "upcoming" as const, label: "Upcoming", icon: "🗓️" },
          ] satisfies { key: ForexTab; label: string; icon: string }[]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setForexTab(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 border-b-2 shrink-0 text-[12px] font-semibold transition-all",
                forexTab === key ? "border-[#00c853] text-white bg-[#00c853]/5" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Stocks sub-tabs ── */}
      {category === "stocks" && (
        <div className="flex items-center border-b border-[#1a1d1a] bg-[#0d0e13] shrink-0 overflow-x-auto scrollbar-hide">
          {([
            { key: "watchlist" as const, label: "Watchlist", icon: "📈" },
            { key: "indices"   as const, label: "Indices",   icon: "📊" },
          ] satisfies { key: StocksTab; label: string; icon: string }[]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setStocksTab(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 border-b-2 shrink-0 text-[12px] font-semibold transition-all",
                stocksTab === key ? "border-[#00c853] text-white bg-[#00c853]/5" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Commodities sub-tabs ── */}
      {category === "commodities" && (
        <div className="flex items-center border-b border-[#1a1d1a] bg-[#0d0e13] shrink-0 overflow-x-auto scrollbar-hide">
          {([
            { key: "pairs"    as const, label: "Pairs",    icon: "📊" },
            { key: "news"     as const, label: "News",     icon: "📰" },
            { key: "upcoming" as const, label: "Upcoming", icon: "🗓️" },
          ] satisfies { key: CommoditiesTab; label: string; icon: string }[]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setCommoditiesTab(key)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 border-b-2 shrink-0 text-[12px] font-semibold transition-all",
                commoditiesTab === key ? "border-[#00c853] text-white bg-[#00c853]/5" : "border-transparent text-[#4b5563] hover:text-[#9ca3af]",
              )}
            >
              <span>{icon}</span>{label}
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
        {category === "forex" && forexTab === "pairs"    && <ForexPairsPanel />}
        {category === "forex" && forexTab === "news"     && <CalendarNewsPanel />}
        {category === "forex" && forexTab === "upcoming" && <EconomicCalendarPanel />}
        {category === "commodities" && commoditiesTab === "pairs"    && <CommoditiesPairsPanel />}
        {category === "commodities" && commoditiesTab === "news"     && <CalendarNewsPanel />}
        {category === "commodities" && commoditiesTab === "upcoming" && <EconomicCalendarPanel />}
        {category === "stocks" && stocksTab === "watchlist" && <StocksWatchlistPanel />}
        {category === "stocks" && stocksTab === "indices"   && <StocksIndicesPanel />}
      </div>
    </div>
  );
}
