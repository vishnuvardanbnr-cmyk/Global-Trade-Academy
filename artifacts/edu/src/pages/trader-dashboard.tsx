import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { BrokerServerSearch } from "@/components/ui/broker-server-search";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Settings2, Zap, History, Server,
  Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Activity,
  Users, ChevronDown, ChevronUp,
} from "lucide-react";

type TraderProfile = {
  id: number;
  userId: string;
  displayName: string;
  bio: string | null;
  strategy: string | null;
  markets: string[];
  riskScore: number | null;
  roi: number;
  winRate: number;
  totalTrades: number;
  followers: number;
  verified: boolean;
  status: string;
  avatarUrl: string | null;
};

type MasterAccount = {
  id: number;
  type: string;
  label: string;
  status: string;
  lastError: string | null;
  apiKeyHint: string | null;
  mt5Login: string | null;
  mt5Server: string | null;
};

type TradeSignal = {
  id: number;
  traderId: number;
  symbol: string;
  market: string;
  action: string;
  orderType: string;
  price: number | null;
  quantity: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  status: string;
  notes: string | null;
  createdAt: string;
};

type SignalCopier = {
  copyTradeId: number; accountLabel: string; accountType: string;
  executedPrice: number | null; quantity: number | null;
  pnl: number | null; brokerOrderId: string | null;
  executedAt: string; status: string;
};

type OpenPositionCopier = {
  copyTradeId: number; accountLabel: string; accountType: string;
  executedPrice: number | null; quantity: number | null;
  brokerOrderId: string | null; executedAt: string; status: string;
};
type OpenPosition = {
  signalId: number; symbol: string; market: string;
  action: "buy" | "sell"; quantity: number;
  signalPrice: number | null; createdAt: string;
  copiers: OpenPositionCopier[];
};

type ClosedPosition = {
  symbol: string; market: string; action: string;
  openedAt: string; closedAt: string;
  openPrice: number; closePrice: number; returnPct: number;
};
type CopierPnl = {
  copyAccountId: number; accountLabel: string; accountType: string;
  totalPnl: number | null; tradeCount: number; winCount: number; failCount: number;
};
type Subscriber = {
  subId: number; userId: string; displayName: string;
  accountLabel: string; accountType: string | null;
  lotMultiplier: number; currentPnl: number | null;
  allocatedAmount: number | null; maxAmount: number | null;
  status: string; since: string;
};
type TraderDashboard = {
  stats: { totalTrades: number; winRate: number; roi: number; totalPnl: number; closedCount: number; followers: number };
  closedPositions: ClosedPosition[];
  copierPnl: CopierPnl[];
  subscribers: Subscriber[];
};
type CopierTrade = {
  symbol: string; market: string; side: string;
  openPrice: number | null; closePrice: number | null;
  lots: number | null; pnl: number | null; returnPct: number | null;
  status: string; orderId: string | null;
  openTime: string; closeTime: string | null; durationMs: number | null;
  accountLabel: string; accountType: string | null; displayName: string;
};

const MARKETS = ["forex", "crypto", "stocks", "commodities"];

