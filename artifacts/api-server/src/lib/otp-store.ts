type Entry = { code: string; expiresAt: number; verified: boolean; attempts: number };
const store = new Map<string, Entry>();
const resetStore = new Map<string, Entry>();

/* ── Password reset OTP ─────────────────────────────────────── */
export function generateResetOtp(email: string): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  resetStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + 10 * 60 * 1000, verified: false, attempts: 0 });
  return code;
}

export type ResetVerifyResult = "ok" | "invalid" | "expired" | "too_many";

export function verifyResetOtp(email: string, code: string): ResetVerifyResult {
  const e = resetStore.get(email.toLowerCase());
  if (!e) return "invalid";
  if (Date.now() > e.expiresAt) { resetStore.delete(email.toLowerCase()); return "expired"; }
  if (e.attempts >= 5) return "too_many";
  if (e.code !== code) { e.attempts++; return "invalid"; }
  e.verified = true;
  return "ok";
}

export function isResetOtpVerified(email: string): boolean {
  const e = resetStore.get(email.toLowerCase());
  return !!(e && e.verified && Date.now() <= e.expiresAt);
}

export function clearResetOtp(email: string): void {
  resetStore.delete(email.toLowerCase());
}

export function generateOtp(email: string): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  store.set(email.toLowerCase(), { code, expiresAt: Date.now() + 10 * 60 * 1000, verified: false, attempts: 0 });
  return code;
}

export type VerifyResult = "ok" | "invalid" | "expired" | "too_many";

export function verifyOtp(email: string, code: string): VerifyResult {
  const e = store.get(email.toLowerCase());
  if (!e) return "invalid";
  if (Date.now() > e.expiresAt) { store.delete(email.toLowerCase()); return "expired"; }
  if (e.attempts >= 5) return "too_many";
  if (e.code !== code) { e.attempts++; return "invalid"; }
  e.verified = true;
  return "ok";
}

export function isOtpVerified(email: string): boolean {
  const e = store.get(email.toLowerCase());
  return !!(e && e.verified && Date.now() <= e.expiresAt);
}

export function clearOtp(email: string): void {
  store.delete(email.toLowerCase());
}
