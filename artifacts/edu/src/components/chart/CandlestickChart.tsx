import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

export type Candle = { time: number; open: number; high: number; low: number; close: number };

export interface ChartHandle {
  clearDrawings: () => void;
}

interface Props {
  candles:          Candle[];
  symbol:           string;
  timeframe:        string;
  activeTool?:      string;
  onCrosshairMove?: (candle: Candle | null) => void;
}

/* ── Layout ───────────────────────────────────────────────── */
const PAD       = { top: 12, right: 76, bottom: 28, left: 0 };
const VOL_RATIO = 0.18;

/* ── Colors ───────────────────────────────────────────────── */
const BG       = "#131722";
const GRID     = "rgba(255,255,255,0.05)";
const AXIS_TXT = "#787b86";
const AXIS_LN  = "rgba(255,255,255,0.08)";
const UP       = "#26a69a";
const DN       = "#ef5350";
const UP_VOL   = "rgba(38,166,154,0.35)";
const DN_VOL   = "rgba(239,83,80,0.35)";
const PRICE_LN = "rgba(38,166,154,0.5)";
const CROSS    = "rgba(149,152,161,0.5)";
const LABEL_BG = "#2962ff";
const DRAW_COL = "#f0c027";   // gold — visible on dark bg
const DRAW_HOV = "#ff6b6b";   // red highlight when hovering for delete

/* ── Price formatting ─────────────────────────────────────── */
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Drawing types ────────────────────────────────────────── */
type PT = { epoch: number; price: number };

type Drawing =
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "vline"; epoch: number }
  | { id: string; kind: "tline"; p1: PT; p2: PT }
  | { id: string; kind: "rect";  p1: PT; p2: PT };

/* ── Coord context (set each draw, read in mouse handlers) ─── */
interface Coords {
  py:          (p: number) => number;
  priceFromY:  (y: number) => number;
  epochToX:    (epoch: number) => number;
  epochFromX:  (x: number) => number;
  priceTop:    number;
  priceH:      number;
  chartW:      number;
  hi:          number;
  lo:          number;
  pRange:      number;
  candleW:     number;
  visible:     Candle[];
}

/* ── Pan/draw interaction state ───────────────────────────── */
interface State {
  visibleCount:    number;
  rightOffset:     number;
  mouseX:          number;
  mouseY:          number;
  isDragging:      boolean;
  dragStartX:      number;
  dragStartOffset: number;
  drawPhase:       "idle" | "firstPoint" | "dragging";
  drawP1:          PT | null;
  hoverDrawingId:  string | null;
}

let _nextId = 0;
const nextId = () => `d${++_nextId}`;

/* ── Map tool name → drawing kind ────────────────────────────*/
function toolKind(tool: string): Drawing["kind"] | null {
  if (tool === "Horiz. Line")  return "hline";
  if (tool === "Vert. Line")   return "vline";
  if (tool === "Trend Line" || tool === "Ray") return "tline";
  if (tool === "Rectangle")    return "rect";
  return null;
}