function acctBadge(type: string | null) {
  if (!type) return null;
  const map: Record<string, { label: string; color: string; bg: string }> = {
    binance:  { label: "Binance",  color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
    bybit:    { label: "Bybit",    color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
    mt5:      { label: "MT5",      color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
    metaapi:  { label: "MetaAPI",  color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  };
  const m = map[type.toLowerCase()] ?? { label: type.toUpperCase(), color: "text-muted-foreground", bg: "bg-secondary" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${m.bg} ${m.color}`}>
      {m.label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

export default function TraderDashboard() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"profile" | "master" | "execute" | "positions" | "history" | "copiers" | "copied-trades">("profile");

  const [trader, setTrader] = useState<TraderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notTrader, setNotTrader] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({ displayName: "", bio: "", strategy: "", markets: [] as string[], riskScore: "" });
  const [saving, setSaving] = useState(false);

  const [masterAccounts, setMasterAccounts] = useState<MasterAccount[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [showAddMaster, setShowAddMaster] = useState(false);
  const [masterForm, setMasterForm] = useState({ type: "mt5", label: "", apiKey: "", apiSecret: "", mt5Login: "", mt5Password: "", mt5Server: "" });
  const [masterSaving, setMasterSaving] = useState(false);

  const [tradeForm, setTradeForm] = useState({
    symbol: "", market: "forex", action: "buy", orderType: "market",
    price: "", quantity: "", stopLoss: "", takeProfit: "", leverage: "1", notes: "",
  });
  const [tradingPairs, setTradingPairs] = useState<{ symbol: string; market: string }[]>([]);
  const [executing, setExecuting] = useState(false);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [closingSignalId, setClosingSignalId] = useState<number | null>(null);

  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [expandedSignalId, setExpandedSignalId] = useState<number | null>(null);
  const [copierDetails, setCopierDetails] = useState<Record<number, SignalCopier[]>>({});
  const [copierLoading, setCopierLoading] = useState<number | null>(null);

  const [dashboard, setDashboard] = useState<TraderDashboard | null>(null);
  const [copierTrades, setCopierTrades] = useState<CopierTrade[]>([]);
  const [dashLoading, setDashLoading] = useState(false);

  useEffect(() => {
    fetch("/api/my-trader")
      .then(async (r) => {
        if (r.status === 404) { setNotTrader(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (data) {
          setTrader(data);
          setProfileForm({
            displayName: data.displayName ?? "",
            bio: data.bio ?? "",
            strategy: data.strategy ?? "",
            markets: data.markets ?? [],
            riskScore: data.riskScore?.toString() ?? "",
          });
          void loadDashboard(data.id);
        }
      })
      .catch(() => toast({ title: "Failed to load trader profile", variant: "destructive" }))
      .finally(() => setLoading(false));

    // load admin-configured trading pairs
    fetch("/api/trading-pairs")
      .then((r) => r.ok ? r.json() : [])
      .then((pairs: { symbol: string; market: string }[]) => {
        setTradingPairs(pairs);
        const first = pairs.find((p) => p.market === "forex") ?? pairs[0];
        if (first) setTradeForm((f) => ({ ...f, symbol: first.symbol, market: first.market }));
      })
      .catch(() => {});
  }, []);

  const loadDashboard = useCallback(async (traderId: number) => {
    setDashLoading(true);
    try {
      const [dashRes, tradesRes] = await Promise.all([
        fetch(`/api/trader-dashboard?traderId=${traderId}`),
        fetch(`/api/trader-copier-trades?traderId=${traderId}`),
      ]);
      if (dashRes.ok)   setDashboard(await dashRes.json() as TraderDashboard);
      if (tradesRes.ok) setCopierTrades(await tradesRes.json() as CopierTrade[]);
    } catch { /* ignore */ }
    finally { setDashLoading(false); }
  }, []);

  const loadMasterAccounts = () => {
    setMasterLoading(true);
    fetch("/api/master-accounts")
      .then((r) => r.json()).then(setMasterAccounts)
      .catch(() => toast({ title: "Failed to load master accounts", variant: "destructive" }))
      .finally(() => setMasterLoading(false));
  };

  const loadSignals = () => {
    if (!trader) return;
    setHistLoading(true);
    fetch(`/api/trade-signals?traderId=${trader.id}`)
      .then((r) => r.json()).then(setSignals)
      .catch(() => toast({ title: "Failed to load signals", variant: "destructive" }))
      .finally(() => setHistLoading(false));
  };

  const toggleCopierDetails = async (signalId: number) => {
    if (expandedSignalId === signalId) { setExpandedSignalId(null); return; }
    setExpandedSignalId(signalId);
    if (copierDetails[signalId]) return; // already loaded
    setCopierLoading(signalId);
    try {
      const r = await fetch(`/api/signal-copiers?signalId=${signalId}`);
      if (r.ok) { const data = await r.json() as SignalCopier[]; setCopierDetails((prev) => ({ ...prev, [signalId]: data })); }
    } catch { /* ignore */ }
    finally { setCopierLoading(null); }
  };

  const loadOpenPositions = async (traderId: number) => {
    setPositionsLoading(true);
    try {
      const r = await fetch(`/api/open-positions?traderId=${traderId}`);
      if (r.ok) setOpenPositions(await r.json() as OpenPosition[]);
    } catch { /* ignore */ }
    finally { setPositionsLoading(false); }
  };

  useEffect(() => {
    if (tab === "master" && trader) loadMasterAccounts();
    if (tab === "history" && trader) loadSignals();
    if ((tab === "execute" || tab === "positions") && trader) void loadOpenPositions(trader.id);
  }, [tab, trader]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/my-trader", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profileForm.displayName,
          bio: profileForm.bio || null,
          strategy: profileForm.strategy || null,
          markets: profileForm.markets,
          riskScore: profileForm.riskScore ? parseInt(profileForm.riskScore) : null,
        }),
      });
      if (!res.ok) throw new Error();
      setTrader(await res.json());
      setEditMode(false);
      toast({ title: "Profile updated" });
    } catch { toast({ title: "Failed to save profile", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const addMasterAccount = async () => {
    if (!trader) return;
    setMasterSaving(true);
    try {
      const body: Record<string, unknown> = {
        traderId: String(trader.id), type: masterForm.type, label: masterForm.label,
      };
      if (masterForm.type === "mt5") {
        body.mt5Login = masterForm.mt5Login;
        body.mt5Password = masterForm.mt5Password;
        body.mt5Server = masterForm.mt5Server;
      } else {
        body.apiKey = masterForm.apiKey;
        body.apiSecret = masterForm.apiSecret;
      }
      const res = await fetch("/api/master-accounts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Failed"); }
      toast({ title: "Master account linked" });
      setShowAddMaster(false);
      setMasterForm({ type: "mt5", label: "", apiKey: "", apiSecret: "", mt5Login: "", mt5Password: "", mt5Server: "" });
      loadMasterAccounts();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to link account", variant: "destructive" });
    } finally { setMasterSaving(false); }
  };

  const deleteMasterAccount = async (id: number) => {
    if (!confirm("Remove this master account?")) return;
    const res = await fetch(`/api/master-accounts/${id}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "Account removed" }); loadMasterAccounts(); }
    else toast({ title: "Failed to remove", variant: "destructive" });
  };

  const executeSignal = async () => {
    if (!trader) return;
    if (!tradeForm.symbol || !tradeForm.quantity) {
      toast({ title: "Symbol and quantity are required", variant: "destructive" }); return;
    }
    setExecuting(true);
    try {
      const body: Record<string, unknown> = {
        traderId: trader.id,
        symbol: tradeForm.symbol.toUpperCase(),
        market: tradeForm.market,
        action: tradeForm.action,
        orderType: tradeForm.orderType,
        quantity: parseFloat(tradeForm.quantity),
        leverage: parseInt(tradeForm.leverage) || 1,
      };
      if (tradeForm.price) body.price = parseFloat(tradeForm.price);
      if (tradeForm.stopLoss) body.stopLoss = parseFloat(tradeForm.stopLoss);
      if (tradeForm.takeProfit) body.takeProfit = parseFloat(tradeForm.takeProfit);
      if (tradeForm.notes) body.notes = tradeForm.notes;

      const res = await fetch("/api/trade-signals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const signal = await res.json();
      toast({ title: `${tradeForm.action.toUpperCase()} signal sent — ID #${signal.id}` });
      setTradeForm((f) => ({ ...f, notes: "" }));
    } catch { toast({ title: "Failed to send signal", variant: "destructive" }); }
    finally { setExecuting(false); }
  };

  const toggleMarket = (m: string) =>
    setProfileForm((f) => ({
      ...f,
      markets: f.markets.includes(m) ? f.markets.filter((x) => x !== m) : [...f.markets, m],
    }));

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (notTrader) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <TrendingUp className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Trader Access Required</h1>
      <p className="text-muted-foreground">You haven't been granted trader access yet. Contact an admin to have your account promoted to a trader profile.</p>
    </div>
  );

  const tabs = [
    { id: "profile" as const,        label: "Profile",          icon: Settings2 },
    { id: "master" as const,         label: "Master Account",   icon: Server },
    { id: "execute" as const,        label: "Execute Trade",    icon: Zap },
    { id: "positions" as const,      label: "Open Positions",   icon: Activity },
    { id: "history" as const,        label: "Signal History",   icon: History },
    { id: "copiers" as const,        label: "Copiers",          icon: Users },
    { id: "copied-trades" as const,  label: "Copied Trades",    icon: TrendingUp },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{trader?.displayName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {trader?.verified && (
                <Badge className="bg-blue-500/15 text-blue-600 border-blue-200 text-[11px]">✓ Verified</Badge>
              )}
              <Badge variant="outline" className="text-[11px] capitalize">{trader?.status}</Badge>
              <span className="text-xs text-muted-foreground">
                ROI {Number(trader?.roi ?? 0).toFixed(1)}% · Win Rate {Number(trader?.winRate ?? 0).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* ── Analytics: Equity Curve + 6 Stat Cards ── */}
        {dashboard && (() => {
          const sorted = [...dashboard.closedPositions].sort(
            (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()
          );
          let cum = 0;
          const curveData = sorted.map((p) => {
            cum += p.returnPct;
            return { t: new Date(p.closedAt).getTime(), v: parseFloat(cum.toFixed(2)) };
          });
          let peak = 0, maxDD = 0;
          curveData.forEach(({ v }) => { if (v > peak) peak = v; const dd = peak - v; if (dd > maxDD) maxDD = dd; });
          const byMonth = new Map<string, number>();
          for (const p of dashboard.closedPositions) {
            const key = p.closedAt.toString().slice(0, 7);
            byMonth.set(key, (byMonth.get(key) ?? 0) + p.returnPct);
          }
          const monthKeys = [...byMonth.keys()].sort().slice(-3);
          const avgMonthlyRoi = monthKeys.length > 0 ? monthKeys.reduce((s, k) => s + (byMonth.get(k) ?? 0), 0) / monthKeys.length : 0;
          let maxRoi30 = 0;
          for (let i = 0; i < curveData.length; i++) {
            const windowStart = curveData[i].t - 30 * 86400000;
            const windowSum = curveData.slice(0, i + 1).filter((d) => d.t >= windowStart)
              .reduce((s, d, idx, arr) => idx === 0 ? d.v : d.v - arr[0].v, 0);
            if (windowSum > maxRoi30) maxRoi30 = windowSum;
          }
          const aum = dashboard.subscribers.reduce((s, sub) => s + (sub.allocatedAmount ?? sub.maxAmount ?? 0), 0);
          const isPositive = curveData.length === 0 || curveData[curveData.length - 1].v >= 0;
          const perfCards = [
            { label: "Win Rate",         main: `${dashboard.stats.winRate.toFixed(1)}%`,                                          sub: `${dashboard.stats.closedCount} / ${dashboard.stats.totalTrades} trades`, color: dashboard.stats.winRate >= 50 ? "text-green-400" : "text-red-400" },
            { label: "Max Drawdown",     main: `${maxDD.toFixed(2)}%`,                                                            sub: "Peak-to-trough",   color: "text-red-400" },
            { label: "Avg Monthly ROI",  main: `${avgMonthlyRoi >= 0 ? "+" : ""}${avgMonthlyRoi.toFixed(1)}%`,                    sub: "Last 3 months avg", color: avgMonthlyRoi >= 0 ? "text-green-400" : "text-red-400" },
            { label: "Max ROI (30D)",    main: `${maxRoi30 >= 0 ? "+" : ""}${maxRoi30.toFixed(1)}%`,                              sub: "Best 30D window",  color: maxRoi30 >= 0 ? "text-green-400" : "text-red-400" },
            { label: "Followers",        main: `${dashboard.stats.followers}`,                                                    sub: "Active copiers",   color: "text-foreground" },
            { label: "AUM",              main: aum > 0 ? aum.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—",       sub: "Managed capital",  color: "text-foreground" },
          ];
          return (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 pt-4 pb-2 border-b border-border/40">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Equity Curve</span>
                  {curveData.length > 0 && (
                    <span className={`text-sm font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                      {isPositive ? "+" : ""}{curveData[curveData.length - 1].v.toFixed(2)}% cumulative
                    </span>
                  )}
                </div>
                {curveData.length < 2 ? (
                  <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">Close at least 2 trades to see the equity curve</div>
                ) : (
                  <ResponsiveContainer width="100%" height={110}>
                    <AreaChart data={curveData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tdEqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="t" hide /><YAxis hide domain={["auto", "auto"]} />
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                        <div className="bg-card border border-border rounded px-2 py-1 text-xs font-mono">
                          {(payload[0].value as number) >= 0 ? "+" : ""}{(payload[0].value as number).toFixed(2)}%
                        </div>
                      ) : null} />
                      <Area type="monotone" dataKey="v" stroke={isPositive ? "#22c55e" : "#ef4444"} strokeWidth={2} fill="url(#tdEqGrad)" dot={false} activeDot={{ r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-border/40">
                {perfCards.map((c) => (
                  <div key={c.label} className="px-5 py-4">
                    <p className="text-[11px] text-muted-foreground mb-1">{c.label}</p>
                    <p className={`text-2xl font-black tabular-nums ${c.color}`}>{c.main}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === t.id
                  ? "bg-white shadow-sm text-foreground dark:bg-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Profile ── */}
        {tab === "profile" && trader && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-4">
              <div>
                <CardTitle>Trader Profile</CardTitle>
                <CardDescription>Your public profile visible to copy-trading subscribers.</CardDescription>
              </div>
              {!editMode && <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Edit</Button>}
            </CardHeader>
            <CardContent className="space-y-5">
              {editMode ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Display Name</Label>
                      <Input value={profileForm.displayName} onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Risk Score (1–10)</Label>
                      <Input type="number" min={1} max={10} value={profileForm.riskScore}
                        onChange={(e) => setProfileForm((f) => ({ ...f, riskScore: e.target.value }))} placeholder="e.g. 5" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bio</Label>
                    <Textarea rows={3} value={profileForm.bio}
                      onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                      placeholder="Brief description of your trading style…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Strategy</Label>
                    <Input value={profileForm.strategy}
                      onChange={(e) => setProfileForm((f) => ({ ...f, strategy: e.target.value }))}
                      placeholder="e.g. Swing trading, scalping…" />
                  </div>
                  <div className="space-y-2">
                    <Label>Markets</Label>
                    <div className="flex flex-wrap gap-2">
                      {MARKETS.map((m) => (
                        <button key={m} onClick={() => toggleMarket(m)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all capitalize",
                            profileForm.markets.includes(m)
                              ? "bg-primary text-white border-primary"
                              : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                          )}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "Save Profile"}</Button>
                    <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Bio</p>
                      <p className="text-sm">{trader.bio ?? <span className="italic text-muted-foreground">Not set</span>}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Strategy</p>
                      <p className="text-sm">{trader.strategy ?? <span className="italic text-muted-foreground">Not set</span>}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Markets</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(trader.markets ?? []).length > 0
                          ? trader.markets.map((m) => <Badge key={m} variant="secondary" className="capitalize">{m}</Badge>)
                          : <span className="text-sm italic text-muted-foreground">None selected</span>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="ROI" value={`${Number(trader.roi).toFixed(2)}%`} />
                    <Stat label="Win Rate" value={`${Number(trader.winRate).toFixed(2)}%`} />
                    <Stat label="Total Trades" value={String(trader.totalTrades)} />
                    <Stat label="Followers" value={String(trader.followers)} />
                    <Stat label="Risk Score" value={trader.riskScore ? `${trader.riskScore}/10` : "—"} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Master Account ── */}
        {tab === "master" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Master Account</h2>
                <p className="text-sm text-muted-foreground">The broker account the mirror poller reads to fan out copy trades.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadMasterAccounts}><RefreshCw className="h-3.5 w-3.5" /></Button>
                <Button size="sm" onClick={() => setShowAddMaster(true)}><Plus className="h-3.5 w-3.5 mr-1" />Link Account</Button>
              </div>
            </div>

            {masterLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : masterAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No master account linked. Click "Link Account" to connect your broker.
              </div>
            ) : (
              <div className="space-y-3">
                {masterAccounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 bg-card">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary uppercase">{acc.type}</div>
                      <div>
                        <p className="font-medium text-sm">{acc.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {acc.mt5Login ? `Login: ${acc.mt5Login} · ${acc.mt5Server ?? ""}` : acc.apiKeyHint ?? ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={acc.status === "active" ? "default" : "destructive"} className="text-[11px]">{acc.status}</Badge>
                      {acc.lastError && <span className="text-[10px] text-destructive max-w-[140px] truncate">{acc.lastError}</span>}
                      <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => deleteMasterAccount(acc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddMaster && (
              <Card className="border-primary/30">
                <CardHeader className="pb-3"><CardTitle className="text-base">Link Master Account</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Broker Type</Label>
                      <Select value={masterForm.type} onValueChange={(v) => setMasterForm((f) => ({ ...f, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mt5">MT5</SelectItem>
                          <SelectItem value="binance">Binance</SelectItem>
                          <SelectItem value="bybit">Bybit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Label</Label>
                      <Input value={masterForm.label} onChange={(e) => setMasterForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. My MT5 account" />
                    </div>
                  </div>
                  {masterForm.type === "mt5" ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5"><Label>Login</Label>
                        <Input value={masterForm.mt5Login} onChange={(e) => setMasterForm((f) => ({ ...f, mt5Login: e.target.value }))} placeholder="123456" />
                      </div>
                      <div className="space-y-1.5"><Label>Password</Label>
                        <Input type="password" value={masterForm.mt5Password} onChange={(e) => setMasterForm((f) => ({ ...f, mt5Password: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5"><Label>Server</Label>
                        <BrokerServerSearch value={masterForm.mt5Server} onChange={(v) => setMasterForm((f) => ({ ...f, mt5Server: v }))} placeholder="Search broker server…" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label>API Key</Label>
                        <Input value={masterForm.apiKey} onChange={(e) => setMasterForm((f) => ({ ...f, apiKey: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5"><Label>API Secret</Label>
                        <Input type="password" value={masterForm.apiSecret} onChange={(e) => setMasterForm((f) => ({ ...f, apiSecret: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={addMasterAccount} disabled={masterSaving}>{masterSaving ? "Linking…" : "Link Account"}</Button>
                    <Button variant="outline" onClick={() => setShowAddMaster(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Execute Trade ── */}
        {tab === "execute" && (
          <Card>
            <CardHeader>
              <CardTitle>Execute Trade Signal</CardTitle>
              <CardDescription>Signal fans out immediately to all active copy-trading subscribers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Action tabs */}
              <div className="flex gap-2">
                {(["buy", "sell", "close"] as const).map((a) => (
                  <button key={a}
                    onClick={() => {
                      setTradeForm((f) => ({ ...f, action: a }));
                      if (a === "close" && trader) void loadOpenPositions(trader.id);
                    }}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg text-sm font-bold uppercase border transition-all",
                      tradeForm.action === a
                        ? a === "buy"  ? "bg-green-500 text-white border-green-500"
                          : a === "sell" ? "bg-red-500 text-white border-red-500"
                          : "bg-orange-500 text-white border-orange-500"
                        : "border-border text-muted-foreground hover:bg-secondary",
                    )}>
                    {a}
                  </button>
                ))}
              </div>

              {/* ── CLOSE tab: open positions list ── */}
              {tradeForm.action === "close" ? (
                positionsLoading ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" /><span>Loading open positions…</span>
                  </div>
                ) : openPositions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="h-7 w-7 mx-auto mb-2 opacity-30" />
                    No running positions to close.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Select a running trade to close it across all copier accounts:</p>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        onClick={() => trader && void loadOpenPositions(trader.id)}
                      >
                        <RefreshCw className="h-3 w-3" />Refresh
                      </button>
                    </div>
                    {openPositions.map((pos) => {
                      const isBuy = pos.action === "buy";
                      const avgFill = pos.copiers.filter((c) => c.executedPrice != null).length > 0
                        ? pos.copiers.filter((c) => c.executedPrice != null)
                            .reduce((s, c) => s + (c.executedPrice ?? 0), 0) /
                          pos.copiers.filter((c) => c.executedPrice != null).length
                        : null;
                      const isClosing = closingSignalId === pos.signalId;
                      return (
                        <div key={pos.signalId}
                          className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3 flex-wrap">
                          <span className={cn(
                            "text-[11px] font-black px-2.5 py-1 rounded-full shrink-0",
                            isBuy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
                          )}>
                            {isBuy ? "▲ BUY" : "▼ SELL"}
                          </span>
                          <span className="font-bold font-mono text-sm">{pos.symbol}</span>
                          <span className="text-xs text-muted-foreground uppercase">{pos.market}</span>
                          <span className="text-xs text-muted-foreground">Qty: {pos.quantity}</span>
                          {avgFill != null && avgFill > 0 && (
                            <span className="text-xs font-mono text-muted-foreground">
                              @ <span className="text-foreground font-semibold">{avgFill.toFixed(5)}</span>
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto shrink-0">
                            <Clock className="h-3 w-3 opacity-60" />
                            {new Date(pos.createdAt).toLocaleString()}
                          </span>
                          <span className="text-xs border border-border rounded-full px-2 py-0.5 shrink-0">
                            {pos.copiers.length} copier{pos.copiers.length !== 1 ? "s" : ""}
                          </span>
                          <Button
                            size="sm" variant="destructive"
                            className="h-8 text-xs px-4 font-bold shrink-0"
                            disabled={isClosing}
                            onClick={async () => {
                              if (!confirm("Close this position across all copier accounts?")) return;
                              setClosingSignalId(pos.signalId);
                              try {
                                const r = await fetch(`/api/signals/${pos.signalId}/close`, { method: "POST" });
                                const d = await r.json() as { closed?: number; failed?: number; skipped?: number; error?: string };
                                if (!r.ok) throw new Error(d.error ?? "Failed");
                                toast({
                                  title: "Position closed",
                                  description: `${d.closed ?? 0} closed · ${d.failed ?? 0} failed · ${d.skipped ?? 0} skipped`,
                                });
                                if (trader) void loadOpenPositions(trader.id);
                              } catch (e: unknown) {
                                toast({ title: e instanceof Error ? e.message : "Failed to close", variant: "destructive" });
                              } finally { setClosingSignalId(null); }
                            }}
                          >
                            {isClosing
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Closing…</>
                              : <><XCircle className="h-3.5 w-3.5 mr-1.5" />Close</>
                            }
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* ── BUY / SELL form ── */
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Market</Label>
                      <Select value={tradeForm.market} onValueChange={(v) => {
                        const first = tradingPairs.find((p) => p.market === v) ?? tradingPairs[0];
                        setTradeForm((f) => ({ ...f, market: v, symbol: first?.symbol ?? "" }));
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["forex","crypto","stocks","commodities"].map((m) => (
                            <SelectItem key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase()+m.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Symbol</Label>
                      {tradingPairs.filter((p) => p.market === tradeForm.market).length > 0 ? (
                        <Select value={tradeForm.symbol} onValueChange={(v) => setTradeForm((f) => ({ ...f, symbol: v }))}>
                          <SelectTrigger className="font-mono"><SelectValue placeholder="Select symbol" /></SelectTrigger>
                          <SelectContent>
                            {tradingPairs.filter((p) => p.market === tradeForm.market).map((p) => (
                              <SelectItem key={p.symbol} value={p.symbol} className="font-mono">{p.symbol}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={tradeForm.symbol}
                          onChange={(e) => setTradeForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                          placeholder="EURUSD" className="uppercase font-mono" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Order Type</Label>
                      <Select value={tradeForm.orderType} onValueChange={(v) => setTradeForm((f) => ({ ...f, orderType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                          <SelectItem value="stop">Stop</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Quantity / Lots</Label>
                      <Input type="number" step="0.01" value={tradeForm.quantity}
                        onChange={(e) => setTradeForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0.01" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Price {tradeForm.orderType === "market" ? "(optional)" : ""}</Label>
                      <Input type="number" step="0.00001" value={tradeForm.price}
                        onChange={(e) => setTradeForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Stop Loss (optional)</Label>
                      <Input type="number" step="0.00001" value={tradeForm.stopLoss}
                        onChange={(e) => setTradeForm((f) => ({ ...f, stopLoss: e.target.value }))} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Take Profit (optional)</Label>
                      <Input type="number" step="0.00001" value={tradeForm.takeProfit}
                        onChange={(e) => setTradeForm((f) => ({ ...f, takeProfit: e.target.value }))} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Leverage</Label>
                      <Input type="number" min={1} value={tradeForm.leverage}
                        onChange={(e) => setTradeForm((f) => ({ ...f, leverage: e.target.value }))} placeholder="1" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes (optional)</Label>
                      <Input value={tradeForm.notes}
                        onChange={(e) => setTradeForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. Breakout setup" />
                    </div>
                  </div>

                  <Button
                    className={cn("w-full h-11 text-base font-semibold",
                      tradeForm.action === "buy" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700")}
                    onClick={executeSignal}
                    disabled={executing}
                  >
                    {executing ? "Sending…" : `${tradeForm.action.toUpperCase()} ${tradeForm.symbol || "—"}`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Open Positions ── */}
        {tab === "positions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Open Positions</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Live trades currently running across your copier accounts.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => trader && void loadOpenPositions(trader.id)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
              </Button>
            </div>

            {positionsLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /><span>Loading open positions…</span>
              </div>
            ) : openPositions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-3 opacity-25" />
                <p className="font-medium">No open positions</p>
                <p className="text-xs mt-1 opacity-70">Execute a BUY or SELL signal to open a trade.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openPositions.map((pos) => {
                  const isBuy = pos.action === "buy";
                  const activeCopiers = pos.copiers.filter((c) => c.status === "executed");
                  const avgFill = activeCopiers.filter((c) => c.executedPrice != null).length > 0
                    ? activeCopiers.filter((c) => c.executedPrice != null)
                        .reduce((s, c) => s + (c.executedPrice ?? 0), 0) /
                      activeCopiers.filter((c) => c.executedPrice != null).length
                    : null;
                  const isClosing = closingSignalId === pos.signalId;

                  return (
                    <Card key={pos.signalId} className="overflow-hidden">
                      {/* position header */}
                      <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-wrap">
                        <span className={cn(
                          "text-[11px] font-black px-3 py-1 rounded-full shrink-0",
                          isBuy ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                        )}>
                          {isBuy ? "▲ BUY" : "▼ SELL"}
                        </span>
                        <span className="font-bold font-mono text-lg">{pos.symbol}</span>
                        <span className="text-xs uppercase text-muted-foreground border border-border rounded-full px-2 py-0.5">{pos.market}</span>
                        <div className="flex items-center gap-4 text-sm ml-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Qty </span>
                            <span className="font-semibold font-mono">{pos.quantity}</span>
                          </div>
                          {avgFill != null && avgFill > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground">Avg Fill </span>
                              <span className="font-semibold font-mono">{avgFill.toFixed(5)}</span>
                            </div>
                          )}
                          {pos.signalPrice != null && pos.signalPrice > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground">Signal Price </span>
                              <span className="font-semibold font-mono">{pos.signalPrice}</span>
                            </div>
                          )}
                        </div>
                        <div className="ml-auto flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(pos.createdAt).toLocaleString()}
                          </span>
                          <Button
                            size="sm" variant="destructive"
                            className="h-8 text-xs px-4 font-bold"
                            disabled={isClosing}
                            onClick={async () => {
                              if (!confirm(`Close ${pos.symbol} position across all copier accounts?`)) return;
                              setClosingSignalId(pos.signalId);
                              try {
                                const r = await fetch(`/api/signals/${pos.signalId}/close`, { method: "POST" });
                                const d = await r.json() as { closed?: number; failed?: number; skipped?: number; error?: string };
                                if (!r.ok) throw new Error(d.error ?? "Failed");
                                toast({
                                  title: "Position closed",
                                  description: `${d.closed ?? 0} closed · ${d.failed ?? 0} failed · ${d.skipped ?? 0} skipped`,
                                });
                                if (trader) void loadOpenPositions(trader.id);
                              } catch (e: unknown) {
                                toast({ title: e instanceof Error ? e.message : "Failed to close", variant: "destructive" });
                              } finally { setClosingSignalId(null); }
                            }}
                          >
                            {isClosing
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Closing…</>
                              : <><XCircle className="h-3.5 w-3.5 mr-1.5" />Close Position</>
                            }
                          </Button>
                        </div>
                      </div>

                      {/* copier breakdown table */}
                      {pos.copiers.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-secondary/40">
                              <tr className="border-b border-border text-muted-foreground">
                                <th className="text-left px-4 py-2.5 font-medium">Copier Account</th>
                                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                                <th className="text-right px-4 py-2.5 font-medium">Fill Price</th>
                                <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                                <th className="text-left px-4 py-2.5 font-medium">Order ID</th>
                                <th className="text-center px-4 py-2.5 font-medium">Status</th>
                                <th className="text-right px-4 py-2.5 font-medium">Executed At</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pos.copiers.map((c) => (
                                <tr key={c.copyTradeId} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                                  <td className="px-4 py-2.5 font-medium">{c.accountLabel}</td>
                                  <td className="px-4 py-2.5 uppercase text-muted-foreground">{c.accountType}</td>
                                  <td className="px-4 py-2.5 text-right font-mono">{c.executedPrice != null ? c.executedPrice.toFixed(5) : "—"}</td>
                                  <td className="px-4 py-2.5 text-right font-mono">{c.quantity ?? "—"}</td>
                                  <td className="px-4 py-2.5 font-mono text-muted-foreground truncate max-w-[140px]">{c.brokerOrderId ?? "—"}</td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={cn(
                                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                                      c.status === "executed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                      : c.status === "failed"   ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                    )}>
                                      {c.status === "executed" ? <CheckCircle2 className="h-3 w-3" />
                                       : c.status === "failed"  ? <XCircle className="h-3 w-3" />
                                       : <Clock className="h-3 w-3" />}
                                      {c.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                                    {new Date(c.executedAt).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Signal History ── */}
        {tab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Signal History</h2>
              <Button variant="outline" size="sm" onClick={loadSignals}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
            </div>
            {histLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : signals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No signals yet. Use the Execute Trade tab to send your first signal.
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40">
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="w-6 px-4 py-3" />
                      <th className="text-left px-4 py-3 font-medium">Action</th>
                      <th className="text-left px-4 py-3 font-medium">Symbol</th>
                      <th className="text-right px-4 py-3 font-medium">Qty</th>
                      <th className="text-right px-4 py-3 font-medium">Price</th>
                      <th className="text-right px-4 py-3 font-medium">SL / TP</th>
                      <th className="text-center px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((s) => {
                      const isExpanded = expandedSignalId === s.id;
                      const copiers = copierDetails[s.id] ?? [];
                      const isLoadingCopiers = copierLoading === s.id;
                      const totalPnl = copiers.reduce((sum, c) => sum + (c.pnl ?? 0), 0);
                      return (
                        <>
                          {/* ── signal row ── */}
                          <tr
                            key={s.id}
                            className="border-b border-border/40 hover:bg-secondary/20 transition-colors cursor-pointer select-none"
                            onClick={() => void toggleCopierDetails(s.id)}
                          >
                            <td className="px-4 py-3 text-muted-foreground">
                              <span className="text-[10px]">{isExpanded ? "▼" : "▶"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase",
                                s.action === "buy"   ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : s.action === "sell" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              )}>
                                {s.action}
                              </span>
                              <span className="ml-1.5 text-[11px] text-muted-foreground capitalize">{s.orderType}</span>
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold">{s.symbol}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{s.quantity ?? "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{s.price ?? "market"}</td>
                            <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
                              {s.stopLoss ? `SL ${s.stopLoss}` : "—"} / {s.takeProfit ? `TP ${s.takeProfit}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {s.status === "executed" ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                               : s.status === "failed"   ? <XCircle className="h-4 w-4 text-red-500 inline" />
                               : <Clock className="h-4 w-4 text-amber-500 inline" />}
                            </td>
                            <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
                              {new Date(s.createdAt).toLocaleString()}
                            </td>
                          </tr>

                          {/* ── copier detail rows ── */}
                          {isExpanded && (
                            <tr key={`${s.id}-detail`} className="bg-secondary/30 border-b border-border/40">
                              <td colSpan={8} className="px-6 pb-4 pt-2">
                                {isLoadingCopiers ? (
                                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading copier details…
                                  </div>
                                ) : copiers.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2">No copier fills recorded for this signal.</p>
                                ) : (
                                  <div className="rounded-lg border border-border overflow-hidden mt-1">
                                    <table className="w-full text-xs">
                                      <thead className="bg-secondary/60">
                                        <tr className="border-b border-border text-muted-foreground">
                                          <th className="text-left px-3 py-2 font-medium">Account</th>
                                          <th className="text-left px-3 py-2 font-medium">Type</th>
                                          <th className="text-right px-3 py-2 font-medium">Fill Price</th>
                                          <th className="text-right px-3 py-2 font-medium">Qty</th>
                                          <th className="text-right px-3 py-2 font-medium">P&L</th>
                                          <th className="text-left px-3 py-2 font-medium">Order ID</th>
                                          <th className="text-center px-3 py-2 font-medium">Status</th>
                                          <th className="text-right px-3 py-2 font-medium">Executed At</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {copiers.map((c) => (
                                          <tr key={c.copyTradeId} className="border-b border-border/30 hover:bg-secondary/40 transition-colors">
                                            <td className="px-3 py-2 font-medium">{c.accountLabel}</td>
                                            <td className="px-3 py-2 uppercase text-muted-foreground">{c.accountType}</td>
                                            <td className="px-3 py-2 text-right font-mono">{c.executedPrice != null ? c.executedPrice.toFixed(5) : "—"}</td>
                                            <td className="px-3 py-2 text-right font-mono">{c.quantity ?? "—"}</td>
                                            <td className={cn("px-3 py-2 text-right font-mono font-semibold",
                                              c.pnl == null ? "text-muted-foreground"
                                              : c.pnl >= 0 ? "text-green-600 dark:text-green-400"
                                              : "text-red-600 dark:text-red-400"
                                            )}>
                                              {c.pnl != null ? `${c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)}` : "—"}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[120px]">{c.brokerOrderId ?? "—"}</td>
                                            <td className="px-3 py-2 text-center">
                                              {c.status === "executed" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 inline" />
                                               : c.status === "failed"   ? <XCircle className="h-3.5 w-3.5 text-red-500 inline" />
                                               : <Clock className="h-3.5 w-3.5 text-amber-500 inline" />}
                                              <span className="ml-1 text-muted-foreground capitalize">{c.status}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right text-muted-foreground">
                                              {new Date(c.executedAt).toLocaleString()}
                                            </td>
                                          </tr>
                                        ))}
                                        {/* total P&L footer */}
                                        <tr className="bg-secondary/60 font-semibold">
                                          <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground">Total P&L ({copiers.length} copier{copiers.length !== 1 ? "s" : ""})</td>
                                          <td className={cn("px-3 py-2 text-right font-mono text-xs",
                                            totalPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                          )}>
                                            {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
                                          </td>
                                          <td colSpan={3} />
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Copiers tab ── */}
        {tab === "copiers" && (
          dashLoading || !dashboard ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (() => {
            const pnlByLabel = new Map(dashboard.copierPnl.map((p) => [p.accountLabel, p]));
            const rows = dashboard.subscribers.map((s) => {
              const pnl = pnlByLabel.get(s.accountLabel);
              const unrealised = s.currentPnl ?? 0;
              const realised   = pnl?.totalPnl ?? 0;
              const totalGain  = unrealised + realised;
              const acctSize   = s.allocatedAmount ?? s.maxAmount ?? 0;
              const gainPct    = acctSize > 0 ? (totalGain / acctSize) * 100 : null;
              return { ...s, unrealised, realised, totalGain, acctSize, gainPct, orders: pnl?.tradeCount ?? 0, won: pnl?.winCount ?? 0, failed: pnl?.failCount ?? 0 };
            });
            const totalAum     = rows.reduce((s, r) => s + r.acctSize, 0);
            const totalGainAll = rows.reduce((s, r) => s + r.totalGain, 0);
            const avgGainPct   = rows.filter((r) => r.gainPct != null).length > 0
              ? rows.reduce((s, r) => s + (r.gainPct ?? 0), 0) / rows.filter((r) => r.gainPct != null).length : 0;
            const totalExecuted = rows.reduce((s, r) => s + r.orders, 0);
            const totalFailed   = rows.reduce((s, r) => s + r.failed, 0);
            const headerCards = [
              { label: "TOTAL COPIERS", main: `${dashboard.subscribers.length}`, sub: "Active accounts",    color: "text-foreground" },
              { label: "TOTAL AUM",     main: totalAum > 0 ? totalAum.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—", sub: "Combined capital", color: "text-primary" },
              { label: "TOTAL GAIN ($)", main: totalGainAll !== 0 ? `${totalGainAll >= 0 ? "+" : ""}${Math.abs(totalGainAll).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—", sub: "Across all accounts", color: totalGainAll >= 0 ? "text-green-400" : "text-red-400" },
              { label: "AVG GAIN %",   main: `${avgGainPct >= 0 ? "+" : ""}${avgGainPct.toFixed(2)}%`, sub: "Per account avg",   color: avgGainPct >= 0 ? "text-green-400" : "text-red-400" },
            ];
            if (rows.length === 0) return (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
                <Users className="h-7 w-7 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No copiers yet</p>
                <p className="text-xs mt-1">Share your trader profile to attract followers.</p>
              </div>
            );
            return (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/40 border-b border-border/40">
                  {headerCards.map((c) => (
                    <div key={c.label} className="px-5 py-4">
                      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">{c.label}</p>
                      <p className={`text-2xl font-black tabular-nums ${c.color}`}>{c.main}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/30 border-b border-border/40">
                      <tr className="text-muted-foreground uppercase text-[10px] tracking-wide">
                        <th className="text-left px-4 py-2.5 font-semibold">Account</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Broker</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Account Size</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Unrealised P&amp;L</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Realised P&amp;L</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Total Gain</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Gain %</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Orders</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Won</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Failed</th>
                        <th className="text-center px-4 py-2.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const initials = r.displayName.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
                        return (
                          <tr key={r.subId} className="border-t border-border/30 hover:bg-secondary/10 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{initials || "?"}</span>
                                <div>
                                  <div className="font-semibold text-foreground">{r.displayName}</div>
                                  <div className="text-[10px] text-muted-foreground">Live Account</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">{acctBadge(r.accountType) ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{r.acctSize > 0 ? r.acctSize.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</td>
                            <td className={`px-4 py-3 text-right font-mono font-semibold ${r.unrealised >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {r.unrealised !== 0 ? `${r.unrealised >= 0 ? "+" : ""}${Math.abs(r.unrealised).toFixed(2)}` : <span className="text-muted-foreground">$0.00</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-semibold ${r.realised >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {r.realised !== 0 ? `${r.realised >= 0 ? "+" : ""}${Math.abs(r.realised).toFixed(2)}` : <span className="text-muted-foreground">$0.00</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-bold ${r.totalGain >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {r.totalGain !== 0 ? `${r.totalGain >= 0 ? "+" : ""}${Math.abs(r.totalGain).toFixed(2)}` : <span className="text-muted-foreground">$0.00</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-semibold ${(r.gainPct ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {r.gainPct != null ? `${r.gainPct >= 0 ? "+" : ""}${r.gainPct.toFixed(2)}%` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{r.orders}</td>
                            <td className="px-4 py-3 text-right font-semibold text-green-500">{r.won}</td>
                            <td className="px-4 py-3 text-right font-semibold text-red-500">{r.failed}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${r.status === "active" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-secondary text-muted-foreground border-border"}`}>
                                {r.status === "active" ? "● Active" : r.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-border/40 bg-secondary/10 flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-500/15 flex items-center justify-center"><CheckCircle2 className="h-2.5 w-2.5 text-green-500" /></span>Executed <span className="font-bold text-foreground ml-1">{totalExecuted}</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-500/15 flex items-center justify-center"><XCircle className="h-2.5 w-2.5 text-red-500" /></span>Failed <span className="font-bold text-foreground ml-1">{totalFailed}</span></span>
                  <span className="ml-auto text-xs">Total Orders <span className="font-bold text-foreground ml-1">{totalExecuted + totalFailed}</span></span>
                </div>
              </div>
            );
          })()
        )}

        {/* ── Copied Trades tab ── */}
        {tab === "copied-trades" && (
          dashLoading || !dashboard ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : copierTrades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
              <TrendingUp className="h-7 w-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No copied trades yet</p>
              <p className="text-xs mt-1">Closed copier positions will appear here.</p>
            </div>
          ) : (() => {
            const fmtDur = (ms: number) => {
              const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
              return h > 0 ? `${h}h ${m}m` : `${m}m`;
            };
            const wonCount  = copierTrades.filter((t) => (t.pnl ?? 0) > 0).length;
            const failCount = copierTrades.filter((t) => t.status === "failed").length;
            return (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/30 border-b border-border/40 sticky top-0">
                      <tr className="text-muted-foreground uppercase text-[10px] tracking-wide">
                        <th className="text-left px-4 py-2.5 font-semibold">Account</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Pair</th>
                        <th className="text-center px-4 py-2.5 font-semibold">Side</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Open</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Close</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Lots</th>
                        <th className="text-right px-4 py-2.5 font-semibold">P&amp;L</th>
                        <th className="text-right px-4 py-2.5 font-semibold">%</th>
                        <th className="text-center px-4 py-2.5 font-semibold">Status</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Order ID</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Open Time</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Close Time</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {copierTrades.map((t, i) => {
                        const isBuy = t.side === "buy";
                        const pnlPos = (t.pnl ?? 0) >= 0;
                        const retPos = (t.returnPct ?? 0) >= 0;
                        return (
                          <tr key={i} className="border-t border-border/30 hover:bg-secondary/10 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {acctBadge(t.accountType)}
                                <span className="font-medium truncate max-w-[100px]">{t.accountLabel}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{t.displayName}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold">{t.symbol}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isBuy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {isBuy ? <><ChevronUp className="h-3 w-3 inline -mt-0.5" />BUY</> : <><ChevronDown className="h-3 w-3 inline -mt-0.5" />SELL</>}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">{t.openPrice != null ? t.openPrice.toFixed(5) : "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{t.closePrice != null ? t.closePrice.toFixed(5) : "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{t.lots?.toFixed(4) ?? "—"}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-semibold ${pnlPos ? "text-green-500" : "text-red-500"}`}>
                              {t.pnl != null ? `${pnlPos ? "+" : ""}${Math.abs(t.pnl).toFixed(2)}` : "—"}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-semibold ${retPos ? "text-green-500" : "text-red-500"}`}>
                              {t.returnPct != null ? `${retPos ? "+" : ""}${t.returnPct.toFixed(2)}%` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                t.status === "closed"   ? "bg-gray-100 text-gray-600"   :
                                t.status === "executed" ? "bg-green-100 text-green-700" :
                                t.status === "failed"   ? "bg-red-100 text-red-600"     : "bg-yellow-100 text-yellow-600"
                              }`}>{t.status}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted-foreground text-[10px]">
                              {t.orderId ? <span title={t.orderId}>{t.orderId.slice(0, 10)}{t.orderId.length > 10 ? "…" : ""}</span> : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">{new Date(t.openTime).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">{t.closeTime ? new Date(t.closeTime).toLocaleString() : "—"}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{t.durationMs != null ? fmtDur(t.durationMs) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-border/40 bg-secondary/10 flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-500/15 flex items-center justify-center"><CheckCircle2 className="h-2.5 w-2.5 text-green-500" /></span>Won <span className="font-bold text-foreground ml-1">{wonCount}</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-500/15 flex items-center justify-center"><XCircle className="h-2.5 w-2.5 text-red-500" /></span>Failed <span className="font-bold text-foreground ml-1">{failCount}</span></span>
                  <span className="ml-auto text-xs">Total <span className="font-bold text-foreground ml-1">{copierTrades.length}</span> trades</span>
                </div>
              </div>
            );
          })()
        )}
      </div>
  );
}
