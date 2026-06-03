import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

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
import DashboardLayout from "@/components/layout/DashboardLayout";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "hsl(221 83% 53%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214 32% 91%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorText: "hsl(222 47% 11%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden rounded-2xl border border-border shadow-lg",
    card: "!shadow-none !border-0 !rounded-none",
    footer: "!shadow-none !border-0 !rounded-none",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/dashboard" /></Show>
      <Show when="signed-out"><Home /></Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <DashboardLayout><Component /></DashboardLayout>
      </Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function ProtectedRouteFullScreen({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in"><Component /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function RoleProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles: string[] }) {
  const { data: me, isLoading } = useGetMe();
  if (isLoading) return null;
  if (!me) return <Redirect to="/" />;
  if (!allowedRoles.includes(me.role ?? "")) return <Redirect to="/dashboard" />;
  return (
    <Show when="signed-in">
      <DashboardLayout><Component /></DashboardLayout>
    </Show>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

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
            <Route path="/verify/:serial" component={VerifyCertificate} />

            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
