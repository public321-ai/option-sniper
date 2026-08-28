"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEMO_PASSWORD, DEMO_USERNAME } from "@/lib/auth";

interface AuthState {
  authenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const auth = localStorage.getItem("os_authenticated");
      const user = localStorage.getItem("os_username");
      if (auth === "1" && user) {
        setAuthenticated(true);
        setUsername(user);
      }
    } catch {
      /* localStorage unavailable */
    }
    setLoading(false);
  }, []);

  const login = (user: string, pass: string): boolean => {
    if (user === DEMO_USERNAME && pass === DEMO_PASSWORD) {
      try {
        localStorage.setItem("os_authenticated", "1");
        localStorage.setItem("os_username", user);
      } catch {
        /* ignore storage errors */
      }
      setAuthenticated(true);
      setUsername(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    try {
      localStorage.removeItem("os_authenticated");
      localStorage.removeItem("os_username");
    } catch {
      /* ignore */
    }
    setAuthenticated(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ authenticated, username, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
