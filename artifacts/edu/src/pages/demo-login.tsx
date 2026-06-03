import { useEffect, useState } from "react";
import { useSignIn, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { BarChart3, RefreshCw, AlertTriangle } from "lucide-react";

const ROLE_EMAILS: Record<string, string> = {
  admin:      "brightinsight.admin@gmail.com",
  instructor: "brightinsight.instructor@gmail.com",
  student:    "brightinsight.student@gmail.com",
};

export default function DemoLoginPage() {
  const [, navigate] = useLocation();
  const { signOut } = useClerk();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [status, setStatus] = useState("Preparing demo session…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const params = new URLSearchParams(window.location.search);
    const role = params.get("role") ?? "student";
    const email = ROLE_EMAILS[role] ?? ROLE_EMAILS.student;

    async function login() {
      try {
        // If already signed in as someone, sign out first so signIn is available
        if (!signIn) {
          setStatus("Signing out current session…");
          await signOut();
          // After signOut, the component will re-render with signIn available
          return;
        }

        setStatus("Creating demo session…");
        const res = await fetch("/api/setup/demo-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Could not create demo session.");
          return;
        }

        const { token } = await res.json() as { token: string };

        setStatus("Authenticating…");
        const result = await signIn.create({ strategy: "ticket", ticket: token });

        if (result.status === "complete") {
          setStatus("Redirecting…");
          await setActive!({ session: result.createdSessionId });
          navigate("/dashboard");
        } else {
          setError(`Unexpected sign-in status: ${result.status}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Demo login failed: ${msg}`);
      }
    }

    login();
  }, [isLoaded, signIn]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-lg tracking-tight">Bright Insight</span>
      </div>

      {error ? (
        <div className="flex items-start gap-3 max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-0.5">Demo login failed</p>
            <p>{error}</p>
            <button
              className="mt-3 text-xs underline text-red-600"
              onClick={() => navigate("/")}
            >
              ← Back to home
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground text-sm">
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          {status}
        </div>
      )}
    </div>
  );
}
