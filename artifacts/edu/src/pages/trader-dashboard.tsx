import { useState, useEffect } from "react";
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
  Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
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

const MARKETS = ["forex", "crypto", "stocks", "commodities"];

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
  const [tab, setTab] = useState<"profile" | "master" | "execute" | "history">("profile");

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
  const [executing, setExecuting] = useState(false);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [closingSignalId, setClosingSignalId] = useState<number | null>(null);

  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [histLoading, setHistLoading] = useState(false);

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
        }
      })
      .catch(() => toast({ title: "Failed to load trader profile", variant: "destructive" }))
      .finally(() => setLoading(false));
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
    if (tab === "execute" && trader) void loadOpenPositions(trader.id);
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
    { id: "profile" as const,  label: "Profile",        icon: Settings2 },
    { id: "master" as const,   label: "Master Account", icon: Server },
    { id: "execute" as const,  label: "Execute Trade",  icon: Zap },
    { id: "history" as const,  label: "Signal History", icon: History },
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
                      <Select value={tradeForm.market} onValueChange={(v) => setTradeForm((f) => ({ ...f, market: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="forex">Forex</SelectItem>
                          <SelectItem value="crypto">Crypto</SelectItem>
                          <SelectItem value="stocks">Stocks</SelectItem>
                          <SelectItem value="commodities">Commodities</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Symbol</Label>
                      <Input value={tradeForm.symbol}
                        onChange={(e) => setTradeForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                        placeholder="EURUSD" className="uppercase font-mono" />
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
                    {signals.map((s) => (
                      <tr key={s.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
  );
}
