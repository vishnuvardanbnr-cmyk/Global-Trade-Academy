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
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trading", label: "Markets", icon: LineChart },
  { href: "/courses", label: "Academy", icon: BookOpen },
  { href: "/live", label: "Live Sessions", icon: Video },
  { href: "/copy-trading", label: "Copy Trading", icon: Users },
  { href: "/community", label: "Community", icon: MessageSquare },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl text-primary">
            <LineChart className="h-6 w-6" />
            <span>EDU Trading</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
          
          <div className="pt-8 pb-2">
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</p>
          </div>
          
          <Link href="/settings">
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
              location.startsWith("/settings") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Settings className="h-5 w-5" />
              <span className="font-medium">Settings</span>
            </div>
          </Link>
          
          {user?.publicMetadata?.role === "instructor" && (
            <Link href="/instructor">
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                location.startsWith("/instructor") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}>
                <ShieldAlert className="h-5 w-5" />
                <span className="font-medium">Instructor Panel</span>
              </div>
            </Link>
          )}
        </nav>
        
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.firstName?.charAt(0) || "U"}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start mt-2 text-muted-foreground hover:text-foreground"
            onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}