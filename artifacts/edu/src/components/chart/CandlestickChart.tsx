/**
 * CandlestickChart — TradingView-style chart powered by lightweight-charts v5.
 *
 * Features
 * ─────────
 * • Chart types  : Candlestick, Bar, Line, Area
 * • Overlays     : MA(20/50), EMA(20), Bollinger Bands
 * • Sub-panels   : RSI(14) at pane-1, MACD(12,26,9) at pane-2
 * • Volume       : Range proxy (high-low) at bottom of main pane
 * • Drawing tools: Horizontal Price Lines, Trend Lines
 * • Real-time    : update() on live tick, setData() on full reload
 */

import {
  useRef, useEffect, useCallback, forwardRef, useImperativeHandle,
} from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries,
} from "lightweight-charts";
import type {
  IChartApi, ISeriesApi, Time,
  CandlestickData, LineData, HistogramData, IPriceLine,
  MouseEventParams,
} from "lightweight-charts";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type ChartType = "candle" | "bar" | "line" | "area";

export interface ChartHandle {
  clearDrawings: () => void;
}

interface Props {
  candles:           Candle[];
  symbol:            string;
  timeframe:         string;
  chartType?:        ChartType;
  activeIndicators?: Set<string>;
  activeTool?:       string;
  onCrosshairMove?:  (candle: Candle | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg:          "#131722",
  grid:        "rgba(255,255,255,0.04)",
  border:      "#2a2e39",
  text:        "#9398a1",
  up:          "#26a69a",
  dn:          "#ef5350",
  upVol:       "rgba(38,166,154,0.35)",
  dnVol:       "rgba(239,83,80,0.35)",
  cross:       "rgba(149,152,161,0.5)",
  crossLabel:  "#2962ff",
  draw:        "#f0c027",
};

// ─────────────────────────────────────────────────────────────────────────────
// Indicator math
// ─────────────────────────────────────────────────────────────────────────────

type LD = LineData<Time>;
type HD = HistogramData<Time>;

function sma(closes: number[], times: number[], n: number): LD[] {
  const out: LD[] = [];
  for (let i = n - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += closes[j];
    out.push({ time: times[i] as Time, value: s / n });
  }
  return out;
}

function emaFull(closes: number[], times: number[], n: number): LD[] {
  if (closes.length < n) return [];
  const k = 2 / (n + 1);
  const out: LD[] = [];
  let e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out.push({ time: times[n - 1] as Time, value: e });
  for (let i = n; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out.push({ time: times[i] as Time, value: e });
  }
  return out;
}

function bb(closes: number[], times: number[], n = 20, mult = 2): {
  upper: LD[]; middle: LD[]; lower: LD[];
} {
  const upper: LD[] = [], middle: LD[] = [], lower: LD[] = [];
  for (let i = n - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += closes[j];
    const mean = s / n;
    let vari = 0;
    for (let j = i - n + 1; j <= i; j++) vari += (closes[j] - mean) ** 2;
    const std = Math.sqrt(vari / n);
    const t = times[i] as Time;
    upper.push({ time: t, value: mean + mult * std });
    middle.push({ time: t, value: mean });
    lower.push({ time: t, value: mean - mult * std });
  }
  return { upper, middle, lower };
}

function rsi(closes: number[], times: number[], n = 14): LD[] {
  if (closes.length < n + 1) return [];
  const out: LD[] = [];
  let ag = 0, al = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= n; al /= n;
  const rsiVal = (ag: number, al: number) => al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  out.push({ time: times[n] as Time, value: rsiVal(ag, al) });
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    ag = (ag * (n - 1) + g) / n;
    al = (al * (n - 1) + l) / n;
    out.push({ time: times[i] as Time, value: rsiVal(ag, al) });
  }
  return out;
}

