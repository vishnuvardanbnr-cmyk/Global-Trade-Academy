import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, CandlestickSeries as CandlestickSeriesDef } from "lightweight-charts";
import { cn } from "@/lib/utils";
import {
  Send, Search, BarChart2, Star, ChevronDown, ChevronRight,
  Maximize2, Settings, Pencil, Minus, Plus, TrendingUp, Hash,
} from "lucide-react";

/* ─── Static data ─────────────────────────────────────────────────── */
const ROOMS = [
  { id: "forex-general",   name: "Forex General",   members: 1240, unread: 3 },
  { id: "crypto-signals",  name: "Crypto Signals",  members: 880,  unread: 0 },
  { id: "us-stocks",       name: "US Stocks",        members: 650,  unread: 1 },
  { id: "gold-oil",        name: "Gold & Oil",       members: 430,  unread: 0 },
  { id: "index-trading",   name: "Index Trading",    members: 310,  unread: 0 },
];

type Msg = { id: number; user: string; av: string; bg: string; time: string; text: string; mention?: string };
const BASE_MSGS: Msg[] = [
  { id: 1, user: "Khaled Abd", av: "K", bg: "#14b8a6", time: "18:32", text: "I'm also optimistic about gold this week, but I don't want to buy aggressively" },
  { id: 2, user: "Victor",     av: "V", bg: "#3b82f6", time: "18:34", text: "As long as the price holds well around 4520–4525, I still prefer to look for buying opportunities rather than selling" },
  { id: 3, user: "Sara M.",    av: "S", bg: "#8b5cf6", time: "18:36", text: "EURUSD forming a nice ascending triangle on the H1, watching 1.0870 as breakout level 📈" },
  { id: 4, user: "James K.",   av: "J", bg: "#f59e0b", time: "18:40", text: "Do you think XAU will reach 4000 today?" },
  { id: 5, user: "Victor",     av: "V", bg: "#3b82f6", time: "18:41", text: "I don't think so let's wait and see", mention: "James K." },
  { id: 6, user: "Priya S.",   av: "P", bg: "#ef4444", time: "18:45", text: "DXY showing weakness, this could push EURUSD higher. My target is 1.0920" },
  { id: 7, user: "Marco R.",   av: "M", bg: "#10b981", time: "18:48", text: "Risk-off sentiment in play. USD/JPY dropped 0.4% in the last hour, watching for further downside" },
  { id: 8, user: "Ana L.",     av: "A", bg: "#f97316", time: "18:51", text: "Watching the 99.00 level on USDX — key support. A break below could accelerate selling" },
  { id: 9, user: "Khaled Abd", av: "K", bg: "#14b8a6", time: "18:54", text: "Gold holding above 2300, next resistance at 2340. Watching for a clean breakout" },
];

const SYMBOL_LIST = [
  { s: "NIFTY50",  p: "23520.70", c: "+138.10", pct: "+0.59", up: true  },
  { s: "NIFTY500", p: "22546.30", c: "+108.35", pct: "+0.48", up: true  },
  { s: "USDINR",   p: "95.28544", c: "+0.07689",pct: "+0.08", up: true  },
  { s: "SPX",      p: "7599.95",  c: "+19.90",  pct: "+0.26", up: true  },
  { s: "DJI",      p: "51078.87", c: "+46.42",  pct: "+0.09", up: true  },
  { s: "IXIC",     p: "27086.80", c: "+114.19", pct: "+0.42", up: true  },
  { s: "USDX",     p: "99.010",   c: "-0.090",  pct: "-0.09", up: false },
  { s: "EURUSD",   p: "1.16501",  c: "+0.00185",pct: "+0.16", up: true  },
  { s: "GBPUSD",   p: "1.34714",  c: "+0.00170",pct: "+0.13", up: true  },
  { s: "XAUUSD",   p: "2318.40",  c: "+6.80",   pct: "+0.29", up: true  },
  { s: "USOIL",    p: "77.32",    c: "-0.48",   pct: "-0.62", up: false },
  { s: "BTCUSD",   p: "67420.00", c: "+820.00", pct: "+1.23", up: true  },
];

