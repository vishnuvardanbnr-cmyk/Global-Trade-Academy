import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  LayoutDashboard, BookOpen, LineChart, Users, Video, MessageSquare,
  LogOut, ShieldAlert, Shield, TrendingUp, Bell, Search, Menu, X,
  ChevronRight, MessageCircle, GraduationCap, Zap, Award, UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useGetMe, useGetInstructorReviewCount, getGetInstructorReviewCountQueryKey, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trading", label: "Markets", icon: LineChart },
  { href: "/trading-chat", label: "Trading Chat", icon: MessageCircle },
  { href: "/courses", label: "Academy", icon: BookOpen },
  { href: "/certificates", label: "Certificates", icon: Award },
  { href: "/live", label: "Live Sessions", icon: Video },
  { href: "/copy-trading", label: "Copy Trading", icon: TrendingUp },
  { href: "/community", label: "Community", icon: MessageSquare },
];

const XP_PER_LEVEL = 500;

/* ─── Complete Profile Dialog ──────────────────────────────────── */
function CompleteProfileDialog({ onDone }: { onDone: () => void }) {
  const { user: clerkUser } = useUser();
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
      // Update DB
      await updateMe({ data: { displayName } });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      // Update Clerk profile so the name appears immediately everywhere
      await clerkUser?.update({ firstName: firstName.trim(), lastName: lastName.trim() });
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
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
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileDismissed, setProfileDismissed] = useState(false);
  const { data: me } = useGetMe();

  const role = me?.role;
  const isInstructor = role === "instructor";
  const initials = (user?.firstName?.charAt(0) ?? "") + (user?.lastName?.charAt(0) ?? "");

  // Show profile dialog once when user has no name in Clerk AND no displayName in DB
  const hasName = !!(user?.firstName || user?.fullName || me?.displayName);
  const showProfileDialog = me !== undefined && !hasName && !profileDismissed;

  const xp = me?.xp ?? 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL;

  // Pending review count badge — only fetched for instructors
  const { data: reviewCount } = useGetInstructorReviewCount({
    query: {
      enabled: isInstructor,
      queryKey: getGetInstructorReviewCountQueryKey(),
      refetchInterval: 30000,
    },
  });
  const pendingReviews = reviewCount?.pending ?? 0;

  /* Trading chat uses full-bleed layout with no padding */
  const isFullBleed = location.startsWith("/trading-chat");

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <LineChart className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <span className="font-bold text-foreground text-[15px] tracking-tight">EDU</span>
            <span className="font-medium text-muted-foreground text-[15px] tracking-tight"> Trading</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Navigation</p>
        {mainNav.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer group",
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}>
                <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/trading-chat" && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                )}
                {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60 shrink-0" />}
              </div>
            </Link>
          );
        })}

        {(role === "instructor" || role === "admin") && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-3 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Management</p>
            </div>
            {role === "instructor" && (
              <Link href="/instructor" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer",
                  location.startsWith("/instructor") ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Instructor Panel</span>
                  {pendingReviews > 0 && (
                    <span className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1",
                      location.startsWith("/instructor") ? "bg-white text-primary" : "bg-red-500 text-white"
                    )}>
                      {pendingReviews > 99 ? "99+" : pendingReviews}
                    </span>
                  )}
                </div>
              </Link>
            )}
            {role === "admin" && (
              <Link href="/admin" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer",
                  location.startsWith("/admin") ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                  <Shield className="h-4 w-4 shrink-0" />
                  <span>Admin Panel</span>
                </div>
              </Link>
            )}
          </>
        )}

        {/* XP level badge */}
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
      </nav>

      {/* User */}
      <div className="border-t border-border px-3 py-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-secondary transition-colors cursor-default">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.fullName || "Trader"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
        <Button
          variant="ghost" size="sm"
          className="w-full justify-start mt-1 text-muted-foreground hover:text-foreground text-sm"
          onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-white flex-col h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-60 bg-white border-r border-border flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-16 border-b border-border bg-white flex items-center gap-4 px-4 md:px-6 shrink-0 z-10">
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-secondary transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Search */}
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search courses, traders, symbols…"
                className="w-full h-9 pl-9 pr-4 text-sm bg-secondary rounded-lg border border-transparent focus:border-primary focus:bg-white focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Right side actions */}
          <div className="ml-auto flex items-center gap-2">
            <Link href="/trading-chat">
              <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Chat
              </button>
            </Link>
            <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
            </button>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold cursor-pointer">
              {initials || "U"}
            </div>
          </div>
        </header>

        {/* Page content */}
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
