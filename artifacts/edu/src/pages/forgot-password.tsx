import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Loader2, AlertCircle, CheckCircle2, Mail, RefreshCw, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { apiForgotPassword, apiResetPassword } from "@/lib/auth";

type Step = "email" | "otp" | "done";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["bg-[#e4e4e7]", "bg-red-400", "bg-amber-400", "bg-emerald-500"];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-[#e4e4e7]"}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map(c => (
          <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.ok ? "text-emerald-600" : "text-[#a1a1aa]"}`}>
            <CheckCircle2 className="h-3 w-3" /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(v => { if (v <= 1) { clearInterval(cooldownRef.current!); return 0; } return v - 1; });
    }, 1000);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiForgotPassword(email);
      setOtp(["", "", "", "", "", ""]);
      setStep("otp");
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) { setOtp(text.split("")); otpRefs.current[5]?.focus(); e.preventDefault(); }
  };

  const handleReset = async () => {
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(null);
    setLoading(true);
    try {
      await apiResetPassword(email, code, newPassword);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      await apiForgotPassword(email);
      setOtp(["", "", "", "", "", ""]);
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
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
        <div className="bg-white rounded-2xl border border-[#e4e4e7] shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-[#f4f4f5]">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-[15px] tracking-tight text-[#09090b]">Bright Insight</span>
            </div>
            <h1 className="text-[1.25rem] font-bold text-[#09090b] mb-1">
              {step === "email" ? "Forgot password?" : step === "otp" ? "Check your email" : "Password reset!"}
            </h1>
            <p className="text-sm text-[#71717a]">
              {step === "email" ? "Enter your email and we'll send a reset code."
                : step === "otp" ? `We sent a 6-digit code to ${email}`
                : "Your password has been updated successfully."}
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2.5 text-sm text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-xl px-3.5 py-3 mb-4"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {/* ── Step 1: Email ── */}
              {step === "email" && (
                <motion.form key="email"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  onSubmit={handleEmailSubmit} className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">Email address</label>
                    <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoComplete="email"
                      className="w-full h-10 px-3.5 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all" />
                  </div>
                  <button type="submit" disabled={loading || !email}
                    className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4" /> Send reset code</>}
                  </button>
                </motion.form>
              )}

              {/* ── Step 2: OTP + New Password ── */}
              {step === "otp" && (
                <motion.div key="otp"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-3 text-center">Verification code</label>
                    <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                      {otp.map((digit, idx) => (
                        <input key={idx} ref={el => { otpRefs.current[idx] = el; }}
                          type="text" inputMode="numeric" maxLength={1} value={digit}
                          onChange={e => handleOtpChange(idx, e.target.value)}
                          onKeyDown={e => handleOtpKeyDown(idx, e)}
                          className="w-11 text-center text-xl font-bold rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-[#09090b] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all"
                          style={{ height: "52px" }} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">New password</label>
                    <div className="relative">
                      <input type={showPass ? "text" : "password"} value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Create a strong password" autoComplete="new-password"
                        className="w-full h-10 px-3.5 pr-10 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all" />
                      <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] hover:text-[#52525b] transition-colors">
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={newPassword} />
                  </div>

                  <button onClick={handleReset} disabled={loading || otp.join("").length !== 6 || newPassword.length < 8}
                    className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Reset password</>}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={() => { setStep("email"); setError(null); }}
                      className="text-[#71717a] hover:text-[#3f3f46] transition-colors flex items-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" /> Change email
                    </button>
                    <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || loading}
                      className="flex items-center gap-1.5 text-[#2563eb] hover:text-[#1d4ed8] disabled:text-[#a1a1aa] disabled:cursor-not-allowed transition-colors font-medium">
                      <RefreshCw className="h-3.5 w-3.5" />
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3: Done ── */}
              {step === "done" && (
                <motion.div key="done"
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-center py-4 space-y-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-[#71717a]">You can now sign in with your new password.</p>
                  </div>
                  <button onClick={() => navigate("/sign-in")}
                    className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold transition-colors">
                    Back to sign in
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {step !== "done" && (
              <>
                <div className="relative flex items-center gap-3 py-4">
                  <div className="flex-1 h-px bg-[#e4e4e7]" />
                  <span className="text-xs text-[#a1a1aa] font-medium">or</span>
                  <div className="flex-1 h-px bg-[#e4e4e7]" />
                </div>
                <p className="text-center text-sm text-[#71717a]">
                  Remember it?{" "}
                  <Link href="/sign-in">
                    <span className="text-[#2563eb] font-semibold hover:underline cursor-pointer">Sign in</span>
                  </Link>
                </p>
              </>
            )}
          </div>

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