const RELATED = [
  { s: "AUDUSD", name: "Australian Dollar / USD",  p: "0.711768", pct: "+0.24", up: true  },
  { s: "EURUSD", name: "Euro / US Dollar",          p: "1.16501",  pct: "+0.16", up: true  },
  { s: "GBPUSD", name: "Pound Sterling / USD",      p: "1.34714",  pct: "+0.13", up: true  },
  { s: "NZDUSD", name: "New Zealand Dollar / USD",  p: "0.59303",  pct: "-0.04", up: false },
  { s: "USDCAD", name: "US Dollar / Canada",        p: "1.38402",  pct: "0.00",  up: true  },
  { s: "USDCHF", name: "USD / Swiss Franc",         p: "0.76580",  pct: "-0.10", up: false },
  { s: "USDJPY", name: "USD / Japanese Yen",        p: "159.772",  pct: "+0.07", up: true  },
];

const TFS = ["S1","S3","M1","M15","M30","H1","D1","W1","MN1"];
const INDS = ["ƒ Indicators","MA","Bollinger","MACD","RSI","A'"];

/* ─── Candle data ─────────────────────────────────────────────────── */
const RAW_CANDLES = [
  { time: "2024-05-20", o: 99.34, h: 99.51, l: 99.10, c: 99.22 },
  { time: "2024-05-21", o: 99.22, h: 99.46, l: 98.97, c: 99.41 },
  { time: "2024-05-22", o: 99.41, h: 99.51, l: 99.18, c: 99.10 },
  { time: "2024-05-23", o: 99.10, h: 99.27, l: 98.76, c: 98.87 },
  { time: "2024-05-24", o: 98.87, h: 99.12, l: 98.60, c: 99.10 },
  { time: "2024-05-27", o: 99.10, h: 99.22, l: 98.76, c: 98.92 },
  { time: "2024-05-28", o: 98.92, h: 99.01, l: 98.63, c: 98.80 },
  { time: "2024-05-29", o: 98.80, h: 98.96, l: 98.48, c: 98.96 },
  { time: "2024-05-30", o: 98.96, h: 99.27, l: 98.78, c: 99.17 },
  { time: "2024-06-01", o: 99.17, h: 99.27, l: 98.96, c: 99.22 },
  { time: "2024-06-02", o: 99.22, h: 99.27, l: 98.96, c: 99.10 },
  { time: "2024-06-03", o: 99.10, h: 99.27, l: 98.87, c: 99.01 },
] as const;