function macd(closes: number[], times: number[], fast = 12, slow = 26, sig = 9): {
  line: LD[]; signal: LD[]; hist: HD[];
} {
  const ef = emaFull(closes, times, fast);
  const es = emaFull(closes, times, slow);
  const slowMap = new Map(es.map(d => [d.time, d.value]));
  const macdLine: LD[] = [];
  for (const f of ef) {
    const s = slowMap.get(f.time);
    if (s !== undefined) macdLine.push({ time: f.time, value: f.value - s });
  }
  if (macdLine.length < sig) return { line: macdLine, signal: [], hist: [] };
  const k = 2 / (sig + 1);
  const signal: LD[] = [];
  const hist: HD[] = [];
  let se = macdLine.slice(0, sig).reduce((a, b) => a + b.value, 0) / sig;
  signal.push({ time: macdLine[sig - 1].time, value: se });
  hist.push({
    time: macdLine[sig - 1].time,
    value: macdLine[sig - 1].value - se,
    color: (macdLine[sig - 1].value - se) >= 0 ? "rgba(38,166,154,0.7)" : "rgba(239,83,80,0.7)",
  });
  for (let i = sig; i < macdLine.length; i++) {
    se = macdLine[i].value * k + se * (1 - k);
    signal.push({ time: macdLine[i].time, value: se });
    const h = macdLine[i].value - se;
    hist.push({ time: macdLine[i].time, value: h, color: h >= 0 ? "rgba(38,166,154,0.7)" : "rgba(239,83,80,0.7)" });
  }
  return { line: macdLine, signal, hist };
}

// ─────────────────────────────────────────────────────────────────────────────
// Series group
// ─────────────────────────────────────────────────────────────────────────────

type MainSeries =
  | ISeriesApi<"Candlestick">
  | ISeriesApi<"Bar">
  | ISeriesApi<"Line">
  | ISeriesApi<"Area">;

interface SG {
  main:         MainSeries;
  vol?:         ISeriesApi<"Histogram">;
  ma20?:        ISeriesApi<"Line">;
  ma50?:        ISeriesApi<"Line">;
  ema20?:       ISeriesApi<"Line">;
  bbUpper?:     ISeriesApi<"Line">;
  bbMiddle?:    ISeriesApi<"Line">;
  bbLower?:     ISeriesApi<"Line">;
  rsi?:         ISeriesApi<"Line">;
  macdLine?:    ISeriesApi<"Line">;
  macdSignal?:  ISeriesApi<"Line">;
  macdHist?:    ISeriesApi<"Histogram">;
  all:          ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area" | "Histogram">[];
}

