"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { API_BASE_URL } from "@/config/constants";

interface AuthUser {
  id: string;
  email: string | null;
  status: string;
  evmAddress: string | null;
  telegramId?: string | null;
  authMethod?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = "bitton_access_token";
const REFRESH_TOKEN_KEY = "bitton_refresh_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(
    (newAccessToken: string, newRefreshToken: string, newUser: AuthUser) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      setAccessToken(newAccessToken);
      setUser(newUser);
    },
    []
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Best effort
      }
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        await logout();
        return false;
      }

      const data = await res.json();
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      setAccessToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch {
      await logout();
      return false;
    }
  }, [logout]);

  // Authenticated fetch with automatic 401 retry via token refresh
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      const headers = new Headers(options.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      let res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        // Try refreshing the token
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newToken = localStorage.getItem(ACCESS_TOKEN_KEY);
          headers.set("Authorization", `Bearer ${newToken}`);
          res = await fetch(url, { ...options, headers });
        }
      }

      return res;
    },
    [refreshAccessToken]
  );

  // On mount, try to restore session from refresh token
  useEffect(() => {
    const storedAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (storedAccess && storedRefresh) {
      refreshAccessToken().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login,
        logout,
        refreshAccessToken,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
