import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BarChart3, RefreshCw, AlertTriangle } from "lucide-react";

const ROLE_EMAILS: Record<string, string> = {
  admin:      "brightinsight.admin@gmail.com",
  instructor: "brightinsight.instructor@gmail.com",
  student:    "brightinsight.student@gmail.com",
};

export default function DemoLoginPage() {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role") ?? "student";
    const email = ROLE_EMAILS[role] ?? ROLE_EMAILS.student;

    async function login() {
      try {
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

        const { url } = await res.json() as { url: string };

        // Append redirect_url so Clerk sends the user to /dashboard after sign-in
        const redirectUrl = `${window.location.origin}/dashboard`;
        const clerkUrl = `${url}&redirect_url=${encodeURIComponent(redirectUrl)}`;

        window.location.href = clerkUrl;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Demo login failed: ${msg}`);
      }
    }

    login();
  }, []);

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
          Signing you in…
        </div>
      )}
    </div>
  );
}
