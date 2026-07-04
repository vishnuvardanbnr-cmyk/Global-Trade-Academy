import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Mail, RefreshCw } from "lucide-react";
import { apiRegister, apiSendOtp, apiVerifyOtp } from "@/lib/auth";
import { useAuthContext } from "@/lib/authContext";
import { queryClient } from "@/lib/queryClient";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["bg-[#e4e4e7]", "bg-red-400", "bg-amber-400", "bg-emerald-500"];
  const labels = ["", "Weak", "Fair", "Strong"];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-[#e4e4e7]"}`} />
        ))}
        <span className="text-[10px] text-[#71717a] ml-1 self-center font-medium">{labels[score]}</span>
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

type Step = "name" | "credentials" | "otp";

const STEP_LABELS: Step[] = ["name", "credentials", "otp"];

export default function SignUpPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuthContext();
  const [step, setStep] = useState<Step>("name");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(v => {
        if (v <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    setError(null);
    setStep("credentials");
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await apiSendOtp(email, firstName.trim());
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
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(""));
      otpRefs.current[5]?.focus();
      e.preventDefault();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits"); return; }
    setError(null);
    setLoading(true);
    try {
      await apiVerifyOtp(email, code);
      const result = await apiRegister(email, password, firstName.trim(), lastName.trim());
      queryClient.clear();
      await refetch();
      navigate(result.pendingApproval ? "/pending-approval" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      await apiSendOtp(email, firstName.trim());
      setOtp(["", "", "", "", "", ""]);
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  const stepIdx = STEP_LABELS.indexOf(step);

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
            <h1 className="text-[1.25rem] font-bold text-[#09090b] mb-1">Create your account</h1>
            <p className="text-sm text-[#71717a]">
              {step === "name" ? "Let's start with your name."
                : step === "credentials" ? "Now set your email and password."
                : `We sent a 6-digit code to ${email}`}
            </p>
            {/* Step dots */}
            <div className="flex gap-1.5 mt-4">
              {STEP_LABELS.map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step === s ? "w-6 bg-[#2563eb]"
                    : i < stepIdx ? "w-3 bg-[#2563eb]/40"
                    : "w-3 bg-[#e4e4e7]"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Form body */}
          <div className="px-8 py-6">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2.5 text-sm text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-xl px-3.5 py-3 mb-4"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {/* ── Step 1: Name ── */}
              {step === "name" && (
                <motion.form
                  key="name"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  onSubmit={handleNameSubmit}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">First name</label>
                    <input autoFocus type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                      placeholder="Alex" required
                      className="w-full h-10 px-3.5 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">Last name <span className="text-[#a1a1aa] font-normal">(optional)</span></label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                      placeholder="Johnson"
                      className="w-full h-10 px-3.5 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all" />
                  </div>
                  <button type="submit" disabled={!firstName.trim()}
                    className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-sm font-semibold transition-colors mt-2">
                    Continue →
                  </button>
                </motion.form>
              )}

              {/* ── Step 2: Email + Password ── */}
              {step === "credentials" && (
                <motion.form
                  key="credentials"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  onSubmit={handleCredentialsSubmit}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">Email address</label>
                    <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoComplete="email"
                      className="w-full h-10 px-3.5 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-1.5">Password</label>
                    <div className="relative">
                      <input type={showPass ? "text" : "password"} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Create a strong password" required autoComplete="new-password"
                        className="w-full h-10 px-3.5 pr-10 rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-sm text-[#09090b] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all" />
                      <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] hover:text-[#52525b] transition-colors">
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setStep("name"); setError(null); }}
                      className="flex-1 h-10 rounded-xl border border-[#e4e4e7] bg-white hover:bg-[#fafafa] text-sm font-semibold text-[#3f3f46] transition-colors">
                      ← Back
                    </button>
                    <button type="submit" disabled={loading || !email || password.length < 8}
                      className="flex-[2] h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4" /> Send verification code</>}
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── Step 3: OTP ── */}
              {step === "otp" && (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {/* 6-digit boxes */}
                  <div>
                    <label className="block text-xs font-semibold text-[#3f3f46] mb-3 text-center">Enter verification code</label>
                    <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={el => { otpRefs.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={e => handleOtpChange(idx, e.target.value)}
                          onKeyDown={e => handleOtpKeyDown(idx, e)}
                          className="w-11 h-13 text-center text-xl font-bold rounded-xl border border-[#e4e4e7] bg-[#fafafa] text-[#09090b] focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/15 focus:bg-white transition-all"
                          style={{ height: "52px" }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleVerify}
                    disabled={loading || otp.join("").length !== 6}
                    className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Verify &amp; Create account</>}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => { setStep("credentials"); setError(null); }}
                      className="text-[#71717a] hover:text-[#3f3f46] transition-colors"
                    >
                      ← Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || loading}
                      className="flex items-center gap-1.5 text-[#2563eb] hover:text-[#1d4ed8] disabled:text-[#a1a1aa] disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {step !== "otp" && (
              <>
                <div className="relative flex items-center gap-3 py-4">
                  <div className="flex-1 h-px bg-[#e4e4e7]" />
                  <span className="text-xs text-[#a1a1aa] font-medium">or</span>
                  <div className="flex-1 h-px bg-[#e4e4e7]" />
                </div>
                <p className="text-center text-sm text-[#71717a]">
                  Already have an account?{" "}
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
