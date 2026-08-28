"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { DEMO_PASSWORD, DEMO_USERNAME } from "@/lib/auth";

export default function LoginPage() {
  const { authenticated, login, loading } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fillDemo, setFillDemo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to dashboard if already authenticated.
  useEffect(() => {
    if (!loading && authenticated) {
      router.replace("/");
    }
  }, [authenticated, loading, router]);

  // Auto-fill demo credentials when the toggle is flipped on.
  useEffect(() => {
    if (fillDemo) {
      setUsername(DEMO_USERNAME);
      setPassword(DEMO_PASSWORD);
    }
  }, [fillDemo]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const ok = login(username, password);
    setSubmitting(false);
    if (ok) {
      router.replace("/");
    } else {
      setError("Invalid username or password.");
    }
  };

  const Toggle = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
    >
      <span className="sr-only">Toggle demo credentials</span>
      <span
        className={
          "absolute inset-0 rounded-full transition-colors " +
          (checked ? "bg-blue-600" : "bg-slate-700")
        }
      />
      <span
        className={
          "absolute top-0.5 left-0.5 h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
          (checked ? "translate-x-5" : "translate-x-0")
        }
      />
                  <span className="absolute inset-0 flex items-center justify-between px-1.5 text-[10px] font-medium">
        <span className={checked ? "text-blue-200" : "text-slate-400"}>OFF</span>
        <span className={checked ? "text-white" : "text-slate-400"}>ON</span>
      </span>
    </button>
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800/40 via-slate-950 to-slate-950" />
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl shadow-black/40">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Options Sniper</h1>
          <p className="mt-1 text-sm text-slate-400">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-slate-300">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3.5 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="demo"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3.5 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="fill-demo" className="text-xs text-slate-300">
              Fill demo credentials (demo / Alpaca123!)
            </label>
            <Toggle checked={fillDemo} onChange={setFillDemo} />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