export default function TradingChat() {
  const chartRef      = useRef<HTMLDivElement>(null);
  const msgEndRef     = useRef<HTMLDivElement>(null);
  const [tab,    setTab]    = useState<"chat"|"symbols">("chat");
  const [room,   setRoom]   = useState("forex-general");
  const [msgs,   setMsgs]   = useState<Msg[]>(BASE_MSGS);
  const [input,  setInput]  = useState("");
  const [tf,     setTf]     = useState("H1");
  const [sym,    setSym]    = useState("USDX");
  const [srch,   setSrch]   = useState("");
  const [rtab,   setRtab]   = useState<"BeeMarkets"|"Forex"|"Currency Index">("BeeMarkets");

  const active = SYMBOL_LIST.find(s => s.s === sym) ?? SYMBOL_LIST[6];

  /* ── chart ── */
  useEffect(() => {
    if (!chartRef.current) return;
    const el = chartRef.current;
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8", fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif", fontSize: 11 },
      grid:   { vertLines: { color: "rgba(148,163,184,.08)" }, horzLines: { color: "rgba(148,163,184,.08)" } },
      crosshair: { vertLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" }, horzLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,.15)" },
      timeScale: { borderColor: "rgba(148,163,184,.15)", timeVisible: true, rightOffset: 5 },
      width:  el.clientWidth,
      height: el.clientHeight,
    });
    const series = chart.addSeries(CandlestickSeriesDef, {
      upColor: "#10b981", downColor: "#ef4444",
      borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });
    series.setData(RAW_CANDLES.map(c => ({ time: c.time as any, open: c.o, high: c.h, low: c.l, close: c.c })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [sym, tf]);

  const send = useCallback(() => {
    if (!input.trim()) return;
    setMsgs(p => [...p, { id: p.length+1, user: "Trader", av: "T", bg: "#2563eb", time: new Date().toTimeString().slice(0,5), text: input.trim() }]);
    setInput("");
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  }, [input]);

  const filtered = srch ? SYMBOL_LIST.filter(s => s.s.toLowerCase().includes(srch.toLowerCase())) : SYMBOL_LIST;

  return (
    <div className="flex overflow-hidden bg-white" style={{ height: "calc(100vh - 64px)" }}>

      {/* ══════════════════ LEFT PANEL ══════════════════ */}
      <div className="w-[262px] shrink-0 border-r border-slate-200 flex flex-col bg-white">

        {/* top tab strip */}
        <div className="flex shrink-0 border-b border-slate-200">
          {(["chat","symbols"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 py-2.5 text-[12px] font-semibold capitalize transition-colors",
                tab===t ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600")}>
              {t === "chat" ? "Chats" : "Symbols"}
            </button>
          ))}
        </div>

        {tab === "chat" ? (
          <>
            {/* compact room list */}
            <div className="shrink-0 border-b border-slate-100">
              {ROOMS.map(r => (
                <button key={r.id} onClick={() => setRoom(r.id)}
                  className={cn("w-full flex items-center gap-2 px-3 py-[7px] text-left transition-all",
                    room===r.id ? "bg-blue-50 border-l-[3px] border-blue-600" : "border-l-[3px] border-transparent hover:bg-slate-50")}>
                  <Hash className={cn("h-3.5 w-3.5 shrink-0", room===r.id ? "text-blue-600" : "text-slate-400")} />
                  <span className={cn("flex-1 text-[12.5px] font-medium truncate", room===r.id ? "text-blue-700" : "text-slate-600")}>{r.name}</span>
                  {r.unread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{r.unread}</span>
                  )}
                </button>
              ))}
            </div>

            {/* section label */}
            <div className="px-3 py-1.5 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {ROOMS.find(r => r.id === room)?.name}
              </span>
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">
              {msgs.map(m => (
                <div key={m.id} className="flex gap-2 group px-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5"
                    style={{ background: m.bg }}>{m.av}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="text-[12px] font-semibold text-slate-800">{m.user}</span>
                      <span className="text-[10px] text-slate-400">{m.time}</span>
                    </div>
                    <p className="text-[12.5px] text-slate-600 leading-snug break-words">
                      {m.mention && <span className="text-blue-600 font-semibold">@{m.mention} </span>}
                      {m.text}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            {/* input */}
            <div className="shrink-0 border-t border-slate-200 p-2">
              <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && send()}
                  placeholder="Type here..."
                  className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-slate-400 text-slate-700" />
                <button onClick={send}
                  className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors shrink-0">
                  <Send className="h-3 w-3 text-white" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* symbol search */}
            <div className="p-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={srch} onChange={e => setSrch(e.target.value)} placeholder="Search…"
                  className="w-full h-7 pl-7 pr-2 text-[12px] bg-slate-100 rounded-md outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            {/* header row */}
            <div className="grid grid-cols-3 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100 shrink-0">
              <span>Symbol</span><span className="text-right">Last</span><span className="text-right">%Chg</span>
            </div>
            {/* symbol list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.map(s => (
                <button key={s.s} onClick={() => { setSym(s.s); setTab("chat"); }}
                  className={cn("w-full grid grid-cols-3 px-3 py-1.5 hover:bg-slate-50 transition-colors text-left",
                    sym===s.s && "bg-blue-50")}>
                  <span className="text-[12px] font-semibold text-slate-800">{s.s}</span>
                  <span className="text-[11.5px] text-slate-600 text-right">{s.p}</span>
                  <span className={cn("text-[11px] font-bold text-right", s.up ? "text-emerald-600" : "text-red-500")}>{s.pct}%</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════ CHART PANEL ══════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 bg-white overflow-hidden">

        {/* toolbar */}
        <div className="h-9 border-b border-slate-200 flex items-center gap-0.5 px-2 shrink-0 overflow-x-auto bg-white">
          <button className="flex items-center gap-1 px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 rounded transition-colors whitespace-nowrap">
            <BarChart2 className="h-3.5 w-3.5" /> Charts <ChevronDown className="h-3 w-3" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

          {/* drawing mini-tools */}
          {([Search, Pencil, Minus, Plus] as const).map((Icon, i) => (
            <button key={i} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

          {/* timeframes */}
          {TFS.map(t => (
            <button key={t} onClick={() => setTf(t)}
              className={cn("px-1.5 py-0.5 text-[11px] font-semibold rounded transition-all whitespace-nowrap",
                tf===t ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}>
              {t}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />

          {/* indicators */}
          {INDS.map((ind, i) => (
            <button key={ind}
              className={cn("px-1.5 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap",
                i===0 ? "text-slate-500 font-medium hover:bg-slate-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100")}>
              {ind}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 transition-colors"><Maximize2 className="h-3.5 w-3.5" /></button>
            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 transition-colors"><Settings className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* OHLCV info bar */}
        <div className="h-6 border-b border-slate-100 flex items-center gap-3 px-3 shrink-0 bg-slate-50/60 overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">{active.s} · {tf} · Unadjusted</span>
          <span className="text-[10.5px] text-slate-400 whitespace-nowrap">O <span className="text-slate-600">98.990</span></span>
          <span className="text-[10.5px] text-slate-400 whitespace-nowrap">H <span className="text-slate-600">99.020</span></span>
          <span className="text-[10.5px] text-slate-400 whitespace-nowrap">L <span className="text-slate-600">98.970</span></span>
          <span className="text-[10.5px] text-slate-400 whitespace-nowrap">C <span className={active.up ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>99.010</span></span>
          <span className="text-[10.5px] text-slate-400 whitespace-nowrap">V <span className={active.up ? "text-emerald-600" : "text-red-500"}>241 +0.010 (+0.01%)</span></span>
        </div>

        {/* chart canvas */}
        <div ref={chartRef} className="flex-1 min-h-0" />

        {/* bottom bar */}
        <div className="h-7 border-t border-slate-200 flex items-center gap-3 px-3 shrink-0 bg-white overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{active.s} · {tf}</span>
          </div>
          {["EURUSD · H1","XAUUSD · H1"].map(l => (
            <button key={l} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap">{l}</button>
          ))}
          <button className="text-[11px] text-blue-600 font-medium whitespace-nowrap">+</button>
          <div className="ml-auto flex items-center gap-3 text-[10.5px] text-slate-400 shrink-0">
            <span className="whitespace-nowrap">Trade</span>
            <span className="whitespace-nowrap">History</span>
            <button className="text-blue-600 font-medium whitespace-nowrap">Open Account</button>
          </div>
        </div>
      </div>

      {/* ══════════════════ RIGHT INFO PANEL ══════════════════ */}
      <div className="w-[272px] shrink-0 bg-white flex flex-col overflow-y-auto">

        {/* Symbol header */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] text-slate-400">{active.s} (US Dollar Index)</span>
            <Star className="h-3.5 w-3.5 text-slate-300 hover:text-amber-400 cursor-pointer transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-extrabold text-slate-900 leading-none">{active.p}</span>
            <div>
              <span className={cn("text-[13px] font-bold", active.up ? "text-emerald-600" : "text-red-500")}>
                {active.c} ({active.pct}%)
              </span>
            </div>
          </div>
          <p className="text-[10.5px] text-slate-400 mt-0.5">Market Hours</p>
          {/* sub-tabs */}
          <div className="flex gap-3 mt-2.5 border-b border-slate-200 -mx-0.5">
            {(["BeeMarkets","Forex","Currency Index"] as const).map(t => (
              <button key={t} onClick={() => setRtab(t)}
                className={cn("pb-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap",
                  rtab===t ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* OHLCV grid */}
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {[
              { l: "Open",        v: "99.090",  c: "" },
              { l: "High",        v: "99.140",  c: "text-emerald-600" },
              { l: "Ask",         v: "99.090",  c: "text-emerald-600" },
              { l: "Prev. Close", v: "99.100",  c: "" },
              { l: "Low",         v: "98.960",  c: "text-red-500" },
              { l: "Bid",         v: "99.010",  c: "" },
            ].map(item => (
              <div key={item.l}>
                <p className="text-[9.5px] text-slate-400 leading-none mb-0.5">{item.l}</p>
                <p className={cn("text-[12.5px] font-semibold", item.c || "text-slate-700")}>{item.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Performance */}
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-slate-700">Performance</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
            {[
              { l: "Last 5 Days",   v: "-0.04%",  up: false },
              { l: "Last 1 Month",  v: "+1.01%",  up: true  },
              { l: "Last 6 Months", v: "-0.31%",  up: false },
              { l: "Last 1 Year",   v: "-0.32%",  up: false },
              { l: "Last 5 Years",  v: "+10.16%", up: true  },
              { l: "Since Listing", v: "+5.01%",  up: true  },
            ].map(item => (
              <div key={item.l}>
                <p className="text-[9px] text-slate-400 leading-tight">{item.l}</p>
                <p className={cn("text-[11.5px] font-bold", item.up ? "text-emerald-600" : "text-red-500")}>{item.v}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-x-2 mt-2">
            {[
              { l: "52wk High",      v: "109.980",  c: ""           },
              { l: "52wk Low",       v: "95.330",   c: ""           },
              { l: "Largest Decline",v: "16.24%",   c: "text-red-500" },
            ].map(item => (
              <div key={item.l}>
                <p className="text-[9px] text-slate-400">{item.l}</p>
                <p className={cn("text-[11.5px] font-semibold", item.c || "text-slate-700")}>{item.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Related symbols */}
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
          <p className="text-[12px] font-bold text-slate-700 mb-1.5">Related Symbols</p>
          <div className="grid grid-cols-3 text-[9.5px] font-bold text-slate-400 uppercase border-b border-slate-100 pb-1 mb-1">
            <span>Symbol</span><span className="col-span-1">Name</span><span className="text-right">%Chg.</span>
          </div>
          {RELATED.map(r => (
            <div key={r.s} className="grid grid-cols-3 py-1 hover:bg-slate-50 cursor-pointer rounded -mx-1 px-1 transition-colors">
              <span className="text-[11px] font-semibold text-slate-800">{r.s}</span>
              <span className="text-[10px] text-slate-400 truncate">{r.name}</span>
              <span className={cn("text-[11px] font-bold text-right", r.up ? "text-emerald-600" : "text-red-500")}>{r.pct}%</span>
            </div>
          ))}
        </div>

        {/* Order entry */}
        <div className="px-4 py-3 mt-auto shrink-0">
          <div className="flex rounded-lg overflow-hidden border border-slate-200 mb-2.5 text-[11.5px]">
            {["Market","Limit","Stop"].map((t,i) => (
              <button key={t} className={cn("flex-1 py-1.5 font-semibold transition-colors",
                i===0 ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100")}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[13px] transition-colors">
              Buy<br /><span className="text-[10.5px] font-normal opacity-90">{active.p}</span>
            </button>
            <button className="py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-[13px] transition-colors">
              Sell<br /><span className="text-[10.5px] font-normal opacity-90">{active.p}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
