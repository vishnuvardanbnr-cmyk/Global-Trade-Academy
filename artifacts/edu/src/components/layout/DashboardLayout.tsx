import { Link, useLocation, useSearch } from "wouter";
import { useAuthContext, useUser } from "@/lib/authContext";
import {
  LayoutDashboard, BookOpen, LineChart, Users, Video, MessageSquare,
  LogOut, ShieldAlert, Shield, TrendingUp, Bell, Search, Menu, X,
  ChevronRight, GraduationCap, Zap, Award, UserCircle2,
  Settings, User, CheckCheck, BarChart3, Layers, ClipboardCheck, Activity,
  Calendar, Megaphone, Moon, Sun,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";
import { useGetMe, useGetInstructorReviewCount, getGetInstructorReviewCountQueryKey, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AppNotification {
  id: number;
  type: string;
  title: string;
  message?: string | null;
  relatedId?: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const NOTIF_ICON: Record<string, string> = {
  gate_approved: "✅",
  gate_rejected: "📝",
  task_approved: "✅",
  task_rejected: "📝",
  announcement: "📣",
  new_lesson: "🎓",
  live_class: "🎥",
  default: "🔔",
};

const studentNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trading", label: "Markets", icon: LineChart },
  { href: "/courses", label: "Academy", icon: BookOpen },
  { href: "/certificates", label: "Certificates", icon: Award },
  { href: "/live", label: "Live Sessions", icon: Video },
  { href: "/copy-trading", label: "Copy Trading", icon: TrendingUp },
  { href: "/community", label: "Community", icon: MessageSquare },
];

const instructorNav = [
  { href: "/instructor", label: "Overview", icon: LayoutDashboard, tab: "" },
  { href: "/instructor", label: "Courses", icon: BookOpen, tab: "courses" },
  { href: "/instructor", label: "Students", icon: Users, tab: "students" },
  { href: "/instructor", label: "Analytics", icon: BarChart3, tab: "analytics" },
  { href: "/instructor", label: "Enrollments", icon: GraduationCap, tab: "enrollments" },
  { href: "/instructor", label: "Batches", icon: Layers, tab: "batches" },
  { href: "/instructor", label: "Reviews", icon: ClipboardCheck, tab: "reviews" },
  { href: "/courses", label: "Academy", icon: BookOpen, divider: true },
  { href: "/live", label: "Live Sessions", icon: Video },
];

const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, tab: "" },
  { href: "/admin", label: "Users", icon: Users, tab: "users" },
  { href: "/admin", label: "Courses", icon: BookOpen, tab: "courses" },
  { href: "/admin", label: "Live Classes", icon: Video, tab: "live-classes" },
  { href: "/admin", label: "Enrollments", icon: GraduationCap, tab: "enrollments" },
  { href: "/admin", label: "Community", icon: MessageSquare, tab: "community" },
  { href: "/admin", label: "Events", icon: Calendar, tab: "events" },
  { href: "/admin", label: "Broadcast", icon: Megaphone, tab: "broadcast" },
  { href: "/admin", label: "Activity", icon: Activity, tab: "activity" },
  { href: "/courses", label: "Academy", icon: BookOpen, divider: true },
  { href: "/live", label: "Live Sessions", icon: Video },
];

const XP_PER_LEVEL = 500;

