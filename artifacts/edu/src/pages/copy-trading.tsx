import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/lib/authContext";
import {
  TrendingUp, TrendingDown, Users, ShieldCheck, Plus, Trash2,
  Zap, Link2, Clock, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, ChevronDown, ChevronUp, Send, Crosshair, Loader2,
  Crown, Sparkles,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────── */
type Trader = {
  id: number; displayName: string; avatarUrl: string | null; bio: string | null;
  roi: number; winRate: number; maxDrawdown: number; totalTrades: number;
  followers: number; status: string; verified: boolean; markets: string[];
  strategy: string | null; monthlyReturn: number | null; riskScore: number | null;
};
type CopyAccount = {
  id: number; type: "binance" | "bybit" | "mt5"; label: string;
  status: string; lastError: string | null; apiKeyHint: string | null;
  mt5Login: string | null; mt5Server: string | null; createdAt: string;
};
type Subscription = {
  id: number; traderId: number; traderName: string | null;
  copyAccountId: number | null; accountLabel: string | null;
  status: string; lotMultiplier: number; currentPnl: number | null;
  allocatedAmount: number | null; createdAt: string;
};
type Signal = {
  id: number; traderId: number; symbol: string; market: string;
  action: string; orderType: string; price: number | null; quantity: number;
  stopLoss: number | null; takeProfit: number | null; leverage: number | null;
  notes: string | null; status: string; createdAt: string;
};
type CopyTrade = {
  id: number; signalId: number; userId: string; copyAccountId: number;
  status: string; executedPrice: number | null; quantity: number | null;
  pnl: number | null; brokerOrderId: string | null; errorMessage: string | null;
  createdAt: string;
};

/* ─── Risk bar ───────────────────────────────────────────────────── */
function RiskBar({ score }: { score: number | null | undefined }) {
  const s = score ?? 5;
  const color = s <= 3 ? "bg-green-500" : s <= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`h-2 w-2 rounded-sm ${i < s ? color : "bg-muted"}`} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{s}/10</span>
    </div>
  );
}