function buildGroup(
  chart: IChartApi,
  type: ChartType,
  ind: Set<string>,
  candles: Candle[],
): SG {
  const closes = candles.map(c => c.close);
  const times  = candles.map(c => c.time);

  // ── Main series ──────────────────────────────────────────────
  let main: MainSeries;
  if (type === "candle") {
    main = chart.addSeries(CandlestickSeries, {
      upColor: T.up, downColor: T.dn,
      borderVisible: false,
      wickUpColor: T.up, wickDownColor: T.dn,
    });
    (main as ISeriesApi<"Candlestick">).setData(
      candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
  } else if (type === "bar") {
    main = chart.addSeries(BarSeries, {
      upColor: T.up, downColor: T.dn,
      thinBars: false,
    });
    (main as ISeriesApi<"Bar">).setData(
      candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
  } else if (type === "line") {
    main = chart.addSeries(LineSeries, {
      color: "#2962ff", lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    (main as ISeriesApi<"Line">).setData(
      candles.map(c => ({ time: c.time as Time, value: c.close })),
    );
  } else {
    main = chart.addSeries(AreaSeries, {
      topColor: "rgba(41,98,255,0.4)",
      bottomColor: "rgba(41,98,255,0.0)",
      lineColor: "#2962ff",
      lineWidth: 2,
    });
    (main as ISeriesApi<"Area">).setData(
      candles.map(c => ({ time: c.time as Time, value: c.close })),
    );
  }

  const all: SG["all"] = [main as ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area" | "Histogram">];
  const sg: Partial<SG> & { main: MainSeries; all: SG["all"] } = { main, all };

  // ── Volume (range proxy) ─────────────────────────────────────
  const vol = chart.addSeries(HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: "vol",
  });
  vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, visible: false });
  vol.setData(
    candles.map(c => ({
      time: c.time as Time,
      value: c.high - c.low,
      color: c.close >= c.open ? T.upVol : T.dnVol,
    })),
  );
  sg.vol = vol;
  all.push(vol);

  // ── Overlay indicators ───────────────────────────────────────
  if (ind.has("ma20")) {
    const s = chart.addSeries(LineSeries, {
      color: "#f0b90b", lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    s.setData(sma(closes, times, 20));
    sg.ma20 = s;
    all.push(s);
  }
  if (ind.has("ma50")) {
    const s = chart.addSeries(LineSeries, {
      color: "#2196f3", lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    s.setData(sma(closes, times, 50));
    sg.ma50 = s;
    all.push(s);
  }
  if (ind.has("ema20")) {
    const s = chart.addSeries(LineSeries, {
      color: "#ff9800", lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    s.setData(emaFull(closes, times, 20));
    sg.ema20 = s;
    all.push(s);
  }
  if (ind.has("bb")) {
    const { upper, middle, lower } = bb(closes, times);
    const opts = {
      lineWidth: 1 as const,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    const u = chart.addSeries(LineSeries, { ...opts, color: "rgba(149,97,226,0.9)" });
    const m = chart.addSeries(LineSeries, { ...opts, color: "rgba(149,97,226,0.5)", lineStyle: LineStyle.Dashed });
    const l = chart.addSeries(LineSeries, { ...opts, color: "rgba(149,97,226,0.9)" });
    u.setData(upper); m.setData(middle); l.setData(lower);
    sg.bbUpper = u; sg.bbMiddle = m; sg.bbLower = l;
    all.push(u, m, l);
  }

  // ── RSI sub-panel (pane 1) ───────────────────────────────────
  if (ind.has("rsi")) {
    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#ce93d8",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    }, 1);
    rsiSeries.setData(rsi(closes, times));
    rsiSeries.createPriceLine({ price: 70, color: T.dn,   lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "OB" });
    rsiSeries.createPriceLine({ price: 50, color: T.text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    rsiSeries.createPriceLine({ price: 30, color: T.up,   lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "OS" });
    rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    try { chart.panes()[1]?.setHeight(110); } catch {}
    sg.rsi = rsiSeries;
    all.push(rsiSeries);
  }

  // ── MACD sub-panel (pane 1 if no RSI, else pane 2) ──────────
  if (ind.has("macd")) {
    const paneIdx = ind.has("rsi") ? 2 : 1;
    const { line: ml, signal: sl, hist: hl } = macd(closes, times);
    const macdLine = chart.addSeries(LineSeries, {
      color: "#2196f3", lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, paneIdx);
    const macdSig = chart.addSeries(LineSeries, {
      color: "#ff9800", lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, paneIdx);
    const macdHistS = chart.addSeries(HistogramSeries, {
      color: T.upVol,
      priceLineVisible: false, lastValueVisible: false,
    }, paneIdx);
    macdLine.setData(ml);
    macdSig.setData(sl);
    macdHistS.setData(hl);
    try { chart.panes()[paneIdx]?.setHeight(100); } catch {}
    sg.macdLine = macdLine;
    sg.macdSignal = macdSig;
    sg.macdHist = macdHistS;
    all.push(macdLine, macdSig, macdHistS);
  }

  return sg as SG;
}

function refreshData(sg: SG, candles: Candle[]) {
  const closes = candles.map(c => c.close);
  const times  = candles.map(c => c.time);

  const ohlcData: CandlestickData<Time>[] = candles.map(c => ({
    time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
  }));

  try {
    if ("upColor" in sg.main.options()) {
      (sg.main as ISeriesApi<"Candlestick">).setData(ohlcData);
    } else if ("thinBars" in sg.main.options()) {
      (sg.main as ISeriesApi<"Bar">).setData(ohlcData);
    } else {
      (sg.main as ISeriesApi<"Line"> | ISeriesApi<"Area">).setData(
        candles.map(c => ({ time: c.time as Time, value: c.close })),
      );
    }
  } catch {}

  sg.vol?.setData(candles.map(c => ({
    time: c.time as Time, value: c.high - c.low,
    color: c.close >= c.open ? T.upVol : T.dnVol,
  })));
  sg.ma20?.setData(sma(closes, times, 20));
  sg.ma50?.setData(sma(closes, times, 50));
  sg.ema20?.setData(emaFull(closes, times, 20));
  if (sg.bbUpper && sg.bbMiddle && sg.bbLower) {
    const { upper, middle, lower } = bb(closes, times);
    sg.bbUpper.setData(upper); sg.bbMiddle.setData(middle); sg.bbLower.setData(lower);
  }
  sg.rsi?.setData(rsi(closes, times));
  if (sg.macdLine && sg.macdSignal && sg.macdHist) {
    const { line, signal, hist } = macd(closes, times);
    sg.macdLine.setData(line); sg.macdSignal.setData(signal); sg.macdHist.setData(hist);
  }
}

function liveTick(sg: SG, last: Candle, all: Candle[]) {
  const closes = all.map(c => c.close);
  const times  = all.map(c => c.time);
  const t = last.time as Time;

  try {
    const opts = sg.main.options() as Record<string, unknown>;
    if ("wickUpColor" in opts) {
      (sg.main as ISeriesApi<"Candlestick">).update({ time: t, open: last.open, high: last.high, low: last.low, close: last.close });
    } else if ("thinBars" in opts) {
      (sg.main as ISeriesApi<"Bar">).update({ time: t, open: last.open, high: last.high, low: last.low, close: last.close });
    } else {
      (sg.main as ISeriesApi<"Line"> | ISeriesApi<"Area">).update({ time: t, value: last.close });
    }
  } catch {}

  sg.vol?.update({ time: t, value: last.high - last.low, color: last.close >= last.open ? T.upVol : T.dnVol });

  // Update last indicator value only
  const n = all.length;
  if (sg.ma20 && n >= 20)  sg.ma20.update({ time: t, value: closes.slice(-20).reduce((a, b) => a + b, 0) / 20 });
  if (sg.ma50 && n >= 50)  sg.ma50.update({ time: t, value: closes.slice(-50).reduce((a, b) => a + b, 0) / 50 });

  const emaLast = (series: ISeriesApi<"Line"> | undefined, period: number) => {
    if (!series || n < period) return;
    const prev = series.data().at(-1) as LD | undefined;
    if (!prev) return;
    const k = 2 / (period + 1);
    series.update({ time: t, value: last.close * k + (prev.value as number) * (1 - k) });
  };
  emaLast(sg.ema20, 20);

  // BB — cheaply recompute last point
  if (sg.bbUpper && sg.bbMiddle && sg.bbLower && n >= 20) {
    const slice = closes.slice(-20);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / 20);
    sg.bbUpper.update({ time: t, value: mean + 2 * std });
    sg.bbMiddle.update({ time: t, value: mean });
    sg.bbLower.update({ time: t, value: mean - 2 * std });
  }

  // RSI last point
  if (sg.rsi && n >= 15) {
    const rsiData = rsi(closes, times);
    const last = rsiData.at(-1);
    if (last) sg.rsi.update(last);
  }

  // MACD last point
  if (sg.macdLine && sg.macdSignal && sg.macdHist) {
    const { line, signal, hist } = macd(closes, times);
    const ml = line.at(-1), sl = signal.at(-1), hl = hist.at(-1);
    if (ml) sg.macdLine.update(ml);
    if (sl) sg.macdSignal.update(sl);
    if (hl) sg.macdHist.update(hl);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────────────────────────

interface DrawState {
  phase:   "idle" | "trendLine1";
  p1Time?: Time;
  p1Price?: number;
}

interface Drawings {
  pricelines: Array<{ line: IPriceLine; price: number }>;
  trendlines: Array<ISeriesApi<"Line">>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const CandlestickChart = forwardRef<ChartHandle, Props>(
  function CandlestickChart(
    {
      candles,
      symbol,
      timeframe,
      chartType        = "candle",
      activeIndicators = new Set<string>(),
      activeTool       = "Cursor",
      onCrosshairMove,
    },
    ref,
  ) {
    const containerRef   = useRef<HTMLDivElement>(null);
    const chartRef       = useRef<IChartApi | null>(null);
    const sgRef          = useRef<SG | null>(null);
    const drawingsRef    = useRef<Drawings>({ pricelines: [], trendlines: [] });
    const drawStateRef   = useRef<DrawState>({ phase: "idle" });
    const onCrossRef     = useRef(onCrosshairMove);
    const toolRef        = useRef(activeTool);
    const candlesRef     = useRef(candles);
    const prevCandlesRef = useRef<Candle[]>([]);
    const prevKeyRef     = useRef("");
    const fitDoneRef     = useRef(false);

    onCrossRef.current = onCrosshairMove;
    toolRef.current    = activeTool;
    candlesRef.current = candles;

    useImperativeHandle(ref, () => ({
      clearDrawings() {
        const sg = sgRef.current;
        const chart = chartRef.current;
        if (sg) {
          for (const { line } of drawingsRef.current.pricelines) {
            try { sg.main.removePriceLine(line); } catch {}
          }
        }
        if (chart) {
          for (const ts of drawingsRef.current.trendlines) {
            try { chart.removeSeries(ts); } catch {}
          }
        }
        drawingsRef.current = { pricelines: [], trendlines: [] };
        drawStateRef.current = { phase: "idle" };
      },
    }));

    // ── Create chart (mount only) ────────────────────────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: T.bg },
          textColor:  T.text,
          fontSize:   11,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        },
        grid: {
          vertLines: { color: T.grid },
          horzLines: { color: T.grid },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: T.cross, width: 1, style: LineStyle.Solid, labelBackgroundColor: T.crossLabel },
          horzLine: { color: T.cross, width: 1, style: LineStyle.Solid, labelBackgroundColor: T.crossLabel },
        },
        rightPriceScale: {
          borderColor: T.border,
          textColor:   T.text,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor:    T.border,
          timeVisible:    true,
          secondsVisible: false,
          rightOffset:    5,
          barSpacing:     8,
          minBarSpacing:  1,
          fixLeftEdge:    false,
          fixRightEdge:   false,
        },
        handleScroll: true,
        handleScale:  true,
        width:  container.clientWidth,
        height: container.clientHeight,
      });
      chartRef.current = chart;

      // Crosshair → emit OHLC back to parent
      chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
        if (!param.point || !param.time) { onCrossRef.current?.(null); return; }
        const t = typeof param.time === "number" ? param.time as number : null;
        if (t === null) { onCrossRef.current?.(null); return; }
        const candle = candlesRef.current.find(c => c.time === t);
        onCrossRef.current?.(candle ?? null);
      });

      // Click → drawing tools
      chart.subscribeClick((param: MouseEventParams<Time>) => {
        const tool  = toolRef.current;
        const sg    = sgRef.current;
        if (!param.point || !sg) return;

        const price = sg.main.coordinateToPrice(param.point.y);
        if (price === null || price === undefined) return;

        if (tool === "Horiz. Line") {
          const pl = sg.main.createPriceLine({
            price,
            color:             T.draw,
            lineWidth:         2,
            lineStyle:         LineStyle.Dashed,
            axisLabelVisible:  true,
            title:             "",
          });
          drawingsRef.current.pricelines.push({ line: pl, price });
        } else if (tool === "Trend Line") {
          const ds = drawStateRef.current;
          if (!param.time) return;
          if (ds.phase === "idle") {
            drawStateRef.current = { phase: "trendLine1", p1Time: param.time as Time, p1Price: price };
          } else {
            if (ds.p1Time === undefined || ds.p1Price === undefined) return;
            const pts = [
              { time: ds.p1Time  as number, value: ds.p1Price },
              { time: param.time as number, value: price },
            ].sort((a, b) => a.time - b.time);
            const ts = chart.addSeries(LineSeries, {
              color: T.draw, lineWidth: 2,
              priceLineVisible: false, lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
            ts.setData(pts.map(p => ({ time: p.time as Time, value: p.value })));
            drawingsRef.current.trendlines.push(ts);
            drawStateRef.current = { phase: "idle" };
          }
        } else if (tool === "Delete") {
          // Delete nearest price line
          const sg = sgRef.current;
          if (!sg) return;
          let bestIdx = -1, bestDist = 20;
          for (let i = 0; i < drawingsRef.current.pricelines.length; i++) {
            const coord = sg.main.priceToCoordinate(drawingsRef.current.pricelines[i].price);
            if (coord !== null && coord !== undefined) {
              const d = Math.abs(coord - param.point.y);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
          }
          if (bestIdx >= 0) {
            try { sg.main.removePriceLine(drawingsRef.current.pricelines[bestIdx].line); } catch {}
            drawingsRef.current.pricelines.splice(bestIdx, 1);
            return;
          }
          // Delete nearest trend line
          let bestTlIdx = -1; bestDist = 20;
          // Trend lines: just remove last one as a fallback (can't easily hit-test)
          if (drawingsRef.current.trendlines.length > 0) {
            const last = drawingsRef.current.trendlines.length - 1;
            try { chart.removeSeries(drawingsRef.current.trendlines[last]); } catch {}
            drawingsRef.current.trendlines.splice(last, 1);
          }
          void bestTlIdx;
        }
      });

      // Disable chart scroll when drawing tool is active
      // (handled by useEffect below)

      // ResizeObserver
      const ro = new ResizeObserver(() => {
        if (!container) return;
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      });
      ro.observe(container);

      return () => {
        ro.disconnect();
        chart.remove();
        chartRef.current  = null;
        sgRef.current     = null;
        fitDoneRef.current = false;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Enable/disable scroll based on active tool ───────────────────────────
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const drawing = activeTool !== "Cursor" && activeTool !== "Crosshair" && activeTool !== "Zoom";
      chart.applyOptions({ handleScroll: !drawing, handleScale: !drawing });
    }, [activeTool]);

    // ── Rebuild or refresh series when key inputs change ─────────────────────
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !candles.length) return;

      const indKey  = [...activeIndicators].sort().join(",");
      const newKey  = `${chartType}:${indKey}:${symbol}`;
      const isRebuild = newKey !== prevKeyRef.current;

      if (isRebuild) {
        // Save visible time range before rebuild
        const range = sgRef.current ? chart.timeScale().getVisibleRange() : null;

        // Remove existing series (not drawings — drawings survive)
        if (sgRef.current) {
          for (const s of sgRef.current.all) try { chart.removeSeries(s); } catch {}
          sgRef.current = null;
        }

        // Build fresh group
        sgRef.current = buildGroup(chart, chartType, activeIndicators, candles);

        // Re-attach price lines to the new main series
        const drawn: Drawings["pricelines"] = [];
        for (const { price } of drawingsRef.current.pricelines) {
          const pl = sgRef.current.main.createPriceLine({
            price, color: T.draw, lineWidth: 2,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "",
          });
          drawn.push({ line: pl, price });
        }
        drawingsRef.current.pricelines = drawn;

        if (range) {
          try { chart.timeScale().setVisibleRange(range); } catch {}
        } else if (!fitDoneRef.current) {
          chart.timeScale().fitContent();
          fitDoneRef.current = true;
        }

        prevKeyRef.current = newKey;
      } else {
        // Detect live tick vs full reload
        const prev = prevCandlesRef.current;
        const isTickUpdate =
          prev.length > 0 &&
          candles.length === prev.length &&
          candles[0].time === prev[0]?.time;

        if (isTickUpdate) {
          liveTick(sgRef.current!, candles[candles.length - 1], candles);
        } else {
          refreshData(sgRef.current!, candles);
          if (!fitDoneRef.current && candles.length > 0) {
            chart.timeScale().fitContent();
            fitDoneRef.current = true;
          }
        }
      }

      prevCandlesRef.current = candles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, chartType, activeIndicators, symbol]);

    return (
      <div ref={containerRef} className="w-full h-full" />
    );
  },
);
