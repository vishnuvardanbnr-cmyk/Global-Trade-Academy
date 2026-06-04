import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuthContext, useUser } from "@/lib/authContext";

import { useGetMe } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Courses from "@/pages/courses";
import CourseDetail from "@/pages/course-detail";
import Certificates from "@/pages/certificates";
import Trading from "@/pages/trading";
import CopyTrading from "@/pages/copy-trading";
import Community from "@/pages/community";
import LiveClasses from "@/pages/live-classes";
import LiveRoom from "@/pages/live-room";
import InstructorPanel from "@/pages/instructor";
import AdminPanel from "@/pages/admin";
import Settings from "@/pages/settings";
import VerifyCertificate from "@/pages/verify";
import SetupPage from "@/pages/setup";
import DemoLoginPage from "@/pages/demo-login";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import DashboardLayout from "@/components/layout/DashboardLayout";

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
  return <DashboardLayout><Component /></DashboardLayout>;
}

function ProtectedRouteFullScreen({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuthContext();
  if (loading) return null;
  if (!user) return <Redirect to="/" />;
  return <Component />;
}

function RoleProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles: string[] }) {
  const { user, loading } = useAuthContext();
  const { data: me, isLoading } = useGetMe();
  if (loading || isLoading) return null;
  if (!user) return <Redirect to="/" />;
  if (!me || !allowedRoles.includes(me.role ?? "")) return <Redirect to="/dashboard" />;
  return <DashboardLayout><Component /></DashboardLayout>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/courses/:id"><ProtectedRoute component={CourseDetail} /></Route>
      <Route path="/courses"><ProtectedRoute component={Courses} /></Route>
      <Route path="/certificates"><ProtectedRoute component={Certificates} /></Route>
      <Route path="/trading"><ProtectedRoute component={Trading} /></Route>
      <Route path="/copy-trading"><ProtectedRoute component={CopyTrading} /></Route>
      <Route path="/community"><ProtectedRoute component={Community} /></Route>
      <Route path="/live/:classId/room"><ProtectedRouteFullScreen component={LiveRoom} /></Route>
      <Route path="/live"><ProtectedRoute component={LiveClasses} /></Route>
      <Route path="/instructor"><RoleProtectedRoute component={InstructorPanel} allowedRoles={["instructor", "admin"]} /></Route>
      <Route path="/admin"><RoleProtectedRoute component={AdminPanel} allowedRoles={["admin"]} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/setup"><ProtectedRoute component={SetupPage} /></Route>
      <Route path="/demo-login" component={DemoLoginPage} />
      <Route path="/verify/:serial" component={VerifyCertificate} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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

export default App;