function CompleteProfileDialog({ onDone }: { onDone: () => void }) {
  const { mutateAsync: updateMe } = useUpdateMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    setSaving(true);
    try {
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      await updateMe({ data: { displayName } });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Profile updated!", description: `Welcome, ${displayName}!` });
      onDone();
    } catch {
      toast({ title: "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <UserCircle2 className="h-6 w-6 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 text-center mb-1">Complete your profile</h2>
        <p className="text-sm text-slate-500 text-center mb-5">Tell us your name so we can personalise your experience.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">First name *</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Alex"
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Johnson"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !firstName.trim()}
            className="w-full mt-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuthContext();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileDismissed, setProfileDismissed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: me } = useGetMe();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const { isDark, toggle: toggleTheme } = useTheme();
  const userId = user?.id ?? null;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) return;
      const data = await r.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch { }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [userId, fetchNotifications]);

  const markRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const role = me?.role;
  const isInstructor = role === "instructor";
  const displayName = me?.displayName || user?.fullName || "Trader";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = displayName.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();

  const hasName = !!me?.displayName;
  const showProfileDialog = me !== undefined && !hasName && !profileDismissed;

  const xp = me?.xp ?? 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL;

  const { data: reviewCount } = useGetInstructorReviewCount({
    query: {
      enabled: isInstructor,
      queryKey: getGetInstructorReviewCountQueryKey(),
      refetchInterval: 30000,
    },
  });
  const pendingReviews = reviewCount?.pending ?? 0;

  const isFullBleed = location.startsWith("/courses/");

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center px-5 border-b border-border shrink-0">
        <Link href={role === "instructor" ? "/instructor" : role === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <LineChart className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <span className="font-bold text-foreground text-[15px] tracking-tight">Bright Insight</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          {role === "instructor" ? "Instructor" : role === "admin" ? "Admin" : "Navigation"}
        </p>
        {(role === "instructor" ? instructorNav : role === "admin" ? adminNav : studentNav).map((item) => {
          const currentTab = new URLSearchParams(window.location.search).get("tab") ?? "";
          const isActive = "tab" in item
            ? location === item.href && currentTab === (item.tab ?? "")
            : location === item.href || location.startsWith(item.href + "/");
          const showBadge = "tab" in item && item.tab === "reviews" && pendingReviews > 0;
          const itemHref = "tab" in item && item.tab ? `${item.href}?tab=${item.tab}` : item.href;
          return (
            <Fragment key={item.label}>
              {!!(item as { divider?: boolean }).divider && (
                <div className="mt-4 mb-2 px-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">General</p>
                </div>
              )}
              <Link href={itemHref} onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer group",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                  <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1",
                      isActive ? "bg-white text-primary" : "bg-red-500 text-white"
                    )}>
                      {pendingReviews > 99 ? "99+" : pendingReviews}
                    </span>
                  )}
                  {isActive && !showBadge && <ChevronRight className="h-3.5 w-3.5 opacity-60 shrink-0" />}
                </div>
              </Link>
            </Fragment>
          );
        })}

        {role === "student" || !role ? (
          <div className="mt-4 mx-1 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-800">Level {level} Trader</span>
            </div>
            <div className="w-full bg-amber-100 rounded-full h-1.5 mb-1">
              <div className="bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((xpIntoLevel / xpToNext) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-amber-600">{xpIntoLevel.toLocaleString()} / {xpToNext.toLocaleString()} XP to Level {level + 1}</p>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-border px-3 py-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-secondary transition-colors cursor-default">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
        </div>
        <Button
          variant="ghost" size="sm"
          className="w-full justify-start mt-1 text-muted-foreground hover:text-foreground text-sm"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {showProfileDialog && <CompleteProfileDialog onDone={() => setProfileDismissed(true)} />}
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-sidebar flex-col h-screen">
          {sidebarContent}
        </aside>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="relative w-60 bg-sidebar border-r border-border flex flex-col">
              {sidebarContent}
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 border-b border-border bg-background flex items-center gap-4 px-4 md:px-6 shrink-0 z-10">
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-secondary transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="flex-1 max-w-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search courses, traders, symbols…"
                  className="w-full h-9 pl-9 pr-4 text-sm bg-secondary rounded-lg border border-transparent focus:border-primary focus:bg-background focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleTheme}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
              >
                {isDark ? <Sun className="h-4.5 w-4.5 text-muted-foreground" /> : <Moon className="h-4.5 w-4.5 text-muted-foreground" />}
              </button>

              <div ref={bellRef} className="relative">
                <button
                  onClick={() => { setBellOpen(o => !o); setMenuOpen(false); }}
                  className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
                >
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 rounded-full ring-2 ring-white text-[9px] font-bold text-white px-0.5">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-2xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Notifications</p>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{unreadCount} new</span>
                      )}
                    </div>
                    <div className="divide-y divide-border max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">No notifications yet</p>
                        </div>
                      ) : notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => { if (!n.read) markRead(n.id); }}
                          className={cn("flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 cursor-pointer transition-colors", !n.read && "bg-blue-50/40")}
                        >
                          <span className="text-lg leading-none mt-0.5">{NOTIF_ICON[n.type] ?? NOTIF_ICON.default}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight">{n.title}</p>
                            {n.message && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{n.message}</p>}
                            <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                          </div>
                          {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />}
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                      {unreadCount > 0 ? (
                        <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                        </button>
                      ) : <span />}
                      <span className="text-[10px] text-muted-foreground">{notifications.length} total</span>
                    </div>
                  </div>
                )}
              </div>

              <div ref={menuRef} className="relative">
                <button
                  onClick={() => { setMenuOpen(o => !o); setBellOpen(false); }}
                  className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  {initials || "U"}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-popover border border-border rounded-2xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{email}</p>
                    </div>
                    <div className="py-1">
                      <Link href="/settings" onClick={() => setMenuOpen(false)}>
                        <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-secondary cursor-pointer transition-colors">
                          <User className="h-4 w-4 text-muted-foreground" /> My Profile
                        </button>
                      </Link>
                      <Link href="/settings" onClick={() => setMenuOpen(false)}>
                        <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-secondary cursor-pointer transition-colors">
                          <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                        </button>
                      </Link>
                    </div>
                    <div className="border-t border-border py-1">
                      <button
                        onClick={() => { setMenuOpen(false); signOut({ redirectUrl: "/" }); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <LogOut className="h-4 w-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className={cn("flex-1 overflow-y-auto bg-background", !isFullBleed && "overflow-y-auto")}>
            {isFullBleed ? (
              children
            ) : (
              <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
                {children}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
