import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { apiLogin } from "@/lib/auth";
import { useAuthContext } from "@/lib/authContext";
import { queryClient } from "@/lib/queryClient";

export default function SignInPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiLogin(email, password);
      queryClient.clear();
      await refetch();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#f4f4f5] px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px]"
      >
        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#e4e4e7] shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-[#f4f4f5]">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center">
                <BarChart3 className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-[15px] tracking-tight text-[#09090b]">Bright Insight</span>
            </div>
            <h1 className="text-[1.25rem] font-bold text-[#09090b] mb-1">Sign in</h1>
            <p className="text-sm text-[#71717a]">
              Welcome back! Please sign in to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2.5 text-sm text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-xl px-3.5 py-3"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full h-10 px-3.5 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#3f3f46]">Password</label>
                <span className="text-xs text-[#2563eb] hover:underline cursor-pointer">Forgot password?</span>
              </div>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full h-10 px-3.5 pr-10 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] hover:text-[#52525b] transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-[#e4e4e7]" />
              <span className="text-xs text-[#a1a1aa] font-medium">or</span>
              <div className="flex-1 h-px bg-[#e4e4e7]" />
            </div>

            <p className="text-center text-sm text-[#71717a]">
              Don't have an account?{" "}
              <Link href="/sign-up">
                <span className="text-[#2563eb] font-semibold hover:underline cursor-pointer">Sign up</span>
              </Link>
            </p>
          </form>

          {/* Footer */}
          <div className="px-8 py-4 bg-[#fafafa] border-t border-[#f4f4f5] flex items-center justify-center gap-4">
            <a href="#" className="text-xs text-[#a1a1aa] hover:text-[#52525b]">Privacy Policy</a>
            <span className="text-[#e4e4e7]">·</span>
            <a href="#" className="text-xs text-[#a1a1aa] hover:text-[#52525b]">Terms of Service</a>
          </div>
        </div>

        <p className="text-center text-xs text-[#a1a1aa] mt-4">
          Secured by <span className="font-semibold">Bright Insight</span>
        </p>
      </motion.div>
    </div>
  );
}
