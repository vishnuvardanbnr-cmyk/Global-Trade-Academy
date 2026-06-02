import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  LayoutDashboard,
  BookOpen,
  LineChart,
  Users,
  Video,
  MessageSquare,
  LogOut,
  Settings,
  ShieldAlert,
  Shield,
  TrendingUp,
  Bell,
  Search,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trading", label: "Markets", icon: LineChart },
  { href: "/courses", label: "Academy", icon: BookOpen },
  { href: "/live", label: "Live Sessions", icon: Video },
  { href: "/copy-trading", label: "Copy Trading", icon: TrendingUp },
  { href: "/community", label: "Community", icon: MessageSquare },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.publicMetadata?.role as string | undefined;
  const initials = (user?.firstName?.charAt(0) ?? "") + (user?.lastName?.charAt(0) ?? "");

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <LineChart className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <span className="font-bold text-foreground text-[15px] tracking-tight">EDU</span>
            <span className="font-medium text-muted-foreground text-[15px] tracking-tight"> Trading</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Main</p>
        {mainNav.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}>
                <item.icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground")} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />}
              </div>
            </Link>
          );
        })}

        {(role === "instructor" || role === "admin") && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-3 mb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Management</p>
            </div>
            {role === "instructor" && (
              <Link href="/instructor" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
                  location.startsWith("/instructor")
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                  <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
                  <span>Instructor Panel</span>
                </div>
              </Link>
            )}
            {role === "admin" && (
              <Link href="/admin" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
                  location.startsWith("/admin")
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                  <Shield className="h-4.5 w-4.5 shrink-0" />
                  <span>Admin Panel</span>
                </div>
              </Link>
            )}
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-border px-3 py-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary transition-colors cursor-default">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.fullName || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start mt-1 text-muted-foreground hover:text-foreground hover:bg-secondary text-sm"
          onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-white flex-col">
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 border-b border-border bg-white flex items-center gap-4 px-4 md:px-6 shrink-0">
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
                placeholder="Search courses, traders…"
                className="w-full h-9 pl-9 pr-4 text-sm bg-secondary rounded-lg border border-transparent focus:border-primary focus:bg-white focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
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
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
