import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries as CandlestickSeriesDef } from "lightweight-charts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpRight, ArrowDownRight, Send, Search, BarChart2, TrendingUp,
  TrendingDown, Hash, Star, Users, MessageSquare, ChevronDown, MoreHorizontal,
  Circle, Maximize2, RefreshCw, Settings, Bell, Volume2, Pencil, Minus,
} from "lucide-react";

/* ─── Mock chat data ─────────────────────────────────────────────── */
const ROOMS = [
  { id: "forex-general", name: "Forex General", members: 1240, unread: 3, active: true },
  { id: "crypto-signals", name: "Crypto Signals", members: 880, unread: 0, active: false },
  { id: "us-stocks", name: "US Stocks", members: 650, unread: 1, active: false },
  { id: "gold-oil", name: "Gold & Oil", members: 430, unread: 0, active: false },
  { id: "index-trading", name: "Index Trading", members: 310, unread: 0, active: false },
];

const INIT_MESSAGES = [
  { id: 1, user: "Khaled Abd", avatar: "KA", avatarBg: "bg-teal-500", time: "18:32", text: "I'm also optimistic about gold this week, but I don't want to buy aggressively", mention: null },
  { id: 2, user: "Victor", avatar: "VT", avatarBg: "bg-blue-500", time: "18:34", text: "As long as the price holds well around 4520–4525, I still prefer to look for buying opportunities rather than selling", mention: null },
  { id: 3, user: "Sara M.", avatar: "SM", avatarBg: "bg-violet-500", time: "18:36", text: "EURUSD forming a nice ascending triangle on the H1, watching 1.0870 as breakout level 📈", mention: null },
  { id: 4, user: "James K.", avatar: "JK", avatarBg: "bg-amber-500", time: "18:40", text: "Do you think XAU will reach 4000 today?", mention: null },
  { id: 5, user: "Victor", avatar: "VT", avatarBg: "bg-blue-500", time: "18:41", text: "@James K. I don't think so, let's wait and see", mention: "James K." },
  { id: 6, user: "Priya S.", avatar: "PS", avatarBg: "bg-rose-500", time: "18:45", text: "DXY showing weakness, this could push EURUSD higher. My target is 1.0920", mention: null },
  { id: 7, user: "Marco R.", avatar: "MR", avatarBg: "bg-emerald-500", time: "18:48", text: "Risk-off sentiment in play. USD/JPY dropped 0.4% in the last hour, watching for further downside", mention: null },
];

const SYMBOLS = [
  { symbol: "NIFTY50", price: "23520.70", change: "+138.10", pct: "+0.59%", up: true },
  { symbol: "NIFTY500", price: "22546.30", change: "+108.35", pct: "+0.48%", up: true },
  { symbol: "USDINR", price: "95.28544", change: "+0.07689", pct: "+0.08%", up: true },
  { symbol: "SPX", price: "7599.95", change: "+19.90", pct: "+0.26%", up: true },
  { symbol: "DJI", price: "51078.87", change: "+46.42", pct: "+0.09%", up: true },
  { symbol: "IXIC", price: "27086.80", change: "+114.19", pct: "+0.42%", up: true },
  { symbol: "USDX", price: "99.010", change: "-0.090", pct: "-0.09%", up: false },
  { symbol: "EURUSD", price: "1.16501", change: "+0.00185", pct: "+0.16%", up: true },
  { symbol: "GBPUSD", price: "1.34714", change: "+0.00170", pct: "+0.13%", up: true },
];

const RELATED = [
  { symbol: "AUDUSD", name: "Australian Dollar / U...", last: "0.711768", pct: "+0.24%", up: true },
  { symbol: "EURUSD", name: "Euro / US Dollar", last: "1.16501", pct: "+0.16%", up: true },
  { symbol: "GBPUSD", name: "Pound Sterling / US ...", last: "1.34714", pct: "+0.13%", up: true },
  { symbol: "NZDUSD", name: "New Zealand Dollar ...", last: "0.59303", pct: "-0.04%", up: false },
  { symbol: "USDCAD", name: "US Dollar / Canada...", last: "1.38402", pct: "0.00%", up: true },
  { symbol: "USDCHF", name: "US Dollar / Swiss Fr...", last: "0.76580", pct: "-0.10%", up: false },
  { symbol: "USDJPY", name: "US Dollar / Japanes...", last: "159.772", pct: "+0.07%", up: true },
];

