import { useRef, useEffect, useCallback } from "react";

export type Candle = { time: number; open: number; high: number; low: number; close: number };

interface Props {
  candles:           Candle[];
  symbol:            string;
  timeframe:         string;
  onCrosshairMove?:  (candle: Candle | null) => void;
}

/* ── Layout ─────────────────────────────────────────── */
const PAD = { top: 12, right: 76, bottom: 28, left: 0 };
const VOL_RATIO = 0.18; // volume section = 18 % of chart height

/* ── Colors (always dark) ───────────────────────────── */
const BG       = "#131722";
const GRID     = "rgba(255,255,255,0.05)";
const AXIS_TXT = "#787b86";
const AXIS_LN  = "rgba(255,255,255,0.08)";
const UP       = "#26a69a";
const DN       = "#ef5350";
const UP_VOL   = "rgba(38,166,154,0.4)";
const DN_VOL   = "rgba(239,83,80,0.4)";
const PRICE_LN = "rgba(38,166,154,0.6)";     // current price dotted line
const CROSS    = "rgba(149,152,161,0.55)";
const LABEL_BG = "#2962ff";

/* ── Price formatting ───────────────────────────────── */
function fmtPrice(v: number, sym: string): string {
  if (sym === "USD/JPY") return v.toFixed(3);
  if (["EUR/USD", "GBP/USD", "AUD/USD"].includes(sym)) return v.toFixed(5);
  if (v >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtAxisDate(epoch: number, tf: string): string {
  const d = new Date(epoch * 1000);
  if (tf === "1m" || tf === "5m" || tf === "15m")
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (tf === "1h" || tf === "4h")
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface State {
  visibleCount:     number;
  rightOffset:      number;
  mouseX:           number;
  mouseY:           number;
  isDragging:       boolean;
  dragStartX:       number;
  dragStartOffset:  number;
}

export function CandlestickChart({ candles, symbol, timeframe, onCrosshairMove }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const onCrosshairRef = useRef(onCrosshairMove);
  onCrosshairRef.current = onCrosshairMove;

  const stateRef = useRef<State>({
    visibleCount:    120,
    rightOffset:     0,
    mouseX:          -1,
    mouseY:          -1,
    isDragging:      false,
    dragStartX:      0,
    dragStartOffset: 0,
  });

  /* ── Main draw ─────────────────────────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.clientWidth;
    const H   = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const s     = stateRef.current;
    const chartW = W - PAD.left - PAD.right;

    const total         = candles.length;
    const visibleCount  = Math.max(10, Math.min(s.visibleCount, total));
    const rightOffset   = Math.max(0, Math.min(s.rightOffset, Math.max(0, total - visibleCount)));
    const startIdx      = Math.max(0, total - visibleCount - rightOffset);
    const endIdx        = Math.max(1, total - rightOffset);
    const visible       = candles.slice(startIdx, endIdx);
    if (!visible.length) return;

    const candleW = chartW / visible.length;
    const bodyW   = Math.max(1, candleW * 0.62);
    const wickW   = Math.max(1, Math.min(2, candleW * 0.1));

    /* chart area split */
    const fullH     = H - PAD.top - PAD.bottom;
    const volH      = fullH * VOL_RATIO;
    const priceH    = fullH - volH - 4; // 4px gap
    const priceTop  = PAD.top;
    const volTop    = PAD.top + priceH + 4;

    /* price range */
    let lo = Infinity, hi = -Infinity;
    for (const c of visible) {
      if (c.low < lo)  lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const rawRange = hi - lo || 1;
    const pad      = rawRange * 0.05;
    lo -= pad; hi += pad;
    const pRange = hi - lo;

    /* proxy volume (body size as ratio of price range) */
    const volMax = Math.max(...visible.map((c) => Math.abs(c.close - c.open)));

    const py = (p: number) => priceTop + ((hi - p) / pRange) * priceH;
    const cx = (i: number) => PAD.left + (i + 0.5) * candleW;
    const vy = (v: number) => volMax > 0 ? (volTop + volH) - (v / volMax) * volH : volTop + volH;

    /* ── background ── */
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    /* ── horizontal grid ── */
    ctx.strokeStyle = GRID;
    ctx.lineWidth   = 1;
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const p = lo + (pRange * i) / steps;
      const y = py(p);
      if (y < priceTop || y > priceTop + priceH) continue;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    }

    /* ── current price dotted line ── */
    const lastPrice = visible.at(-1)!.close;
    const lastY     = py(lastPrice);
    if (lastY >= priceTop && lastY <= priceTop + priceH) {
      ctx.strokeStyle = PRICE_LN;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, lastY); ctx.lineTo(PAD.left + chartW, lastY); ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ── volume bars (clip to vol area) ── */
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, volTop, chartW, volH); ctx.clip();
    for (let i = 0; i < visible.length; i++) {
      const c  = visible[i];
      const up = c.close >= c.open;
      ctx.fillStyle = up ? UP_VOL : DN_VOL;
      const x  = cx(i);
      const vh = (volTop + volH) - vy(Math.abs(c.close - c.open));
      ctx.fillRect(x - bodyW / 2, vy(Math.abs(c.close - c.open)), bodyW, vh);
    }
    ctx.restore();

    /* ── candles (clip to price area) ── */
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, priceTop, chartW, priceH); ctx.clip();
    for (let i = 0; i < visible.length; i++) {
      const c   = visible[i];
      const x   = cx(i);
      const up  = c.close >= c.open;
      const col = up ? UP : DN;

      ctx.strokeStyle = col;
      ctx.lineWidth   = wickW;
      ctx.beginPath(); ctx.moveTo(x, py(c.high)); ctx.lineTo(x, py(c.low)); ctx.stroke();

      const top = py(Math.max(c.open, c.close));
      const bh  = Math.max(1.5, py(Math.min(c.open, c.close)) - top);
      ctx.fillStyle = col;
      ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
    }
    ctx.restore();

    /* ── axis borders ── */
    ctx.strokeStyle = AXIS_LN;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left + chartW, 0); ctx.lineTo(PAD.left + chartW, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, H - PAD.bottom); ctx.lineTo(PAD.left + chartW, H - PAD.bottom); ctx.stroke();

    /* ── price axis labels ── */
    ctx.fillStyle    = AXIS_TXT;
    ctx.font         = "11px Inter, system-ui, sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= steps; i++) {
      const p = lo + (pRange * i) / steps;
      const y = py(p);
      if (y < priceTop || y > priceTop + priceH) continue;
      ctx.fillText(fmtPrice(p, symbol), PAD.left + chartW + 5, y);
    }

    /* ── current price label on axis ── */
    const priceLabel = fmtPrice(lastPrice, symbol);
    const plH = 18;
    const isLastUp = (visible.at(-1)!.close >= visible.at(-1)!.open);
    ctx.fillStyle = isLastUp ? UP : DN;
    ctx.beginPath();
    ctx.roundRect(PAD.left + chartW + 1, lastY - plH / 2, PAD.right - 2, plH, 2);
    ctx.fill();
    ctx.fillStyle    = "#fff";
    ctx.font         = "11px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(priceLabel, PAD.left + chartW + 5, lastY);

    /* ── time axis labels ── */
    ctx.fillStyle    = AXIS_TXT;
    ctx.font         = "11px Inter, system-ui, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "alphabetic";
    const labelEvery = Math.max(1, Math.floor(visible.length / 8));
    for (let i = 0; i < visible.length; i += labelEvery) {
      const x = cx(i);
      ctx.fillText(fmtAxisDate(visible[i].time, timeframe), x, H - 6);
    }

    /* ── crosshair ── */
    const mx = s.mouseX;
    const my = s.mouseY;
    if (mx >= PAD.left && mx <= PAD.left + chartW && my >= priceTop && my <= priceTop + priceH + volH) {
      const hoverIdx  = Math.min(visible.length - 1, Math.max(0, Math.floor((mx - PAD.left) / candleW)));
      const snapX     = cx(hoverIdx);
      const hc        = visible[hoverIdx];

      ctx.strokeStyle = CROSS;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(snapX, PAD.top); ctx.lineTo(snapX, H - PAD.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD.left, my); ctx.lineTo(PAD.left + chartW, my); ctx.stroke();
      ctx.setLineDash([]);

      /* price crosshair label */
      const hoverPrice = hi - ((my - priceTop) / priceH) * pRange;
      const pLabel = fmtPrice(hoverPrice, symbol);
      const pLW    = ctx.measureText(pLabel).width + 12;
      ctx.fillStyle = LABEL_BG;
      ctx.beginPath();
      ctx.roundRect(PAD.left + chartW + 1, my - 9, Math.max(PAD.right - 2, pLW), 18, 2);
      ctx.fill();
      ctx.fillStyle    = "#fff";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(pLabel, PAD.left + chartW + 5, my);

      /* date crosshair label */
      const dLabel = fmtAxisDate(hc.time, timeframe);
      const dLW    = ctx.measureText(dLabel).width + 14;
      ctx.fillStyle = LABEL_BG;
      ctx.beginPath();
      ctx.roundRect(snapX - dLW / 2, H - PAD.bottom + 1, dLW, 18, 2);
      ctx.fill();
      ctx.fillStyle    = "#fff";
      ctx.textAlign    = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(dLabel, snapX, H - PAD.bottom + 14);

      onCrosshairRef.current?.(hc);
    } else {
      onCrosshairRef.current?.(null);
    }
  }, [candles, symbol, timeframe]);

  /* ── Event listeners ───────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;

    canvas.style.cursor = "crosshair";
    draw();

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      s.mouseX = e.clientX - r.left;
      s.mouseY = e.clientY - r.top;
      if (s.isDragging) {
        const cw = (canvas.clientWidth - PAD.left - PAD.right) / Math.max(10, s.visibleCount);
        s.rightOffset = Math.max(0, Math.min(
          s.dragStartOffset + Math.round((s.dragStartX - e.clientX) / cw),
          Math.max(0, candles.length - s.visibleCount),
        ));
      }
      draw();
    };
    const onDown  = (e: MouseEvent) => {
      s.isDragging = true; s.dragStartX = e.clientX; s.dragStartOffset = s.rightOffset;
      canvas.style.cursor = "grabbing";
    };
    const onUp    = () => { s.isDragging = false; canvas.style.cursor = "crosshair"; };
    const onLeave = () => {
      s.mouseX = s.mouseY = -1; s.isDragging = false;
      canvas.style.cursor = "crosshair";
      onCrosshairRef.current?.(null);
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.visibleCount = Math.max(10, Math.min(Math.round(s.visibleCount * (e.deltaY > 0 ? 1.18 : 0.85)), candles.length));
      draw();
    };

    canvas.addEventListener("mousemove",  onMove);
    canvas.addEventListener("mousedown",  onDown);
    canvas.addEventListener("mouseup",    onUp);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("wheel",      onWheel, { passive: false });

    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener("mousemove",  onMove);
      canvas.removeEventListener("mousedown",  onDown);
      canvas.removeEventListener("mouseup",    onUp);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("wheel",      onWheel);
      ro.disconnect();
    };
  }, [candles, draw]);

  useEffect(() => {
    stateRef.current.rightOffset = 0;
    draw();
  }, [candles, draw]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}
