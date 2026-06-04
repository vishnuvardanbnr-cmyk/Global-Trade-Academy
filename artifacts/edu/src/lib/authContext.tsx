import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiGetMe, apiLogout, type AuthUser } from "./auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refetch: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const me = await apiGetMe();
    setUser(me);
  }, []);

  useEffect(() => {
    apiGetMe().then((me) => {
      setUser(me);
      setLoading(false);
    });
  }, []);

  const signOut = useCallback(async (opts?: { redirectUrl?: string }) => {
    await apiLogout();
    setUser(null);
    window.location.href = opts?.redirectUrl ?? "/";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refetch, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

export function useUser() {
  const { user, loading } = useAuthContext();
  return {
    isLoaded: !loading,
    isSignedIn: !!user,
    user: user ? {
      id: user.id,
      firstName: user.displayName?.split(" ")[0] ?? null,
      lastName: user.displayName?.split(" ").slice(1).join(" ") ?? null,
      fullName: user.displayName,
      primaryEmailAddress: { emailAddress: user.email },
      imageUrl: user.avatarUrl ?? null,
      update: async (_data: { firstName?: string; lastName?: string }) => {},
    } : null,
  };
}

export function useClerk() {
  const { signOut } = useAuthContext();
  return {
    signOut,
    openUserProfile: () => { window.location.href = "/settings"; },
    addListener: (_cb: (payload: { user: AuthUser | null }) => void) => () => {},
  };
}
