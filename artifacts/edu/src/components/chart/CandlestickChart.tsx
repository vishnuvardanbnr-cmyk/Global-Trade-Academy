import { useRef, useEffect, useCallback } from "react";

export type Candle = { time: number; open: number; high: number; low: number; close: number };

interface Props {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  onCrosshairMove?: (candle: Candle | null) => void;
}

const PAD   = { top: 16, right: 82, bottom: 34, left: 8 };
const UP    = "#10b981";
const DN    = "#ef4444";

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
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface State {
  visibleCount: number;
  rightOffset: number;
  mouseX: number;
  mouseY: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartOffset: number;
}

export function CandlestickChart({ candles, symbol, timeframe, onCrosshairMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef<State>({
    visibleCount:   120,
    rightOffset:    0,
    mouseX:         -1,
    mouseY:         -1,
    isDragging:     false,
    dragStartX:     0,
    dragStartOffset: 0,
  });
  const onCrosshairRef = useRef(onCrosshairMove);
  onCrosshairRef.current = onCrosshairMove;

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

    const s       = stateRef.current;
    const chartW  = W - PAD.left - PAD.right;
    const chartH  = H - PAD.top  - PAD.bottom;

    const total        = candles.length;
    const visibleCount = Math.max(10, Math.min(s.visibleCount, total));
    const rightOffset  = Math.max(0, Math.min(s.rightOffset, Math.max(0, total - visibleCount)));
    const startIdx     = Math.max(0, total - visibleCount - rightOffset);
    const endIdx       = Math.max(1, total - rightOffset);
    const visible      = candles.slice(startIdx, endIdx);
    if (!visible.length) return;

    const candleW = chartW / visible.length;
    const bodyW   = Math.max(1, candleW * 0.65);
    const wickW   = Math.max(1, Math.min(2, candleW * 0.12));

    /* price range */
    let lo = Infinity, hi = -Infinity;
    for (const c of visible) {
      if (c.low  < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const pRange = hi - lo;

    const py = (p: number) => PAD.top + ((hi - p) / pRange) * chartH;
    const cx = (i: number) => PAD.left + (i + 0.5) * candleW;

    /* theme */
    const dark      = document.documentElement.classList.contains("dark");
    const bgColor   = dark ? "#0f172a" : "#ffffff";
    const gridColor = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    const textColor = dark ? "#64748b" : "#94a3b8";
    const axisLine  = dark ? "rgba(255,255,255,0.1)"  : "rgba(0,0,0,0.1)";
    const crossColor = "rgba(99,102,241,0.55)";

    /* clear */
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    /* clip chart area */
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, chartW, chartH);
    ctx.clip();

    /* horizontal grid */
    const steps = 6;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
      const p = lo + (pRange * i) / steps;
      const y = py(p);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    }

    /* candles */
    for (let i = 0; i < visible.length; i++) {
      const c  = visible[i];
      const x  = cx(i);
      const up = c.close >= c.open;
      const col = up ? UP : DN;

      /* wick */
      ctx.strokeStyle = col;
      ctx.lineWidth   = wickW;
      ctx.beginPath();
      ctx.moveTo(x, py(c.high));
      ctx.lineTo(x, py(c.low));
      ctx.stroke();

      /* body */
      const top    = py(Math.max(c.open, c.close));
      const bottom = py(Math.min(c.open, c.close));
      const bh     = Math.max(1.5, bottom - top);
      ctx.fillStyle = col;
      ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
    }

    ctx.restore();

    /* axis lines */
    ctx.strokeStyle = axisLine;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left + chartW, PAD.top); ctx.lineTo(PAD.left + chartW, PAD.top + chartH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top + chartH); ctx.lineTo(PAD.left + chartW, PAD.top + chartH); ctx.stroke();

    /* price axis labels */
    ctx.fillStyle  = textColor;
    ctx.font       = "11px Inter, system-ui, sans-serif";
    ctx.textAlign  = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= steps; i++) {
      const p = lo + (pRange * i) / steps;
      const y = py(p);
      if (y < PAD.top - 8 || y > PAD.top + chartH + 8) continue;
      ctx.fillText(fmtPrice(p, symbol), PAD.left + chartW + 6, y);
    }

    /* time axis labels */
    ctx.textAlign    = "center";
    ctx.textBaseline = "alphabetic";
    const labelEvery = Math.max(1, Math.floor(visible.length / 7));
    for (let i = 0; i < visible.length; i += labelEvery) {
      const x = cx(i);
      ctx.fillText(fmtAxisDate(visible[i].time, timeframe), x, H - 6);
    }

    /* crosshair */
    const mx = s.mouseX;
    const my = s.mouseY;
    if (mx >= PAD.left && mx <= PAD.left + chartW && my >= PAD.top && my <= PAD.top + chartH) {
      /* snap to candle center */
      const hoverIdx = Math.min(visible.length - 1, Math.max(0, Math.floor((mx - PAD.left) / candleW)));
      const snapX    = cx(hoverIdx);

      ctx.strokeStyle = crossColor;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      /* vertical */
      ctx.beginPath(); ctx.moveTo(snapX, PAD.top); ctx.lineTo(snapX, PAD.top + chartH); ctx.stroke();
      /* horizontal */
      ctx.beginPath(); ctx.moveTo(PAD.left, my); ctx.lineTo(PAD.left + chartW, my); ctx.stroke();
      ctx.setLineDash([]);

      /* price label */
      const hoverPrice = hi - ((my - PAD.top) / chartH) * pRange;
      const priceLabel = fmtPrice(hoverPrice, symbol);
      const plW = ctx.measureText(priceLabel).width + 14;
      ctx.fillStyle = "#6366f1";
      ctx.beginPath();
      ctx.roundRect(PAD.left + chartW + 1, my - 10, Math.max(PAD.right - 2, plW), 20, 3);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(priceLabel, PAD.left + chartW + 7, my);

      /* date label */
      const hc = visible[hoverIdx];
      const dateLabel = fmtAxisDate(hc.time, timeframe);
      const dlW = ctx.measureText(dateLabel).width + 14;
      ctx.fillStyle = "#6366f1";
      ctx.beginPath();
      ctx.roundRect(snapX - dlW / 2, PAD.top + chartH + 1, dlW, 20, 3);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(dateLabel, snapX, PAD.top + chartH + 15);

      onCrosshairRef.current?.(hc);
    } else {
      onCrosshairRef.current?.(null);
    }
  }, [candles, symbol, timeframe]);

  /* event listeners */
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
        const delta = Math.round((s.dragStartX - e.clientX) / cw);
        s.rightOffset = Math.max(0, Math.min(s.dragStartOffset + delta, Math.max(0, candles.length - s.visibleCount)));
      }
      draw();
    };
    const onDown = (e: MouseEvent) => {
      s.isDragging = true;
      s.dragStartX = e.clientX;
      s.dragStartOffset = s.rightOffset;
      canvas.style.cursor = "grabbing";
    };
    const onUp = () => { s.isDragging = false; canvas.style.cursor = "crosshair"; };
    const onLeave = () => {
      s.mouseX = s.mouseY = -1;
      s.isDragging = false;
      canvas.style.cursor = "crosshair";
      onCrosshairRef.current?.(null);
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.18 : 0.85;
      s.visibleCount = Math.max(10, Math.min(Math.round(s.visibleCount * factor), candles.length));
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

  /* reset view when new data arrives */
  useEffect(() => {
    stateRef.current.rightOffset = 0;
    draw();
  }, [candles, draw]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}
