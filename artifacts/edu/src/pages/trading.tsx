import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries as CandlestickSeriesDef } from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Trading() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
    });

    const series = chart.addSeries(CandlestickSeriesDef, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const data = [
      { time: '2024-01-01' as const, open: 60000, high: 62000, low: 59000, close: 61500 },
      { time: '2024-01-02' as const, open: 61500, high: 63000, low: 61000, close: 62800 },
      { time: '2024-01-03' as const, open: 62800, high: 65000, low: 62000, close: 64500 },
      { time: '2024-01-04' as const, open: 64500, high: 64800, low: 63000, close: 63200 },
      { time: '2024-01-05' as const, open: 63200, high: 64000, low: 62500, close: 63800 },
      { time: '2024-01-06' as const, open: 63800, high: 66000, low: 63500, close: 65200 },
      { time: '2024-01-07' as const, open: 65200, high: 67500, low: 64800, close: 67000 },
      { time: '2024-01-08' as const, open: 67000, high: 68000, low: 65000, close: 65800 },
      { time: '2024-01-09' as const, open: 65800, high: 66500, low: 64500, close: 66200 },
      { time: '2024-01-10' as const, open: 66200, high: 68800, low: 66000, close: 68500 },
    ];

    series.setData(data);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Markets</h1>
        <p className="text-muted-foreground">Real-time charts and market analysis.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4 flex-1 min-h-[600px]">
        <Card className="md:col-span-3 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle>BTC/USD - Bitcoin</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 px-2 pb-2">
            <div ref={chartContainerRef} className="w-full h-full min-h-[500px]" />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Watchlist</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-1">
              {[
                { symbol: "BTC/USD", price: "$63,800.00", up: true },
                { symbol: "ETH/USD", price: "$3,450.20", up: true },
                { symbol: "SOL/USD", price: "$142.10", up: false },
                { symbol: "EUR/USD", price: "1.0842", up: true },
                { symbol: "GBP/USD", price: "1.2710", up: false },
                { symbol: "GOLD", price: "$2,318.40", up: true },
              ].map(({ symbol, price, up }) => (
                <div key={symbol} className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
                  <span className="font-semibold text-sm">{symbol}</span>
                  <span className={`text-sm font-mono ${up ? "text-green-500" : "text-red-500"}`}>{price}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}