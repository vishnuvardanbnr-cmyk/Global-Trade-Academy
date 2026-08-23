export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  plan?: string;
  status?: string;
  avatarUrl?: string | null;
}

async function readApiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({})) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

function networkError(error: unknown, fallback: string): Error {
  if (error instanceof TypeError) {
    return new Error(`${fallback}. Please check your connection and try again.`);
  }
  return error instanceof Error ? error : new Error(fallback);
}

export async function apiLogin(email: string, password: string): Promise<{ token: string; pendingApproval?: boolean; user: AuthUser }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!res.ok) throw await readApiError(res, "Login failed");
    return res.json();
  } catch (error) {
    throw networkError(error, "Login failed");
  }
}

export async function apiRegister(
  email: string, password: string, firstName?: string, lastName?: string,
  country?: string, phone?: string
): Promise<{ token: string; pendingApproval?: boolean; user: AuthUser }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, firstName, lastName, country, phone }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Registration failed");
  }
  return res.json();
}

export async function apiSendOtp(email: string, firstName?: string): Promise<void> {
  const res = await fetch("/api/auth/send-otp", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), firstName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to send verification code");
  }
}

export async function apiVerifyOtp(email: string, code: string): Promise<void> {
  const res = await fetch("/api/auth/verify-otp", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Invalid verification code");
  }
}

export async function apiForgotPassword(email: string): Promise<void> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to send reset code");
  }
}

export async function apiResetPassword(email: string, code: string, newPassword: string): Promise<void> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), code, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to reset password");
  }
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
}

export async function apiGetMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", {
    credentials: "include",
    cache: "no-store",
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}
