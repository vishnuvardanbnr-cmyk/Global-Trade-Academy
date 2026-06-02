import { useGetMe, useGetDashboardSummary, useGetLeaderboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen, Trophy, TrendingUp, Video, Flame, ArrowUpRight, ArrowDownRight,
  Star, Clock, CheckCircle2, Target, Zap, BarChart3, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const watchlistData = [
  { symbol: "BTC/USD", price: "$67,420", change: "+3.12%", up: true },
  { symbol: "ETH/USD", price: "$3,840", change: "+1.87%", up: true },
  { symbol: "EUR/USD", price: "1.0842", change: "-0.14%", up: false },
  { symbol: "GLD", price: "$2,180", change: "+0.72%", up: true },
  { symbol: "SPX500", price: "5,248", change: "+0.44%", up: true },
];

const recentActivity = [
  { icon: CheckCircle2, color: "text-emerald-500 bg-emerald-50", label: "Completed: Advanced Price Action", time: "2h ago", xp: "+50 XP" },
  { icon: Star, color: "text-amber-500 bg-amber-50", label: "Earned Badge: First Trade Analysis", time: "5h ago", xp: "+100 XP" },
  { icon: Video, color: "text-blue-500 bg-blue-50", label: "Joined Live Session: Forex Scalping", time: "Yesterday", xp: "+30 XP" },
  { icon: TrendingUp, color: "text-violet-500 bg-violet-50", label: "Copied Trade: BTC Long +2.1%", time: "2d ago", xp: "+25 XP" },
];

export default function Dashboard() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: leaderboard, isLoading: leaderLoading } = useGetLeaderboard();

  const isLoading = userLoading || summaryLoading;

  const statCards = [
    {
      label: "Active Courses",
      value: isLoading ? "—" : String(summary?.enrolledCourses ?? 0),
      sub: `${summary?.completedCourses ?? 0} completed`,
      icon: BookOpen,
      gradient: "stat-card-blue",
    },
    {
      label: "Total XP",
      value: isLoading ? "—" : (user?.xp ?? 0).toLocaleString(),
      sub: "Top 15% of students",
      icon: Trophy,
      gradient: "stat-card-amber",
    },
    {
      label: "Copy P&L",
      value: "+$1,240.50",
      sub: "+4.5% this month",
      icon: TrendingUp,
      gradient: "stat-card-green",
    },
    {
      label: "Upcoming Classes",
      value: isLoading ? "—" : String(summary?.upcomingClasses ?? 0),
      sub: "Next in 2 hours",
      icon: Video,
      gradient: "stat-card-purple",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-64 mb-2" />
          ) : (
            <h1 className="text-2xl font-bold text-foreground">
              Good morning, {user?.displayName || user?.email?.split("@")[0] || "Trader"} 👋
            </h1>
          )}
          <p className="text-sm text-muted-foreground">Here's what's happening with your portfolio and learning today.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full px-3 py-1.5 text-sm font-medium">
          <Flame className="h-3.5 w-3.5" />
          <span>7-day streak</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className={`${card.gradient} rounded-2xl p-5 text-white shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-white/80">{card.label}</p>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <card.icon className="h-4.5 w-4.5 text-white" />
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-white/20 mb-1" />
            ) : (
              <div className="text-3xl font-extrabold">{card.value}</div>
            )}
            <p className="text-xs text-white/70 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Learning Progress */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-xs border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Learning Progress</CardTitle>
            <Link href="/courses">
              <button className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                View All <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { name: "Forex Fundamentals", progress: 78, lessons: "14/18", color: "bg-blue-500" },
              { name: "Technical Analysis Pro", progress: 45, lessons: "9/20", color: "bg-violet-500" },
              { name: "Risk Management Mastery", progress: 20, lessons: "3/15", color: "bg-emerald-500" },
            ].map((course) => (
              <div key={course.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">{course.name}</span>
                  <span className="text-xs text-muted-foreground">{course.lessons} lessons</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${course.color} transition-all`}
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground w-9 text-right">{course.progress}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="shadow-xs border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { icon: BookOpen, label: "Continue Learning", sub: "Forex Fundamentals", href: "/courses", color: "bg-blue-50 text-blue-600" },
              { icon: BarChart3, label: "Open Markets", sub: "BTC/USD up 3.1%", href: "/trading", color: "bg-emerald-50 text-emerald-600" },
              { icon: Target, label: "Copy a Trader", sub: "3 new verified traders", href: "/copy-trading", color: "bg-violet-50 text-violet-600" },
              { icon: Zap, label: "Live Session", sub: "Starts in 2 hours", href: "/live", color: "bg-amber-50 text-amber-600" },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors cursor-pointer group">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${action.color}`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.sub}</p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Market + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Watchlist */}
        <Card className="shadow-xs border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Market Watchlist</CardTitle>
            <Link href="/trading">
              <button className="text-xs font-medium text-primary hover:underline">Open Chart</button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {watchlistData.map((item) => (
                <div key={item.symbol} className="flex items-center justify-between px-6 py-3 hover:bg-secondary/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{item.price}</p>
                    <p className={cn("text-xs font-medium flex items-center justify-end gap-0.5", item.up ? "text-emerald-600" : "text-red-500")}>
                      {item.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {item.change}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card className="lg:col-span-2 shadow-xs border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">{item.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{item.time}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs shrink-0">
                  {item.xp}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="shadow-xs border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">XP Leaderboard</CardTitle>
          <Badge variant="secondary" className="text-xs">This Week</Badge>
        </CardHeader>
        <CardContent>
          {leaderLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {(leaderboard ?? []).slice(0, 5).map((entry, idx) => {
                const rankColors = ["text-amber-500", "text-slate-400", "text-amber-700"];
                return (
                  <div key={entry.userId} className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors">
                    <span className={cn("w-6 text-center text-sm font-bold", rankColors[idx] ?? "text-muted-foreground")}>
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${entry.rank}`}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {(entry.displayName ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{entry.displayName ?? "Anonymous"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-amber-600 font-semibold text-sm">
                      <Trophy className="h-3.5 w-3.5" />
                      {(entry.xp ?? 0).toLocaleString()} XP
                    </div>
                  </div>
                );
              })}
              {(!leaderboard || leaderboard.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-6">No leaderboard data yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