export const CandlestickChart = forwardRef<ChartHandle, Props>(function CandlestickChart(
  { candles, symbol, timeframe, activeTool = "Cursor", onCrosshairMove },
  ref,
) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const toolRef       = useRef(activeTool);
  const coordRef      = useRef<Coords | null>(null);
  const drawingsRef   = useRef<Drawing[]>([]);
  const onCrossRef    = useRef(onCrosshairMove);
  onCrossRef.current  = onCrosshairMove;
  toolRef.current     = activeTool;

  useImperativeHandle(ref, () => ({
    clearDrawings: () => {
      drawingsRef.current = [];
      draw();
    },
  }));

  /* ═══════════════════ DRAW ══════════════════════════════════ */
  const stateRef = useRef<State>({
    visibleCount:    300,
    rightOffset:     0,
    mouseX:          -1,
    mouseY:          -1,
    isDragging:      false,
    dragStartX:      0,
    dragStartOffset: 0,
    drawPhase:       "idle",
    drawP1:          null,
    hoverDrawingId:  null,
  });

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

    const s = stateRef.current;

    /* ── Visible candle range ── */
    const total        = candles.length;
    const visibleCount = Math.max(10, Math.min(s.visibleCount, total));
    const rightOffset  = Math.max(0, Math.min(s.rightOffset, Math.max(0, total - visibleCount)));
    const startIdx     = Math.max(0, total - visibleCount - rightOffset);
    const endIdx       = Math.max(1, total - rightOffset);
    const visible      = candles.slice(startIdx, endIdx);
    if (!visible.length) return;

    const chartW = W - PAD.left - PAD.right;
    const candleW = chartW / visible.length;
    const bodyW   = Math.max(1, candleW * 0.62);
    const wickW   = Math.max(1, Math.min(2, candleW * 0.1));

    /* chart split */
    const fullH    = H - PAD.top - PAD.bottom;
    const volH     = fullH * VOL_RATIO;
    const priceH   = fullH - volH - 4;
    const priceTop = PAD.top;
    const volTop   = PAD.top + priceH + 4;

    /* price range */
    let lo = Infinity, hi = -Infinity;
    for (const c of visible) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; }
    const rawRange = hi - lo || 1;
    const pad = rawRange * 0.06;
    lo -= pad; hi += pad;
    const pRange = hi - lo;

    /* coord functions */
    const py         = (p: number) => priceTop + ((hi - p) / pRange) * priceH;
    const priceFromY = (y: number) => hi - ((y - priceTop) / priceH) * pRange;
    const cx         = (i: number) => PAD.left + (i + 0.5) * candleW;

    const timeStep  = visible.length > 1 ? visible[1].time - visible[0].time : 60;
    const firstEpoch = visible[0].time;

    const epochToX   = (epoch: number) => PAD.left + ((epoch - firstEpoch) / timeStep + 0.5) * candleW;
    const epochFromX = (x: number) => firstEpoch + ((x - PAD.left) / candleW - 0.5) * timeStep;

    coordRef.current = { py, priceFromY, epochToX, epochFromX, priceTop, priceH, chartW, hi, lo, pRange, candleW, visible };

    /* ── Background ── */
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    /* ── Grid ── */
    ctx.strokeStyle = GRID;
    ctx.lineWidth   = 1;
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const p = lo + (pRange * i) / steps;
      const y = py(p);
      if (y < priceTop || y > priceTop + priceH) continue;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    }

    /* ── Current price dotted ── */
    const lastPrice = visible.at(-1)!.close;
    const lastY     = py(lastPrice);
    if (lastY >= priceTop && lastY <= priceTop + priceH) {
      ctx.strokeStyle = PRICE_LN;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, lastY); ctx.lineTo(PAD.left + chartW, lastY); ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ── Volume bars ── */
    const volMax = Math.max(...visible.map((c) => Math.abs(c.close - c.open)));
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, volTop, chartW, volH); ctx.clip();
    for (let i = 0; i < visible.length; i++) {
      const c  = visible[i];
      const up = c.close >= c.open;
      ctx.fillStyle = up ? UP_VOL : DN_VOL;
      const x  = cx(i);
      const h  = volMax > 0 ? (Math.abs(c.close - c.open) / volMax) * volH : 0;
      ctx.fillRect(x - bodyW / 2, volTop + volH - h, bodyW, h);
    }
    ctx.restore();

    /* ── Candles ── */
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, priceTop, chartW, priceH); ctx.clip();
    for (let i = 0; i < visible.length; i++) {
      const c  = visible[i];
      const x  = cx(i);
      const up = c.close >= c.open;
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

    /* ── Saved drawings ── */
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, priceTop, chartW, priceH); ctx.clip();
    for (const d of drawingsRef.current) {
      const isHover = d.id === s.hoverDrawingId;
      const col = isHover ? DRAW_HOV : DRAW_COL;
      ctx.strokeStyle = col;
      ctx.fillStyle   = col;
      ctx.lineWidth   = isHover ? 2 : 1.5;

      if (d.kind === "hline") {
        const y = py(d.price);
        if (y < priceTop || y > priceTop + priceH) continue;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
        ctx.setLineDash([]);
        /* price label on right axis */
        const lbl = fmtPrice(d.price, symbol);
        const lbW = ctx.measureText(lbl).width + 10;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(PAD.left + chartW + 1, y - 9, Math.max(PAD.right - 2, lbW), 18, 2);
        ctx.fill();
        ctx.fillStyle    = BG;
        ctx.font         = "11px Inter,system-ui,sans-serif";
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(lbl, PAD.left + chartW + 5, y);
      } else if (d.kind === "vline") {
        const x = epochToX(d.epoch);
        if (x < PAD.left || x > PAD.left + chartW) continue;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(x, priceTop); ctx.lineTo(x, priceTop + priceH); ctx.stroke();
        ctx.setLineDash([]);
      } else if (d.kind === "tline") {
        const x1 = epochToX(d.p1.epoch), y1 = py(d.p1.price);
        const x2 = epochToX(d.p2.epoch), y2 = py(d.p2.price);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        /* dots at endpoints */
        ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
      } else if (d.kind === "rect") {
        const x1 = epochToX(d.p1.epoch), y1 = py(d.p1.price);
        const x2 = epochToX(d.p2.epoch), y2 = py(d.p2.price);
        ctx.globalAlpha = 0.12;
        ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
        ctx.globalAlpha = 1;
        ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      }
    }
    ctx.restore();

    /* ── In-progress drawing preview ── */
    const { drawPhase, drawP1 } = s;
    const mx = s.mouseX, my = s.mouseY;
    const kind = toolKind(toolRef.current);
    if (kind && drawPhase !== "idle" && drawP1) {
      const previewEpoch = epochFromX(mx);
      const previewPrice = priceFromY(my);
      ctx.save();
      ctx.beginPath(); ctx.rect(PAD.left, priceTop, chartW, priceH); ctx.clip();
      ctx.strokeStyle = DRAW_COL;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 4]);

      if (kind === "hline") {
        /* already saved on click, no preview needed */
      } else if (kind === "vline") {
        /* same */
      } else if (kind === "tline" || kind === "rect") {
        const x1 = epochToX(drawP1.epoch), y1 = py(drawP1.price);
        if (kind === "tline") {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mx, my); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = DRAW_COL;
          ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.strokeRect(Math.min(x1,mx), Math.min(y1,my), Math.abs(mx-x1), Math.abs(my-y1));
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = DRAW_COL;
          ctx.fillRect(Math.min(x1,mx), Math.min(y1,my), Math.abs(mx-x1), Math.abs(my-y1));
          ctx.globalAlpha = 1;
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
      void previewEpoch; void previewPrice;
    }

    /* ── Axis borders ── */
    ctx.strokeStyle = AXIS_LN;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left + chartW, 0); ctx.lineTo(PAD.left + chartW, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, H - PAD.bottom); ctx.lineTo(PAD.left + chartW, H - PAD.bottom); ctx.stroke();

    /* ── Price axis labels ── */
    ctx.fillStyle    = AXIS_TXT;
    ctx.font         = "11px Inter,system-ui,sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= steps; i++) {
      const p = lo + (pRange * i) / steps;
      const y = py(p);
      if (y < priceTop || y > priceTop + priceH) continue;
      ctx.fillText(fmtPrice(p, symbol), PAD.left + chartW + 5, y);
    }

    /* ── Current price axis label ── */
    const plLabel = fmtPrice(lastPrice, symbol);
    const plH = 18;
    const isLastUp = visible.at(-1)!.close >= visible.at(-1)!.open;
    ctx.fillStyle = isLastUp ? UP : DN;
    ctx.beginPath();
    ctx.roundRect(PAD.left + chartW + 1, lastY - plH / 2, PAD.right - 2, plH, 2);
    ctx.fill();
    ctx.fillStyle    = "#fff";
    ctx.font         = "11px Inter,system-ui,sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(plLabel, PAD.left + chartW + 5, lastY);

    /* ── Time axis labels ── */
    ctx.fillStyle    = AXIS_TXT;
    ctx.font         = "11px Inter,system-ui,sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "alphabetic";
    const labelEvery = Math.max(1, Math.floor(visible.length / 8));
    for (let i = 0; i < visible.length; i += labelEvery) {
      ctx.fillText(fmtAxisDate(visible[i].time, timeframe), cx(i), H - 6);
    }

    /* ── Crosshair ── */
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

      const hoverPrice = priceFromY(my);
      const pLabel = fmtPrice(hoverPrice, symbol);
      const pLW    = ctx.measureText(pLabel).width + 12;
      ctx.fillStyle = LABEL_BG;
      ctx.beginPath();
      ctx.roundRect(PAD.left + chartW + 1, my - 9, Math.max(PAD.right - 2, pLW), 18, 2);
      ctx.fill();
      ctx.fillStyle    = "#fff";
      ctx.font         = "11px Inter,system-ui,sans-serif";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(pLabel, PAD.left + chartW + 5, my);

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

      onCrossRef.current?.(hc);
    } else {
      onCrossRef.current?.(null);
    }
  }, [candles, symbol, timeframe]);

  /* ═══════════════════ HELPERS ════════════════════════════════ */
  const getCursor = (tool: string): string => {
    if (tool === "Delete")     return "pointer";
    if (tool === "Cursor")     return "default";
    if (tool === "Crosshair")  return "crosshair";
    if (tool === "ZoomIn" || tool === "Zoom") return "zoom-in";
    return "crosshair";
  };

  /** Find the drawing id closest to (mx, my); null if none within threshold */
  const findNearestDrawing = (mx: number, my: number): string | null => {
    const c = coordRef.current;
    if (!c) return null;
    const THRESH = 8;
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const d of drawingsRef.current) {
      let dist = Infinity;
      if (d.kind === "hline") {
        dist = Math.abs(c.py(d.price) - my);
      } else if (d.kind === "vline") {
        dist = Math.abs(c.epochToX(d.epoch) - mx);
      } else if (d.kind === "tline") {
        const x1 = c.epochToX(d.p1.epoch), y1 = c.py(d.p1.price);
        const x2 = c.epochToX(d.p2.epoch), y2 = c.py(d.p2.price);
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) { dist = Math.hypot(mx - x1, my - y1); }
        else {
          const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / len2));
          dist = Math.hypot(mx - (x1 + t * dx), my - (y1 + t * dy));
        }
      } else if (d.kind === "rect") {
        const x1 = c.epochToX(d.p1.epoch), y1 = c.py(d.p1.price);
        const x2 = c.epochToX(d.p2.epoch), y2 = c.py(d.p2.price);
        const lx = Math.min(x1,x2), rx = Math.max(x1,x2);
        const ty = Math.min(y1,y2), by = Math.max(y1,y2);
        const inside = mx >= lx && mx <= rx && my >= ty && my <= by;
        const edgeL = Math.abs(mx - lx), edgeR = Math.abs(mx - rx);
        const edgeT = Math.abs(my - ty), edgeB = Math.abs(my - by);
        dist = inside ? Math.min(edgeL, edgeR, edgeT, edgeB) : Infinity;
      }
      if (dist < THRESH && dist < bestDist) { bestDist = dist; bestId = d.id; }
    }
    return bestId;
  };

  /* ═══════════════════ EVENTS ══════════════════════════════════ */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;
    draw();

    const onMouseMove = (e: MouseEvent) => {
      const r  = canvas.getBoundingClientRect();
      s.mouseX = e.clientX - r.left;
      s.mouseY = e.clientY - r.top;
      const tool = toolRef.current;

      if (tool === "Delete") {
        s.hoverDrawingId = findNearestDrawing(s.mouseX, s.mouseY);
        canvas.style.cursor = s.hoverDrawingId ? "pointer" : "default";
      } else {
        canvas.style.cursor = getCursor(tool);
        /* pan while dragging in Cursor mode */
        if (tool === "Cursor" && s.isDragging) {
          const cw = (canvas.clientWidth - PAD.left - PAD.right) / Math.max(10, s.visibleCount);
          s.rightOffset = Math.max(0, Math.min(
            s.dragStartOffset + Math.round((s.dragStartX - e.clientX) / cw),
            Math.max(0, candles.length - s.visibleCount),
          ));
        }
      }
      draw();
    };

    const onMouseDown = (e: MouseEvent) => {
      const r  = canvas.getBoundingClientRect();
      s.mouseX = e.clientX - r.left;
      s.mouseY = e.clientY - r.top;
      const tool = toolRef.current;
      const c    = coordRef.current;

      if (tool === "Delete") {
        const id = findNearestDrawing(s.mouseX, s.mouseY);
        if (id) {
          drawingsRef.current = drawingsRef.current.filter((d) => d.id !== id);
          s.hoverDrawingId = null;
        }
        draw();
        return;
      }

      if (tool === "Cursor") {
        s.isDragging = true; s.dragStartX = e.clientX; s.dragStartOffset = s.rightOffset;
        canvas.style.cursor = "grabbing";
        return;
      }

      if (!c) return;
      const kind = toolKind(tool);
      if (!kind) return;

      const price = c.priceFromY(s.mouseY);
      const epoch = c.epochFromX(s.mouseX);

      if (kind === "hline") {
        drawingsRef.current.push({ id: nextId(), kind: "hline", price });
        draw();
        return;
      }
      if (kind === "vline") {
        drawingsRef.current.push({ id: nextId(), kind: "vline", epoch });
        draw();
        return;
      }
      if (kind === "tline") {
        if (s.drawPhase === "idle") {
          s.drawPhase = "firstPoint";
          s.drawP1    = { epoch, price };
        } else {
          /* second click — save */
          if (s.drawP1) {
            drawingsRef.current.push({ id: nextId(), kind: "tline", p1: s.drawP1, p2: { epoch, price } });
          }
          s.drawPhase = "idle";
          s.drawP1    = null;
        }
        draw();
        return;
      }
      if (kind === "rect") {
        s.drawPhase = "dragging";
        s.drawP1    = { epoch, price };
        s.isDragging = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const r  = canvas.getBoundingClientRect();
      s.mouseX = e.clientX - r.left;
      s.mouseY = e.clientY - r.top;
      const tool = toolRef.current;
      const c    = coordRef.current;

      if (tool === "Cursor") {
        s.isDragging = false;
        canvas.style.cursor = "default";
        return;
      }

      if (!c) return;
      const kind = toolKind(tool);
      if (kind === "rect" && s.drawPhase === "dragging" && s.drawP1) {
        const price = c.priceFromY(s.mouseY);
        const epoch = c.epochFromX(s.mouseX);
        const dx = Math.abs(s.mouseX - c.epochToX(s.drawP1.epoch));
        const dy = Math.abs(s.mouseY - c.py(s.drawP1.price));
        if (dx > 4 && dy > 4) {
          drawingsRef.current.push({ id: nextId(), kind: "rect", p1: s.drawP1, p2: { epoch, price } });
        }
        s.drawPhase  = "idle";
        s.drawP1     = null;
        s.isDragging = false;
        draw();
      }
    };

    const onMouseLeave = () => {
      s.mouseX = s.mouseY = -1;
      s.isDragging   = false;
      s.hoverDrawingId = null;
      canvas.style.cursor = getCursor(toolRef.current);
      onCrossRef.current?.(null);
      draw();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.visibleCount = Math.max(10, Math.min(
        Math.round(s.visibleCount * (e.deltaY > 0 ? 1.18 : 0.85)),
        candles.length,
      ));
      draw();
    };

    canvas.addEventListener("mousemove",  onMouseMove);
    canvas.addEventListener("mousedown",  onMouseDown);
    canvas.addEventListener("mouseup",    onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("wheel",      onWheel, { passive: false });

    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener("mousemove",  onMouseMove);
      canvas.removeEventListener("mousedown",  onMouseDown);
      canvas.removeEventListener("mouseup",    onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("wheel",      onWheel);
      ro.disconnect();
    };
  }, [candles, draw]);

  /* reset draw phase when tool changes */
  useEffect(() => {
    const s = stateRef.current;
    s.drawPhase = "idle";
    s.drawP1    = null;
    s.hoverDrawingId = null;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = getCursor(activeTool);
    draw();
  }, [activeTool, draw]);

  /* reset scroll when new candles arrive */
  useEffect(() => {
    stateRef.current.rightOffset = 0;
    draw();
  }, [candles, draw]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
});