/* ─── Connect Account Modal ──────────────────────────────────────── */
function ConnectAccountModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (a: CopyAccount) => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<"binance" | "bybit" | "mt5">("binance");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [mt5Login, setMt5Login] = useState("");
  const [mt5Password, setMt5Password] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("binance"); setLabel(""); setApiKey(""); setApiSecret("");
    setMt5Login(""); setMt5Password(""); setMt5Server("");
  };

  const submit = async () => {
    if (!label.trim()) { toast({ title: "Label required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = { type, label: label.trim() };
      if (type !== "mt5") { body.apiKey = apiKey; body.apiSecret = apiSecret; }
      else { body.mt5Login = mt5Login; body.mt5Password = mt5Password; body.mt5Server = mt5Server; }

      const res = await fetch("/api/copy-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
      const account = await res.json() as CopyAccount;
      onCreated(account);
      reset();
      onClose();
      toast({ title: "Account connected!" });
    } catch (e: unknown) {
      toast({ title: (e instanceof Error ? e.message : "Failed to connect account"), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const typeMeta = {
    binance: { label: "Binance", color: "text-yellow-500" },
    bybit:   { label: "Bybit",   color: "text-orange-500" },
    mt5:     { label: "MT5",     color: "text-blue-500" },
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Trading Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {(["binance", "bybit", "mt5"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-lg border-2 p-3 text-sm font-semibold transition-colors ${
                  type === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <span className={typeMeta[t].color}>{typeMeta[t].label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label>Account Label</Label>
            <Input placeholder="e.g. My Binance Main" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          {type !== "mt5" ? (
            <>
              <div className="space-y-1">
                <Label>API Key</Label>
                <Input placeholder="Paste your API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>API Secret</Label>
                <Input type="password" placeholder="Paste your API secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground bg-secondary/60 rounded-lg p-2.5">
                Use a <strong>read + trade</strong> key. Disable withdrawal permissions. Your credentials are stored AES-256 encrypted.
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>MT5 Login Number</Label>
                <Input placeholder="e.g. 12345678" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>MT5 Password</Label>
                <Input type="password" placeholder="Your MT5 password" value={mt5Password} onChange={(e) => setMt5Password(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Server</Label>
                <Input placeholder="e.g. Deriv-Server or ICMarkets-Live01" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground bg-secondary/60 rounded-lg p-2.5">
                Your password is encrypted. Make sure your server name matches exactly what appears in MT5.
              </p>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Connecting…" : "Connect Account"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Subscribe Modal (pick account + lot multiplier) ────────────── */
function SubscribeModal({ trader, accounts, open, onClose, onSubscribed }: {
  trader: Trader | null; accounts: CopyAccount[]; open: boolean;
  onClose: () => void; onSubscribed: () => void;
}) {
  const { toast } = useToast();
  const [accountId, setAccountId] = useState<string>("");
  const [lotMultiplier, setLotMultiplier] = useState("1.00");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!trader) return;
    setSaving(true);
    try {
      const res = await fetch("/api/copy-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traderId: trader.id,
          copyAccountId: accountId ? parseInt(accountId) : undefined,
          lotMultiplier: parseFloat(lotMultiplier) || 1,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string; code?: string };
        if (data.code === "PLAN_LIMIT_REACHED") {
          toast({
            title: "Copier limit reached",
            description: data.error,
            variant: "destructive",
          });
        } else {
          throw new Error(data.error ?? "Failed");
        }
        return;
      }
      onSubscribed();
      onClose();
      toast({ title: `Now copying ${trader.displayName}` });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to subscribe", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy {trader?.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1">
            <Label>Execute trades on</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a connected account (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Signal only (no auto-execution)</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.type.toUpperCase()} — {a.label}
                    {a.status === "error" && " ⚠️"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Connect a broker account first to enable auto-execution.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Lot Multiplier</Label>
            <Input
              type="number" min="0.01" step="0.01" value={lotMultiplier}
              onChange={(e) => setLotMultiplier(e.target.value)}
              placeholder="1.00"
            />
            <p className="text-[11px] text-muted-foreground">1.0 = same lot as master. 0.5 = half size. 2.0 = double.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Subscribing…" : "Start Copying"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Signal badge ───────────────────────────────────────────────── */
function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    buy: "bg-green-100 text-green-700 border-green-200",
    sell: "bg-red-100 text-red-700 border-red-200",
    close: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${map[action] ?? map.close}`}>{action.toUpperCase()}</span>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "executed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "pending") return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
  return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
}

/* ─── Quick Trade Panel (instructor / admin only) ────────────────── */
type QuickTradeAction = "buy" | "sell" | "close" | "modify";
type QuickTradeMarket = "crypto" | "forex" | "commodities" | "stocks";
type QuickTradeOrderType = "market" | "limit" | "stop" | "stop_limit";

function QuickTradePanel({
  traderId,
  subscriberCount,
  onSignalCreated,
}: {
  traderId: number;
  subscriberCount: number;
  onSignalCreated: (sig: Signal) => void;
}) {
  const { toast } = useToast();
  const [action, setAction] = useState<QuickTradeAction>("buy");
  const [market, setMarket] = useState<QuickTradeMarket>("crypto");
  const [orderType, setOrderType] = useState<QuickTradeOrderType>("market");
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverage, setLeverage] = useState("1");
  const [notes, setNotes] = useState("");
  const [closeSide, setCloseSide] = useState<"long" | "short">("long");
  const [firing, setFiring] = useState(false);

  const needsPrice    = orderType === "limit" || orderType === "stop_limit";
  const needsStopPx   = orderType === "stop"  || orderType === "stop_limit";

  const orderTypeMeta: Record<QuickTradeOrderType, string> = {
    market:     "Market",
    limit:      "Limit",
    stop:       "Stop (Market)",
    stop_limit: "Stop-Limit",
  };

  const actionMeta: Record<QuickTradeAction, { label: string; color: string; bg: string; activeBg: string }> = {
    buy:    { label: "BUY",    color: "text-green-700",  bg: "border-green-200 hover:bg-green-50",  activeBg: "bg-green-500 text-white border-green-500" },
    sell:   { label: "SELL",   color: "text-red-700",    bg: "border-red-200 hover:bg-red-50",      activeBg: "bg-red-500 text-white border-red-500" },
    close:  { label: "CLOSE",  color: "text-gray-600",   bg: "border-gray-200 hover:bg-gray-50",    activeBg: "bg-gray-600 text-white border-gray-600" },
    modify: { label: "MODIFY", color: "text-blue-700",   bg: "border-blue-200 hover:bg-blue-50",    activeBg: "bg-blue-500 text-white border-blue-500" },
  };

  const fire = async () => {
    if (!symbol.trim()) { toast({ title: "Symbol required", variant: "destructive" }); return; }
    if (!quantity.trim()) { toast({ title: "Quantity required", variant: "destructive" }); return; }
    if (needsStopPx && !stopPrice.trim()) { toast({ title: "Trigger (stop) price required", variant: "destructive" }); return; }
    if (needsPrice && !price.trim()) { toast({ title: "Limit price required", variant: "destructive" }); return; }
    setFiring(true);
    try {
      const body: Record<string, unknown> = {
        traderId,
        symbol: symbol.trim().toUpperCase(),
        market,
        action,
        orderType,
        quantity: parseFloat(quantity),
        leverage: parseFloat(leverage) || 1,
      };
      if (needsPrice && price)   body.price     = parseFloat(price);
      if (needsStopPx && stopPrice) body.stopPrice = parseFloat(stopPrice);
      if (stopLoss)   body.stopLoss  = parseFloat(stopLoss);
      if (takeProfit) body.takeProfit = parseFloat(takeProfit);
      // For CLOSE, always inject "close long" / "close short" so fan-out knows the side.
      // User-supplied notes are appended after the side tag.
      if (action === "close") {
        body.notes = `close ${closeSide}${notes.trim() ? ` — ${notes.trim()}` : ""}`;
      } else if (notes.trim()) {
        body.notes = notes.trim();
      }

      const res = await fetch("/api/trade-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
      const sig = await res.json() as Signal;
      onSignalCreated(sig);
      setSymbol(""); setPrice(""); setStopPrice(""); setQuantity(""); setStopLoss(""); setTakeProfit(""); setNotes("");
      toast({
        title: `${action.toUpperCase()} ${sig.symbol} fired!`,
        description: `Fanning out to ${subscriberCount} copier${subscriberCount !== 1 ? "s" : ""}…`,
      });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to fire trade", variant: "destructive" });
    } finally { setFiring(false); }
  };

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            Quick Trade Execution
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground bg-secondary px-2.5 py-1 rounded-full flex items-center gap-1">
              <Users className="h-3 w-3" />
              {subscriberCount} copier{subscriberCount !== 1 ? "s" : ""} will receive this
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        {/* Action selector */}
        <div className="grid grid-cols-4 gap-2">
          {(["buy", "sell", "close", "modify"] as QuickTradeAction[]).map((a) => {
            const m = actionMeta[a];
            const isActive = action === a;
            return (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={`rounded-lg border-2 py-2.5 text-sm font-bold tracking-wide transition-all ${
                  isActive ? m.activeBg : `${m.bg} ${m.color} bg-transparent`
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Close side: long or short — required when action = close */}
        {action === "close" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Closing position:</span>
            <div className="flex gap-2">
              {(["long", "short"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setCloseSide(side)}
                  className={`rounded-lg border-2 px-4 py-1.5 text-xs font-bold transition-all ${
                    closeSide === side
                      ? side === "long"
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-red-500 text-white border-red-500"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {side === "long" ? "▲ LONG" : "▼ SHORT"}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Will send &quot;{`close ${closeSide}`}&quot; to exchange
            </span>
          </div>
        )}

        {/* Row 1: Symbol + Market + Order type */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Symbol</Label>
            <Input
              placeholder="e.g. BTCUSDT"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Market</Label>
            <Select value={market} onValueChange={(v) => setMarket(v as QuickTradeMarket)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="forex">Forex</SelectItem>
                <SelectItem value="commodities">Commodities</SelectItem>
                <SelectItem value="stocks">Stocks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Order Type</Label>
            <Select value={orderType} onValueChange={(v) => setOrderType(v as QuickTradeOrderType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(orderTypeMeta) as [QuickTradeOrderType, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Quantity + Trigger price (stop/stop_limit) + Limit price (limit/stop_limit) + Leverage */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Quantity / Lots</Label>
            <Input
              type="number" min="0" step="any"
              placeholder="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          {needsStopPx ? (
            <div className="space-y-1">
              <Label className="text-xs text-orange-500">Trigger Price *</Label>
              <Input
                type="number" min="0" step="any"
                placeholder="stop trigger price"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="border-orange-300 focus:border-orange-500"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">{needsPrice ? "Limit Price *" : "Price (optional)"}</Label>
              <Input
                type="number" min="0" step="any"
                placeholder={needsPrice ? "entry price" : "auto"}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Leverage</Label>
            <Input
              type="number" min="1" max="500" step="1"
              placeholder="1"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
            />
          </div>
        </div>

        {/* Extra row: limit price shown alongside trigger price for stop_limit */}
        {orderType === "stop_limit" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-start-2 space-y-1">
              <Label className="text-xs">Limit Price *</Label>
              <Input
                type="number" min="0" step="any"
                placeholder="limit entry price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Row 3: SL + TP */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-red-500">Stop Loss (optional)</Label>
            <Input
              type="number" min="0" step="any"
              placeholder="0.00"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              className="border-red-200 focus:border-red-400"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-green-600">Take Profit (optional)</Label>
            <Input
              type="number" min="0" step="any"
              placeholder="0.00"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              className="border-green-200 focus:border-green-400"
            />
          </div>
        </div>

        {/* Notes + Fire button */}
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              placeholder="Analysis or reason for this trade…"
              rows={1}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
            />
          </div>
          <Button
            onClick={fire}
            disabled={firing || !symbol.trim() || !quantity.trim()}
            className={`h-10 min-w-[140px] font-bold text-sm gap-2 ${
              action === "buy"   ? "bg-green-500 hover:bg-green-600" :
              action === "sell"  ? "bg-red-500 hover:bg-red-600" :
              action === "close" ? "bg-gray-600 hover:bg-gray-700" :
                                   "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {firing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Firing…</>
            ) : (
              <><Send className="h-4 w-4" />Fire {actionMeta[action].label}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main page ──────────────────────────────────────────────────── */
export default function CopyTrading() {
  const { toast } = useToast();
  const { user } = useAuthContext();
  const isInstructor = user?.role === "instructor" || user?.role === "admin";

  const [traders, setTraders] = useState<Trader[]>([]);
  const [myTrader, setMyTrader] = useState<Trader | null>(null);
  const [subscriptions, setSubs] = useState<Subscription[]>([]);
  const [accounts, setAccounts] = useState<CopyAccount[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [copyTrades, setCopyTrades] = useState<CopyTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [subscribeTrader, setSubscribeTrader] = useState<Trader | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [t, s, a, sig, ct] = await Promise.all([
        fetch("/api/traders").then((r) => r.ok ? r.json() : []),
        fetch("/api/copy-subscriptions").then((r) => r.ok ? r.json() : []),
        fetch("/api/copy-accounts").then((r) => r.ok ? r.json() : []),
        fetch("/api/trade-signals").then((r) => r.ok ? r.json() : []),
        fetch("/api/copy-trades").then((r) => r.ok ? r.json() : []),
      ]);
      setTraders(t as Trader[]);
      setSubs(s as Subscription[]);
      setAccounts(a as CopyAccount[]);
      setSignals(sig as Signal[]);
      setCopyTrades(ct as CopyTrade[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  /* Fetch the instructor's own trader profile for quick-trade */
  useEffect(() => {
    if (!isInstructor) return;
    fetch("/api/my-trader")
      .then((r) => r.ok ? r.json() : null)
      .then((t) => { if (t) setMyTrader(t as Trader); })
      .catch(() => {});
  }, [isInstructor]);

  /* Derive subscriber count directly from trader.followers */
  useEffect(() => {
    if (myTrader) setSubscriberCount(myTrader.followers);
  }, [myTrader]);

  const subscribedTraderIds = new Set(subscriptions.map((s) => s.traderId));

  const unfollow = async (traderId: number) => {
    const sub = subscriptions.find((s) => s.traderId === traderId);
    if (!sub) return;
    setActingId(traderId);
    try {
      await fetch(`/api/copy-subscriptions/${sub.id}`, { method: "DELETE" });
      setSubs((prev) => prev.filter((s) => s.id !== sub.id));
      toast({ title: "Stopped copying trader" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setActingId(null); }
  };

  const deleteAccount = async (id: number) => {
    if (!confirm("Remove this connected account?")) return;
    try {
      await fetch(`/api/copy-accounts/${id}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "Account removed" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const accountTypeMeta: Record<string, { color: string; bg: string }> = {
    binance: { color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
    bybit:   { color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
    mt5:     { color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  };

  return (
    <div className="space-y-8">
      {/* ── Quick Trade Panel (instructor / admin only) ── */}
      {isInstructor && myTrader && (
        <QuickTradePanel
          traderId={myTrader.id}
          subscriberCount={subscriberCount}
          onSignalCreated={(sig) => setSignals((prev) => [sig, ...prev])}
        />
      )}
      {isInstructor && !myTrader && !loading && (
        <div className="rounded-xl border border-dashed border-primary/30 p-4 text-center text-sm text-muted-foreground bg-primary/5">
          <Crosshair className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
          <p>No trader profile linked to your account. Create one to enable direct trade execution.</p>
        </div>
      )}

      {/* ── Connected Accounts ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Connected Accounts</h2>
            <p className="text-xs text-muted-foreground">Broker accounts where trades will be auto-executed</p>
          </div>
          <Button size="sm" onClick={() => setShowConnectModal(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Connect Account
          </Button>
        </div>

        {loading ? (
          <div className="flex gap-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-56 rounded-xl" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Link2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No accounts connected yet. Add your Binance, Bybit, or MT5 account to enable auto-execution.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {accounts.map((a) => {
              const meta = accountTypeMeta[a.type] ?? { color: "text-foreground", bg: "bg-secondary" };
              return (
                <div key={a.id} className={`rounded-xl border px-4 py-3 flex items-center gap-3 min-w-[220px] ${meta.bg}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold uppercase tracking-wide ${meta.color}`}>{a.type}</p>
                    <p className="text-sm font-medium truncate">{a.label}</p>
                    {a.apiKeyHint && <p className="text-[11px] text-muted-foreground font-mono">{a.apiKeyHint}</p>}
                    {a.mt5Login && <p className="text-[11px] text-muted-foreground">Login: {a.mt5Login} · {a.mt5Server}</p>}
                    {a.status === "error" && <p className="text-[11px] text-red-500 truncate">{a.lastError}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${a.status === "active" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                      {a.status}
                    </span>
                    <button onClick={() => deleteAccount(a.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Plan / Copier Usage Banner ── */}
      {!isInstructor && (() => {
        const plan = user?.plan ?? "free";
        const limits: Record<string, number> = { free: 1, pro: 3, premium: -1, elite: -1 };
        const limit = limits[plan] ?? 1;
        const used = subscriptions.filter((s) => s.status === "active").length;
        const isUnlimited = limit === -1;
        const atLimit = !isUnlimited && used >= limit;
        const planColors: Record<string, string> = {
          free:    "border-gray-200 bg-gray-50 text-gray-700",
          pro:     "border-blue-200 bg-blue-50 text-blue-800",
          premium: "border-amber-200 bg-amber-50 text-amber-800",
          elite:   "border-purple-200 bg-purple-50 text-purple-800",
        };
        const planIcons: Record<string, React.ReactNode> = {
          premium: <Crown className="h-3.5 w-3.5" />,
          elite:   <Sparkles className="h-3.5 w-3.5" />,
        };
        return (
          <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${planColors[plan] ?? planColors.free}`}>
            <div className="flex items-center gap-1.5 font-semibold text-sm capitalize">
              {planIcons[plan]}
              {plan} Plan
            </div>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-sm">
              {isUnlimited
                ? <><span className="font-semibold">{used}</span> active copier{used !== 1 ? "s" : ""} <span className="text-green-600 font-medium">(unlimited)</span></>
                : <><span className="font-semibold">{used}</span> / {limit} copier{limit !== 1 ? "s" : ""} used</>
              }
            </span>
            {atLimit && (
              <span className="ml-auto text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
                Upgrade to Premium for unlimited copiers →
              </span>
            )}
            {!atLimit && !isUnlimited && (
              <span className="ml-auto text-xs text-muted-foreground">{limit - used} slot{limit - used !== 1 ? "s" : ""} remaining</span>
            )}
          </div>
        );
      })()}

      {/* ── Active Subscriptions ── */}
      {subscriptions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            Active Subscriptions
            <Badge variant="secondary">{subscriptions.length}</Badge>
          </h2>
          <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-primary/10">
                <tr className="text-xs text-muted-foreground border-b border-primary/10">
                  <th className="text-left px-4 py-2.5 font-medium">Trader</th>
                  <th className="text-left px-4 py-2.5 font-medium">Account</th>
                  <th className="text-right px-4 py-2.5 font-medium">Lot ×</th>
                  <th className="text-right px-4 py-2.5 font-medium">P&amp;L</th>
                  <th className="text-right px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id} className="border-b border-primary/10 last:border-0">
                    <td className="px-4 py-3 font-medium">{s.traderName ?? `Trader #${s.traderId}`}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {s.accountLabel ?? <span className="italic">Signal only</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{s.lotMultiplier}×</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold">
                      {s.currentPnl != null
                        ? <span className={s.currentPnl >= 0 ? "text-green-500" : "text-red-500"}>{s.currentPnl >= 0 ? "+" : ""}${s.currentPnl.toFixed(2)}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive text-xs"
                        onClick={() => unfollow(s.traderId)} disabled={actingId === s.traderId}>
                        Unfollow
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Signal Feed ── */}
      {signals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />Signal Feed
          </h2>
          <div className="space-y-2">
            {signals.slice(0, 10).map((sig) => (
              <div key={sig.id} className="rounded-xl border border-border bg-secondary/20 px-4 py-3 flex items-center gap-3 flex-wrap">
                <ActionBadge action={sig.action} />
                <span className="font-bold font-mono text-sm">{sig.symbol}</span>
                <span className="text-xs text-muted-foreground uppercase">{sig.market}</span>
                {sig.price && <span className="text-xs">@ {sig.price}</span>}
                <span className="text-xs text-muted-foreground">Qty: {sig.quantity}</span>
                {sig.stopLoss && <span className="text-xs text-red-400">SL: {sig.stopLoss}</span>}
                {sig.takeProfit && <span className="text-xs text-green-400">TP: {sig.takeProfit}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <StatusIcon status={sig.status} />
                  <span className="text-[11px] text-muted-foreground">{new Date(sig.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Execution History ── */}
      {copyTrades.length > 0 && (
        <section className="space-y-3">
          <button className="flex items-center gap-2 text-base font-semibold hover:text-primary transition-colors"
            onClick={() => setShowHistory(!showHistory)}>
            Execution History
            <Badge variant="secondary">{copyTrades.length}</Badge>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showHistory && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40">
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium">Signal</th>
                    <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                    <th className="text-right px-4 py-2.5 font-medium">Price</th>
                    <th className="text-right px-4 py-2.5 font-medium">Order ID</th>
                    <th className="text-center px-4 py-2.5 font-medium">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {copyTrades.map((t) => (
                    <tr key={t.id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2.5 text-muted-foreground">#{t.signalId}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{t.quantity ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{t.executedPrice ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{t.brokerOrderId ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <StatusIcon status={t.status} />
                          {t.status === "failed" && t.errorMessage && (
                            <span className="text-[10px] text-red-400 max-w-[120px] truncate" title={t.errorMessage}>{t.errorMessage}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Top Traders ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Top Traders</h2>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
          </Button>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)
            : traders.map((trader, idx) => {
                const isFollowing = subscribedTraderIds.has(trader.id);
                return (
                  <Card key={trader.id} className="relative overflow-hidden">
                    {trader.verified && (
                      <div className="absolute top-3 right-3">
                        <ShieldCheck className="h-4 w-4 text-primary" title="Verified" />
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm border border-primary/30">
                          {trader.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold truncate">{trader.displayName}</p>
                            {idx < 3 && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-yellow-500/40 text-yellow-500">
                                #{idx + 1}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{trader.markets.join(" · ")}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-green-500">+{trader.roi.toFixed(1)}%</p>
                          <p className="text-[10px] text-muted-foreground">All time ROI</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {trader.bio && <p className="text-xs text-muted-foreground line-clamp-2">{trader.bio}</p>}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <p className="text-[10px] text-muted-foreground">Win Rate</p>
                          <p className="font-bold text-sm">{trader.winRate.toFixed(1)}%</p>
                        </div>
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <p className="text-[10px] text-muted-foreground">Max DD</p>
                          <p className="font-bold text-sm text-red-400">{trader.maxDrawdown.toFixed(1)}%</p>
                        </div>
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <p className="text-[10px] text-muted-foreground">Followers</p>
                          <p className="font-bold text-sm">{trader.followers.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Risk Level</p>
                        <RiskBar score={trader.riskScore} />
                      </div>
                      <div className="flex items-center justify-between">
                        {trader.monthlyReturn != null && (
                          <div className="flex items-center gap-1 text-green-500">
                            <TrendingUp className="h-3 w-3" />
                            <span className="text-xs font-medium">+{trader.monthlyReturn.toFixed(1)}%/mo</span>
                          </div>
                        )}
                        {isFollowing ? (
                          <Button size="sm" variant="outline" className="ml-auto text-destructive border-destructive/30"
                            onClick={() => unfollow(trader.id)} disabled={actingId === trader.id}>
                            Unfollow
                          </Button>
                        ) : (
                          <Button size="sm" className="ml-auto"
                            onClick={() => setSubscribeTrader(trader)} disabled={actingId === trader.id}>
                            Copy Trader
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
        {traders.length === 0 && !loading && (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No traders available yet.</p>
          </div>
        )}
      </section>

      {/* ── Modals ── */}
      <ConnectAccountModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onCreated={(a) => setAccounts((prev) => [a, ...prev])}
      />
      <SubscribeModal
        trader={subscribeTrader}
        accounts={accounts}
        open={!!subscribeTrader}
        onClose={() => setSubscribeTrader(null)}
        onSubscribed={load}
      />
    </div>
  );
}