const TF = ["S1", "S3", "M1", "M15", "M30", "H1", "D1", "W1", "MN1"];
const INDICATORS = ["MA", "Bollinger", "MACD", "RSI"];

export default function TradingChat() {
  const chartRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [leftTab, setLeftTab] = useState<"chat" | "symbols">("chat");
  const [activeRoom, setActiveRoom] = useState("forex-general");
  const [messages, setMessages] = useState(INIT_MESSAGES);
  const [msg, setMsg] = useState("");
  const [activeTf, setActiveTf] = useState("H1");
  const [activeSymbol, setActiveSymbol] = useState("USDX");
  const [searchSym, setSearchSym] = useState("");
  const [rightTab, setRightTab] = useState<"BeeMarkets" | "Forex" | "Currency Index">("BeeMarkets");

  const symData = SYMBOLS.find((s) => s.symbol === activeSymbol) ?? SYMBOLS[6];

  /* ── Chart ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.04)" },
        horzLines: { color: "rgba(0,0,0,0.04)" },
      },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      crosshair: {
        vertLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" },
        horzLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" },
      },
      rightPriceScale: { borderColor: "rgba(0,0,0,0.06)" },
      timeScale: { borderColor: "rgba(0,0,0,0.06)", timeVisible: true },
    });

    const series = chart.addSeries(CandlestickSeriesDef, {
      upColor: "#10b981", downColor: "#ef4444",
      borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });

    const data = [
      { time: "2024-05-26" as const, open: 98.990, high: 99.140, low: 98.870, close: 99.010 },
      { time: "2024-05-27" as const, open: 99.010, high: 99.380, low: 98.900, close: 99.220 },
      { time: "2024-05-28" as const, open: 99.220, high: 99.511, low: 98.950, close: 99.100 },
      { time: "2024-05-29" as const, open: 99.100, high: 99.266, low: 98.780, close: 98.870 },
      { time: "2024-05-30" as const, open: 98.870, high: 99.118, low: 98.600, close: 99.010 },
      { time: "2024-06-01" as const, open: 99.010, high: 99.217, low: 98.760, close: 98.920 },
      { time: "2024-06-02" as const, open: 98.920, high: 99.010, low: 98.627, close: 98.800 },
    ];

    series.setData(data);
    chart.timeScale().fitContent();

    const resize = () => {
      if (chartRef.current)
        chart.applyOptions({ width: chartRef.current.clientWidth, height: chartRef.current.clientHeight });
    };
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.remove(); };
  }, [activeSymbol, activeTf]);

  /* ── Send message ─────────────────────────────────────────────── */
  const sendMessage = () => {
    if (!msg.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, user: "You", avatar: "YO", avatarBg: "bg-primary", time: "now", text: msg.trim(), mention: null },
    ]);
    setMsg("");
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const filteredSymbols = SYMBOLS.filter((s) =>
    !searchSym || s.symbol.toLowerCase().includes(searchSym.toLowerCase())
  );

  const room = ROOMS.find((r) => r.id === activeRoom)!;

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-4 md:-mx-6 lg:-mx-8 overflow-hidden bg-background">
      {/* ═══ LEFT PANEL ═══════════════════════════════════════════ */}
      <aside className="w-[280px] shrink-0 border-r border-border flex flex-col bg-white">
        {/* Tab header */}
        <div className="flex border-b border-border shrink-0">
          {(["chat", "symbols"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setLeftTab(t)}
              className={cn(
                "flex-1 py-3 text-sm font-medium capitalize transition-colors",
                leftTab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "chat" ? "Chats" : "Symbols"}
            </button>
          ))}
        </div>

        {leftTab === "chat" ? (
          <>
            {/* Room list */}
            <div className="border-b border-border shrink-0">
              {ROOMS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActiveRoom(r.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                    activeRoom === r.id ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-secondary border-l-2 border-transparent"
                  )}
                >
                  <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.members.toLocaleString()} members</p>
                  </div>
                  {r.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {r.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
                <Users className="h-3 w-3" /> {room.name}
              </div>
              {messages.map((m) => (
                <div key={m.id} className="flex gap-2.5 group">
                  <div className={`w-8 h-8 rounded-full ${m.avatarBg} flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5`}>
                    {m.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-foreground">{m.user}</span>
                      <span className="text-[10px] text-muted-foreground">{m.time}</span>
                    </div>
                    <p className="text-[13px] text-foreground leading-snug break-words">
                      {m.mention && (
                        <span className="text-primary font-medium">@{m.mention} </span>
                      )}
                      {m.text}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border shrink-0">
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                <input
                  type="text"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type here..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={sendMessage}
                  className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors"
                >
                  <Send className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Symbol search */}
            <div className="p-3 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchSym}
                  onChange={(e) => setSearchSym(e.target.value)}
                  placeholder="Search symbol..."
                  className="w-full h-8 pl-8 pr-3 text-sm bg-secondary rounded-lg border border-transparent focus:border-primary focus:bg-white outline-none transition-all"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-3 py-2 border-b border-border text-xs font-medium shrink-0">
              {["All", "Trending"].map((t) => (
                <button key={t} className="px-2.5 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors first:bg-primary first:text-white">
                  {t}
                </button>
              ))}
            </div>

            {/* Symbol rows */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-b border-border">
                <span>Symbol</span><span className="text-right">Last</span><span className="text-right">%Chg.</span>
              </div>
              {filteredSymbols.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => { setActiveSymbol(s.symbol); setLeftTab("chat"); }}
                  className={cn(
                    "w-full grid grid-cols-3 px-3 py-2.5 text-left hover:bg-secondary transition-colors",
                    activeSymbol === s.symbol && "bg-primary/5"
                  )}
                >
                  <span className="text-[12px] font-semibold text-foreground">{s.symbol}</span>
                  <span className="text-[12px] text-foreground text-right">{s.price}</span>
                  <span className={cn("text-[11px] font-medium text-right", s.up ? "text-emerald-600" : "text-red-500")}>{s.pct}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* ═══ CHART PANEL ═══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chart toolbar */}
        <div className="h-10 border-b border-border flex items-center gap-1 px-2 bg-white shrink-0 overflow-x-auto">
          {/* Charts label */}
          <button className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground rounded hover:bg-secondary whitespace-nowrap">
            <BarChart2 className="h-3.5 w-3.5" /> Charts <ChevronDown className="h-3 w-3" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Drawing tools */}
          {[Search, Pencil, Minus, Circle].map((Icon, i) => (
            <button key={i} className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />

          {/* Timeframes */}
          {TF.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTf(tf)}
              className={cn(
                "px-1.5 py-0.5 text-xs font-medium rounded transition-all whitespace-nowrap",
                activeTf === tf ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {tf}
            </button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />

          {/* Indicators */}
          <span className="text-xs text-muted-foreground px-1 whitespace-nowrap">ƒ Indicators</span>
          {INDICATORS.map((ind) => (
            <button key={ind} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors whitespace-nowrap">
              {ind}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1">
            <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground"><Maximize2 className="h-3.5 w-3.5" /></button>
            <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground"><Settings className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* OHLCV line */}
        <div className="h-7 border-b border-border flex items-center gap-3 px-3 bg-white/80 text-[11px] shrink-0 overflow-x-auto">
          <span className="font-semibold text-foreground whitespace-nowrap">{symData.symbol} · H1 · Unadjusted</span>
          <span className="text-muted-foreground whitespace-nowrap">O = <span className="text-foreground">98.990</span></span>
          <span className="text-muted-foreground whitespace-nowrap">H = <span className="text-foreground">99.020</span></span>
          <span className="text-muted-foreground whitespace-nowrap">L = <span className="text-foreground">98.970</span></span>
          <span className="text-muted-foreground whitespace-nowrap">C = <span className={symData.up ? "text-emerald-600" : "text-red-500"}>99.010</span></span>
          <span className="text-muted-foreground whitespace-nowrap">V = <span className={symData.up ? "text-emerald-600" : "text-red-500"}>241 +0.010 (+0.01%)</span></span>
        </div>

        {/* Chart */}
        <div ref={chartRef} className="flex-1 min-h-0" />

        {/* Status bar */}
        <div className="h-8 border-t border-border flex items-center gap-4 px-3 bg-white text-[11px] text-muted-foreground shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-foreground whitespace-nowrap">{symData.symbol} · H1</span>
          </div>
          {["EURUSD · H1", "XAUUSD · H1"].map((s) => (
            <button key={s} className="whitespace-nowrap hover:text-foreground transition-colors">{s}</button>
          ))}
          <button className="text-primary">+</button>
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            <span className="whitespace-nowrap">Trade</span>
            <span className="whitespace-nowrap">History</span>
            <button className="text-primary whitespace-nowrap">Open Account</button>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT INFO PANEL ═══════════════════════════════════════ */}
      <aside className="w-[300px] shrink-0 border-l border-border bg-white flex flex-col overflow-y-auto">
        {/* Symbol header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-xs text-muted-foreground">{symData.symbol} (US Dollar Index)</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold text-foreground">{symData.price}</span>
                <span className={cn("text-sm font-semibold", symData.up ? "text-emerald-600" : "text-red-500")}>
                  {symData.change} ({symData.pct})
                </span>
              </div>
            </div>
            <Star className="h-4 w-4 text-muted-foreground hover:text-amber-400 cursor-pointer shrink-0 mt-1" />
          </div>
          <p className="text-xs text-muted-foreground">Market Hours</p>

          {/* Tabs */}
          <div className="flex gap-2 mt-3 border-b border-border">
            {(["BeeMarkets", "Forex", "Currency Index"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                className={cn(
                  "pb-2 text-xs font-medium transition-colors whitespace-nowrap",
                  rightTab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* OHLCV */}
        <div className="p-4 border-b border-border">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {[
              { label: "Open", value: "99.090" },
              { label: "High", value: "99.140", color: "text-emerald-600" },
              { label: "Ask", value: "99.090", color: "text-emerald-600" },
              { label: "Prev. Close", value: "99.100" },
              { label: "Low", value: "98.960", color: "text-red-500" },
              { label: "Bid", value: "99.010" },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className={cn("text-sm font-semibold", item.color ?? "text-foreground")}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Performance */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Performance</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Last 5 Days", value: "-0.04%", up: false },
              { label: "Last 1 Month", value: "+1.01%", up: true },
              { label: "Last 6 Months", value: "-0.31%", up: false },
              { label: "Last 1 Year", value: "-0.32%", up: false },
              { label: "Last 5 Years", value: "+10.16%", up: true },
              { label: "Since Listing", value: "+5.01%", up: true },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[9px] text-muted-foreground leading-tight">{item.label}</p>
                <p className={cn("text-xs font-bold", item.up ? "text-emerald-600" : "text-red-500")}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              { label: "52wk High", value: "109.980" },
              { label: "52wk Low", value: "95.330" },
              { label: "Largest Decline", value: "16.24%", color: "text-red-500" },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className={cn("text-xs font-semibold", item.color ?? "text-foreground")}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Related symbols */}
        <div className="p-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground mb-3">Related Symbols</p>
          <div className="space-y-0">
            <div className="grid grid-cols-3 text-[10px] font-semibold text-muted-foreground uppercase pb-1">
              <span>Symbol</span><span className="col-span-1 truncate">Name</span><span className="text-right">%Chg.</span>
            </div>
            {RELATED.map((r) => (
              <div key={r.symbol} className="grid grid-cols-3 py-1.5 hover:bg-secondary/50 cursor-pointer rounded px-1 transition-colors -mx-1">
                <span className="text-[11px] font-semibold text-foreground">{r.symbol}</span>
                <span className="text-[10px] text-muted-foreground truncate col-span-1">{r.name}</span>
                <span className={cn("text-[11px] font-semibold text-right", r.up ? "text-emerald-600" : "text-red-500")}>{r.pct}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Order entry */}
        <div className="p-4 mt-auto">
          <div className="flex rounded-lg overflow-hidden border border-border mb-3">
            {["Market", "Limit", "Stop"].map((t, i) => (
              <button key={t} className={cn("flex-1 py-1.5 text-xs font-medium transition-colors", i === 0 ? "bg-foreground text-white" : "text-muted-foreground hover:bg-secondary")}>
                {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors">
              Buy<br /><span className="text-xs font-normal opacity-90">{symData.price}</span>
            </button>
            <button className="py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors">
              Sell<br /><span className="text-xs font-normal opacity-90">{symData.price}</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
