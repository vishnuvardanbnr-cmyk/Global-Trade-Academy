import { useState, useEffect } from "react";
import { useUser, useSignIn, useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, ShieldAlert, GraduationCap, UserCheck, CheckCircle2,
  AlertTriangle, RefreshCw, Copy, ChevronRight, Zap, LogIn,
} from "lucide-react";
import { Link, useLocation } from "wouter";

function RoleBadge({ role }: { role: string }) {
  const cfg =
    role === "admin" ? { color: "text-red-500 border-red-500/30 bg-red-50", icon: Shield } :
    role === "instructor" ? { color: "text-purple-600 border-purple-600/30 bg-purple-50", icon: ShieldAlert } :
    { color: "text-blue-600 border-blue-600/30 bg-blue-50", icon: GraduationCap };
  const { color, icon: Icon } = cfg;
  return (
    <Badge variant="outline" className={`${color} gap-1 text-xs font-semibold px-2.5 py-1`}>
      <Icon className="h-3 w-3" /> {role}
    </Badge>
  );
}

export default function SetupPage() {
  const { user } = useUser();
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signOut } = useClerk();
  const { data: me, refetch: refetchMe } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [bootstrapStatus, setBootstrapStatus] = useState<{ bootstrapped: boolean; adminCount: number } | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [demoLoggingIn, setDemoLoggingIn] = useState<string | null>(null);

  const handleDemoLogin = async (email: string) => {
    if (!signInLoaded) return;
    setDemoLoggingIn(email);
    try {
      // If already signed in as someone else, sign out first
      if (user) await signOut();

      const res = await fetch("/api/setup/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || "Demo login failed", variant: "destructive" });
        return;
      }
      const { token } = await res.json() as { token: string };

      const result = await signIn.create({ strategy: "ticket", ticket: token });
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
        await qc.invalidateQueries();
        navigate("/dashboard");
      } else {
        toast({ title: "Sign-in incomplete — unexpected state", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Demo login error", variant: "destructive" });
    } finally {
      setDemoLoggingIn(null);
    }
  };

  useEffect(() => {
    fetch("/api/setup/status").then((r) => r.json()).then(setBootstrapStatus).catch(() => {});
  }, []);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const r = await fetch("/api/setup/bootstrap", { method: "POST" });
      const data = await r.json();
      if (!r.ok) { toast({ title: data.error || "Bootstrap failed", variant: "destructive" }); return; }
      toast({ title: "You are now an Admin!", description: "Refresh to see your new permissions." });
      await refetchMe();
      qc.invalidateQueries();
      setBootstrapStatus({ bootstrapped: true, adminCount: 1 });
    } catch { toast({ title: "Request failed", variant: "destructive" }); }
    finally { setBootstrapping(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const currentRole = me?.role ?? "student";
  const isAdmin = currentRole === "admin";

  const demoAccounts = [
    {
      label: "Admin",
      email: "brightinsight.admin@gmail.com",
      password: "BrightDemo1!",
      icon: Shield,
      color: "text-red-500",
      bg: "bg-red-50 border-red-200",
      desc: "Full platform control — user management, analytics, grant access, community moderation.",
    },
    {
      label: "Instructor",
      email: "brightinsight.instructor@gmail.com",
      password: "BrightDemo1!",
      icon: ShieldAlert,
      color: "text-purple-600",
      bg: "bg-purple-50 border-purple-200",
      desc: "Course builder, live classes, batch management, student review queue, announcements.",
    },
    {
      label: "Student",
      email: "brightinsight.student@gmail.com",
      password: "BrightDemo1!",
      icon: GraduationCap,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200",
      desc: "Course enrollment, lesson progress, quizzes, certificates, XP leaderboard, community.",
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Setup</h1>
        <p className="text-muted-foreground mt-1">Bootstrap roles, manage permissions, and access demo accounts.</p>
      </div>

      {/* Current user status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" /> Your Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Email</p>
              <p className="text-sm font-medium">{user?.primaryEmailAddress?.emailAddress ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Name</p>
              <p className="text-sm font-medium">{user?.fullName || me?.displayName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Current Role</p>
              <RoleBadge role={currentRole} />
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              You have full admin access. Use the <Link href="/admin" className="font-semibold underline">Admin Panel</Link> to manage users and roles.
            </div>
          )}

          {!isAdmin && bootstrapStatus && !bootstrapStatus.bootstrapped && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">No admin exists yet</p>
                  <p className="text-xs text-amber-700 mt-0.5">Click below to claim admin status. This only works while no admins exist.</p>
                </div>
              </div>
              <Button onClick={handleBootstrap} disabled={bootstrapping} className="gap-2 bg-amber-600 hover:bg-amber-700">
                {bootstrapping ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {bootstrapping ? "Claiming…" : "Claim Admin Status"}
              </Button>
            </div>
          )}

          {!isAdmin && bootstrapStatus?.bootstrapped && (
            <p className="text-xs text-muted-foreground">To change your role, ask an admin to update it via Admin Panel → Users.</p>
          )}
        </CardContent>
      </Card>

      {/* Demo Accounts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" /> Demo Accounts
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Pre-configured test accounts with each role. Use these to explore the platform.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {demoAccounts.map((a) => (
            <div key={a.label} className={`rounded-xl border p-4 ${a.bg}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white border flex items-center justify-center shrink-0">
                  <a.icon className={`h-4.5 w-4.5 ${a.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-foreground">{a.label}</span>
                    <RoleBadge role={a.label.toLowerCase()} />
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{a.desc}</p>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">Email</p>
                          <p className="text-xs font-mono font-semibold truncate">{a.email}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0 ml-2" onClick={() => copyToClipboard(a.email)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border">
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">Password</p>
                          <p className="text-xs font-mono font-semibold">{a.password}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0 ml-2" onClick={() => copyToClipboard(a.password)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className={`w-full gap-2 ${
                        a.label === "Admin" ? "bg-red-500 hover:bg-red-600" :
                        a.label === "Instructor" ? "bg-purple-600 hover:bg-purple-700" :
                        "bg-blue-600 hover:bg-blue-700"
                      } text-white`}
                      disabled={demoLoggingIn !== null}
                      onClick={() => handleDemoLogin(a.email)}
                    >
                      {demoLoggingIn === a.email
                        ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Signing in…</>
                        : <><LogIn className="h-3.5 w-3.5" /> Login as {a.label}</>
                      }
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Role reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Role Permissions Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Feature</th>
                  <th className="text-center py-2 px-3 font-semibold text-blue-600">Student</th>
                  <th className="text-center py-2 px-3 font-semibold text-purple-600">Instructor</th>
                  <th className="text-center py-2 px-3 font-semibold text-red-500">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {[
                  ["Enroll in courses", "✅", "✅", "✅"],
                  ["View lessons & quizzes", "✅", "✅", "✅"],
                  ["Earn XP & certificates", "✅", "✅", "✅"],
                  ["Community posts", "✅", "✅", "✅"],
                  ["Live class attendance", "✅", "✅", "✅"],
                  ["Create / edit courses", "❌", "✅", "✅"],
                  ["Instructor Panel", "❌", "✅", "✅"],
                  ["Batch management", "❌", "✅", "✅"],
                  ["Student review queue", "❌", "✅", "✅"],
                  ["Send announcements", "❌", "✅", "✅"],
                  ["Admin Panel", "❌", "❌", "✅"],
                  ["Change user roles", "❌", "❌", "✅"],
                  ["Grant course access", "❌", "❌", "✅"],
                  ["Delete any content", "❌", "❌", "✅"],
                  ["Platform analytics", "❌", "❌", "✅"],
                ].map(([feature, student, instructor, admin]) => (
                  <tr key={feature} className="hover:bg-secondary/30">
                    <td className="py-2 pr-4 text-foreground">{feature}</td>
                    <td className="text-center py-2 px-3">{student}</td>
                    <td className="text-center py-2 px-3">{instructor}</td>
                    <td className="text-center py-2 px-3">{admin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick navigation */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { href: "/admin", label: "Admin Panel", icon: Shield, desc: "Users, analytics, moderation" },
              { href: "/instructor", label: "Instructor Panel", icon: ShieldAlert, desc: "Courses, batches, reviews" },
              { href: "/dashboard", label: "Dashboard", icon: GraduationCap, desc: "Student view" },
              { href: "/courses", label: "Course Catalog", icon: GraduationCap, desc: "Browse all courses" },
            ].map(({ href, label, icon: Icon, desc }) => (
              <Link key={href} href={href}>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/30 transition-all cursor-pointer group">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{desc}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
