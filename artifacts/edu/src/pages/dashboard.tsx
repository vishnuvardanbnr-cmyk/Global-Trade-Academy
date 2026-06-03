import { useGetMe, useGetDashboardSummary, useGetLeaderboard, useGetRecentActivity, useListEnrollments, useListCourses, useListLiveClasses } from "@workspace/api-client-react";
import type { LiveClass } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Trophy, TrendingUp, Video, ArrowUpRight,
  Star, Clock, CheckCircle2, Target, Zap, BarChart3, Activity,
  Users, GraduationCap, Radio, Calendar, Megaphone, Pin, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const ANNOUNCEMENTS = [
  {
    id: 1,
    icon: Pin,
    color: "bg-blue-50 text-blue-600",
    pinned: true,
    title: "New Course: Advanced Forex Strategies",
    body: "Our most-requested course is now live. Master institutional order flow, supply & demand zones, and high-probability setups.",
    date: "Jun 2, 2026",
  },
  {
    id: 2,
    icon: Video,
    color: "bg-violet-50 text-violet-600",
    pinned: false,
    title: "Weekly Live Session — Every Friday 8 PM UTC",
    body: "Join our lead instructor for a live market analysis session covering key levels and upcoming week opportunities.",
    date: "Jun 1, 2026",
  },
  {
    id: 3,
    icon: Info,
    color: "bg-amber-50 text-amber-600",
    pinned: false,
    title: "Platform Update: Live Room Q&A & Polls",
    body: "You can now ask questions and participate in polls during live sessions. Look for the sidebar inside any live room.",
    date: "May 30, 2026",
  },
];

const ACTIVITY_META: Record<string, { icon: typeof CheckCircle2; color: string; xp: string }> = {
  enrollment:      { icon: GraduationCap, color: "text-blue-500 bg-blue-50",    xp: "+25 XP" },
  lesson_complete: { icon: CheckCircle2,  color: "text-emerald-500 bg-emerald-50", xp: "+50 XP" },
  live_class:      { icon: Video,          color: "text-blue-500 bg-blue-50",    xp: "+30 XP" },
  post:            { icon: Users,          color: "text-violet-500 bg-violet-50", xp: "+10 XP" },
  copy_trade:      { icon: TrendingUp,     color: "text-emerald-500 bg-emerald-50", xp: "+25 XP" },
  achievement:     { icon: Star,           color: "text-amber-500 bg-amber-50",  xp: "+100 XP" },
};

