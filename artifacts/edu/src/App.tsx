import { lazy, Suspense } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuthContext } from "@/lib/authContext";
import { useGetMe } from "@workspace/api-client-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

/* ── Eager (needed on first paint) ──────────────────────────────── */
import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import DemoLoginPage from "@/pages/demo-login";

/* ── Lazy (loaded only when the route is visited) ───────────────── */
const Dashboard        = lazy(() => import("@/pages/dashboard"));
const Courses          = lazy(() => import("@/pages/courses"));
const CourseDetail     = lazy(() => import("@/pages/course-detail"));
const Trading          = lazy(() => import("@/pages/trading"));
const CopyTrading      = lazy(() => import("@/pages/copy-trading"));
const Community        = lazy(() => import("@/pages/community"));
const LiveRoom         = lazy(() => import("@/pages/live-room"));
const InstructorPanel  = lazy(() => import("@/pages/instructor"));
const AdminPanel       = lazy(() => import("@/pages/admin"));
const Settings         = lazy(() => import("@/pages/settings"));
const SetupPage        = lazy(() => import("@/pages/setup"));
const VerifyCertificate = lazy(() => import("@/pages/verify"));
const NotFound         = lazy(() => import("@/pages/not-found"));

/* ── Minimal fallback while a chunk loads ───────────────────────── */
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/* ── Route guards ───────────────────────────────────────────────── */
function HomeRedirect() {
  const { user, loading } = useAuthContext();
  const { data: me, isLoading } = useGetMe();
  if (loading || (user && isLoading)) return null;
  if (user) {
    if (me?.role === "instructor") return <Redirect to="/instructor" />;
    if (me?.role === "admin") return <Redirect to="/admin" />;
    return <Redirect to="/dashboard" />;
  }
  return <Home />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuthContext();
  if (loading) return null;
  if (!user) return <Redirect to="/" />;
  return <DashboardLayout><S><Component /></S></DashboardLayout>;
}

function ProtectedRouteFullScreen({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuthContext();
  if (loading) return null;
  if (!user) return <Redirect to="/" />;
  return <S><Component /></S>;
}

function RoleProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles: string[] }) {
  const { user, loading } = useAuthContext();
  const { data: me, isLoading } = useGetMe();
  if (loading || isLoading) return null;
  if (!user) return <Redirect to="/" />;
  if (!me || !allowedRoles.includes(me.role ?? "")) return <Redirect to="/dashboard" />;
  return <DashboardLayout><S><Component /></S></DashboardLayout>;
}

/* ── Routes ─────────────────────────────────────────────────────── */
function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/demo-login" component={DemoLoginPage} />
      <Route path="/verify/:serial"><S><VerifyCertificate /></S></Route>

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/courses/:id"><ProtectedRoute component={CourseDetail} /></Route>
      <Route path="/courses"><ProtectedRoute component={Courses} /></Route>
      <Route path="/trading"><ProtectedRoute component={Trading} /></Route>
      <Route path="/copy-trading"><ProtectedRoute component={CopyTrading} /></Route>
      <Route path="/community"><ProtectedRoute component={Community} /></Route>
      <Route path="/live/:classId/room"><ProtectedRouteFullScreen component={LiveRoom} /></Route>
      <Route path="/instructor"><RoleProtectedRoute component={InstructorPanel} allowedRoles={["instructor", "admin"]} /></Route>
      <Route path="/admin"><RoleProtectedRoute component={AdminPanel} allowedRoles={["admin"]} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/setup"><ProtectedRoute component={SetupPage} /></Route>

      <Route><S><NotFound /></S></Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter>
            <AppRoutes />
            <Toaster />
          </WouterRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
