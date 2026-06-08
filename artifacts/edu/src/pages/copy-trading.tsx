import { useState } from "react";
import { useListTraders, useListCopySubscriptions, useCreateCopySubscription, useDeleteCopySubscription, getListTradersQueryKey, getListCopySubscriptionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Users, ShieldCheck } from "lucide-react";

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

export default function CopyTrading() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState<number | null>(null);

  const { data: traders, isLoading: tradersLoading } = useListTraders({});
  const { data: subscriptions } = useListCopySubscriptions({ query: { queryKey: getListCopySubscriptionsQueryKey() } });

  const subscribedTraderIds = new Set(subscriptions?.map((s) => s.traderId) ?? []);

  const createSub = useCreateCopySubscription({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCopySubscriptionsQueryKey() });
        qc.invalidateQueries({ queryKey: getListTradersQueryKey() });
        toast({ title: "Now copying this trader" });
        setLoading(null);
      },
      onError: () => {
        toast({ title: "Failed to follow trader", variant: "destructive" });
        setLoading(null);
      },
    },
  });

  const deleteSub = useDeleteCopySubscription({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCopySubscriptionsQueryKey() });
        toast({ title: "Stopped copying trader" });
        setLoading(null);
      },
      onError: () => {
        toast({ title: "Failed to unfollow", variant: "destructive" });
        setLoading(null);
      },
    },
  });

  const handleToggle = (traderId: number) => {
    setLoading(traderId);
    const existingSub = subscriptions?.find((s) => s.traderId === traderId);
    if (existingSub) {
      deleteSub.mutate({ subscriptionId: existingSub.id });
    } else {
      createSub.mutate({ data: { traderId } });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        {subscriptions && subscriptions.length > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {subscriptions.length} active {subscriptions.length === 1 ? "subscription" : "subscriptions"}
          </Badge>
        )}
      </div>

      {/* Active Subscriptions */}
      {subscriptions && subscriptions.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Your Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium">{sub.traderName ?? `Trader #${sub.traderId}`}</p>
                    <p className="text-xs text-muted-foreground">Status: {sub.status}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {sub.currentPnl != null && (
                      <span className={`font-semibold text-sm ${sub.currentPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {sub.currentPnl >= 0 ? "+" : ""}${sub.currentPnl.toFixed(2)}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-unfollow-${sub.traderId}`}
                      onClick={() => handleToggle(sub.traderId)}
                      disabled={loading === sub.traderId}
                    >
                      Unfollow
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trader Leaderboard */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Top Traders</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {tradersLoading
            ? Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)
            : traders?.map((trader, idx) => {
                const isFollowing = subscribedTraderIds.has(trader.id);
                return (
                  <Card key={trader.id} className="relative overflow-hidden" data-testid={`card-trader-${trader.id}`}>
                    {trader.verified && (
                      <div className="absolute top-3 right-3">
                        <ShieldCheck className="h-4 w-4 text-primary" />
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
                          <p className="text-xs text-muted-foreground truncate">{trader.markets?.join(" • ")}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-green-500">+{trader.roi.toFixed(1)}%</p>
                          <p className="text-[10px] text-muted-foreground">All time ROI</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground line-clamp-2">{trader.bio}</p>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">Win Rate</p>
                          <p className="font-bold text-sm">{trader.winRate.toFixed(1)}%</p>
                        </div>
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">Max DD</p>
                          <p className="font-bold text-sm text-red-400">{trader.maxDrawdown?.toFixed(1) ?? "—"}%</p>
                        </div>
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">Followers</p>
                          <p className="font-bold text-sm">{trader.followers?.toLocaleString() ?? "—"}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Risk Level</p>
                        <RiskBar score={trader.riskScore} />
                      </div>
                      <div className="flex items-center justify-between">
                        {trader.monthlyReturn != null && (
                          <div className="flex items-center gap-1 text-green-500">
                            <TrendingUp className="h-3 w-3" />
                            <span className="text-xs font-medium">+{trader.monthlyReturn.toFixed(1)}%/mo</span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant={isFollowing ? "outline" : "default"}
                          className="ml-auto"
                          data-testid={`button-follow-${trader.id}`}
                          onClick={() => handleToggle(trader.id)}
                          disabled={loading === trader.id}
                        >
                          {isFollowing ? "Unfollow" : "Copy Trader"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
        {traders?.length === 0 && !tradersLoading && (
          <div className="py-16 text-center text-muted-foreground">No traders available.</div>
        )}
      </div>
    </div>
  );
}
