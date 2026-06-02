import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries as CandlestickSeriesDef } from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const watchlistItems = [
  { symbol: "BTC/USD", name: "Bitcoin", price: "$67,420", change: "+3.12%", up: true, market: "Crypto" },
  { symbol: "ETH/USD", name: "Ethereum", price: "$3,840", change: "+1.87%", up: true, market: "Crypto" },
  { symbol: "EUR/USD", name: "Euro/Dollar", price: "1.0842", change: "-0.14%", up: false, market: "Forex" },
  { symbol: "GLD", name: "Gold", price: "$2,180", change: "+0.72%", up: true, market: "Commodity" },
  { symbol: "SPX500", name: "S&P 500", price: "5,248", change: "+0.44%", up: true, market: "Index" },
  { symbol: "GBP/USD", name: "Pound/Dollar", price: "1.2674", change: "-0.08%", up: false, market: "Forex" },
];

const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

export default function Trading() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeSymbol, setActiveSymbol] = useState("BTC/USD");
  const [activeTimeframe, setActiveTimeframe] = useState("1D");

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.04)" },
        horzLines: { color: "rgba(0,0,0,0.04)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 420,
      crosshair: {
        vertLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" },
        horzLine: { color: "#2563eb", labelBackgroundColor: "#2563eb" },
      },
      rightPriceScale: {
        borderColor: "rgba(0,0,0,0.06)",
      },
      timeScale: {
        borderColor: "rgba(0,0,0,0.06)",
        timeVisible: true,
      },
    });

    const series = chart.addSeries(CandlestickSeriesDef, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    const data = [
      { time: "2024-01-01" as const, open: 60000, high: 62000, low: 59000, close: 61500 },
      { time: "2024-01-02" as const, open: 61500, high: 63000, low: 61000, close: 62800 },
      { time: "2024-01-03" as const, open: 62800, high: 65000, low: 62000, close: 64500 },
      { time: "2024-01-04" as const, open: 64500, high: 64800, low: 63000, close: 63200 },
      { time: "2024-01-05" as const, open: 63200, high: 64000, low: 62500, close: 63800 },
      { time: "2024-01-06" as const, open: 63800, high: 66000, low: 63500, close: 65200 },
      { time: "2024-01-07" as const, open: 65200, high: 67500, low: 64800, close: 67000 },
      { time: "2024-01-08" as const, open: 67000, high: 68000, low: 65000, close: 65800 },
      { time: "2024-01-09" as const, open: 65800, high: 66500, low: 64500, close: 66200 },
      { time: "2024-01-10" as const, open: 66200, high: 68800, low: 66000, close: 68500 },
      { time: "2024-01-11" as const, open: 68500, high: 70000, low: 67500, close: 69800 },
      { time: "2024-01-12" as const, open: 69800, high: 72000, low: 69000, close: 71500 },
      { time: "2024-01-13" as const, open: 71500, high: 73000, low: 70000, close: 67200 },
      { time: "2024-01-14" as const, open: 67200, high: 68000, low: 65000, close: 66500 },
      { time: "2024-01-15" as const, open: 66500, high: 67800, low: 65500, close: 67420 },
    ];

    series.setData(data);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [activeSymbol, activeTimeframe]);

  const activeItem = watchlistItems.find((w) => w.symbol === activeSymbol) ?? watchlistItems[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Markets</h1>
          <p className="text-sm text-muted-foreground">Professional charts and real-time market data</p>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add to Watchlist
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Chart panel */}
        <Card className="lg:col-span-3 shadow-xs border-border">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">{activeItem.symbol}</h2>
                    <Badge variant="secondary" className="text-xs">{activeItem.market}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xl font-extrabold text-foreground">{activeItem.price}</span>
                    <span className={cn(
                      "flex items-center gap-0.5 text-sm font-semibold",
                      activeItem.up ? "text-emerald-600" : "text-red-500"
                    )}>
                      {activeItem.up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      {activeItem.change}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Timeframe selector */}
                <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
                  {timeframes.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setActiveTimeframe(tf)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                        activeTimeframe === tf
                          ? "bg-white text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* OHLCV row */}
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              {[
                { label: "Open", value: "$66,500" },
                { label: "High", value: "$68,800" },
                { label: "Low", value: "$65,500" },
                { label: "Close", value: "$67,420" },
                { label: "Volume", value: "$18.4B" },
              ].map((stat) => (
                <div key={stat.label}>
                  <span className="font-medium">{stat.label} </span>
                  <span className="text-foreground font-semibold">{stat.value}</span>
                </div>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0 pt-2">
            <div ref={chartContainerRef} className="w-full" style={{ height: "420px" }} />
          </CardContent>
        </Card>

        {/* Watchlist */}
        <Card className="shadow-xs border-border flex flex-col">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm font-semibold">Watchlist</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="divide-y divide-border">
              {watchlistItems.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => setActiveSymbol(item.symbol)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                    activeSymbol === item.symbol
                      ? "bg-primary/5 border-l-2 border-primary"
                      : "hover:bg-secondary/50 border-l-2 border-transparent"
                  )}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.symbol}</p>
                    <p className="text-xs text-muted-foreground">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{item.price}</p>
                    <p className={cn(
                      "text-xs font-semibold flex items-center justify-end gap-0.5",
                      item.up ? "text-emerald-600" : "text-red-500"
                    )}>
                      {item.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {item.change}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Market Cap", value: "$2.37T", sub: "Total crypto", up: true, delta: "+2.1%" },
          { label: "24h Volume", value: "$94.8B", sub: "Global trading", up: true, delta: "+5.4%" },
          { label: "BTC Dominance", value: "54.2%", sub: "Market share", up: false, delta: "-0.3%" },
          { label: "Fear & Greed", value: "72", sub: "Greed", up: true, delta: "Bullish" },
        ].map((stat) => (
          <Card key={stat.label} className="shadow-xs border-border">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
              <div className="text-2xl font-extrabold text-foreground">{stat.value}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-muted-foreground">{stat.sub}</span>
                <span className={cn("text-xs font-semibold", stat.up ? "text-emerald-600" : "text-red-500")}>
                  {stat.delta}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
