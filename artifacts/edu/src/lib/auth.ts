export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  avatarUrl?: string | null;
}

export async function apiLogin(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Login failed");
  }
  return res.json();
}

export async function apiRegister(
  email: string, password: string, firstName?: string, lastName?: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Registration failed");
  }
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function apiGetMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  return res.json();
}