function timeAgo(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export default function Dashboard() {
  const { user: clerkUser } = useUser();
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: leaderboard, isLoading: leaderLoading } = useGetLeaderboard();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();
  const { data: enrollments } = useListEnrollments();
  const { data: allCourses } = useListCourses({});
  const { data: liveClasses, isLoading: liveLoading } = useListLiveClasses({});

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
      sub: "Keep learning to earn more",
      icon: Trophy,
      gradient: "stat-card-amber",
    },
    {
      label: "Copy Subscriptions",
      value: isLoading ? "—" : String(summary?.copySubscriptions ?? 0),
      sub: "Active traders copied",
      icon: TrendingUp,
      gradient: "stat-card-green",
    },
    {
      label: "Upcoming Classes",
      value: isLoading ? "—" : String(summary?.upcomingClasses ?? 0),
      sub: summary?.upcomingClasses ? "Registered & scheduled" : "Browse live sessions",
      icon: Video,
      gradient: "stat-card-purple",
    },
  ];

  const enrolledCourses = (enrollments ?? [])
    .map(e => ({ enrollment: e, course: (allCourses ?? []).find(c => c.id === e.courseId) }))
    .filter(ec => ec.course)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-64 mb-2" />
          ) : (
            <h1 className="text-2xl font-bold text-foreground">
              Hello, {clerkUser?.fullName ?? clerkUser?.firstName ?? user?.displayName ?? "Trader"} 👋
            </h1>
          )}
          <p className="text-sm text-muted-foreground">Here's what's happening with your portfolio and learning today.</p>
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

      {/* Learning Progress + Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-xs border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">My Courses</CardTitle>
            <Link href="/courses">
              <button className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                Browse All <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : enrolledCourses.length > 0 ? (
              <div className="space-y-5">
                {enrolledCourses.map(({ enrollment, course }) => (
                  <Link key={enrollment.id} href={`/courses/${course!.id}`}>
                    <div className="cursor-pointer group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[280px]">{course!.title}</span>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <Badge variant="outline" className="text-[10px] capitalize">{course!.level}</Badge>
                          <span className="text-xs text-muted-foreground">{course!.lessonCount} lessons</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", enrollment.status === "completed" ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${enrollment.progress ?? 0}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground w-9 text-right">{enrollment.progress ?? 0}%</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <GraduationCap className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No courses enrolled yet</p>
                <p className="text-xs text-muted-foreground mb-4">Start with a free course to earn your first XP</p>
                <Link href="/courses">
                  <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
                    Browse Courses
                  </button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card className="shadow-xs border-border flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Announcements</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1 space-y-3 pb-4">
            {ANNOUNCEMENTS.map((a) => (
              <div key={a.id} className="flex gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.color}`}>
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {a.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                    <p className="text-sm font-semibold text-foreground leading-tight truncate">{a.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{a.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{a.date}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Live Sessions + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live Sessions */}
        <Card className="shadow-xs border-border flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Live Sessions</CardTitle>
            <Link href="/live">
              <button className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5">
                See all <ArrowUpRight className="h-3 w-3" />
              </button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {liveLoading ? (
              <div className="space-y-3 px-6 py-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (() => {
              const live     = (liveClasses ?? []).filter((c: LiveClass) => c.status === "live");
              const upcoming = (liveClasses ?? []).filter((c: LiveClass) => c.status === "scheduled");
              const shown    = [...live, ...upcoming].slice(0, 4);

              if (shown.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-full min-h-[180px] px-6 py-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-3">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No sessions scheduled</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">
                      Live trading sessions will appear here when instructors go live or post upcoming classes.
                    </p>
                    <Link href="/live">
                      <button className="mt-3 text-xs text-primary hover:underline font-medium">Browse schedule</button>
                    </Link>
                  </div>
                );
              }

              return (
                <div className="divide-y divide-border">
                  {shown.map((session: LiveClass) => {
                    const isLive = session.status === "live";
                    const diff   = new Date(session.scheduledAt).getTime() - Date.now();
                    const h      = Math.floor(diff / 3_600_000);
                    const m      = Math.floor((diff % 3_600_000) / 60_000);
                    const when   = diff <= 0 ? "Starting now" : h >= 24 ? `In ${Math.floor(h / 24)}d` : `In ${h}h ${m}m`;

                    return (
                      <div key={session.id} className="flex items-start gap-3 px-5 py-3 hover:bg-secondary/40 transition-colors">
                        <div className={cn(
                          "mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isLive ? "bg-red-50" : "bg-blue-50",
                        )}>
                          <Radio className={cn("h-4 w-4", isLive ? "text-red-500" : "text-blue-400")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight truncate">{session.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {session.instructorName ?? "Instructor"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {isLive ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-red-500 hover:bg-red-500 text-white border-0 gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                LIVE
                              </Badge>
                            ) : (
                              <span className="text-[11px] font-medium text-yellow-600">{when}</span>
                            )}
                            {session.meetingUrl && isLive && (
                              <a
                                href={session.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5"
                              >
                                Join <ArrowUpRight className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Activity feed — real from DB */}
        <Card className="lg:col-span-2 shadow-xs border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Platform Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            {activityLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (activity ?? []).length > 0 ? (
              (activity ?? []).slice(0, 5).map((item) => {
                const meta = ACTIVITY_META[item.type] ?? ACTIVITY_META.achievement;
                const Icon = meta.icon;
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{timeAgo(item.createdAt as string)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs shrink-0">
                      {meta.xp}
                    </Badge>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="shadow-xs border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">XP Leaderboard</CardTitle>
          <Badge variant="secondary" className="text-xs">All Time</Badge>
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
                <p className="text-sm text-muted-foreground text-center py-6">Be the first on the leaderboard — enroll in a course!</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
