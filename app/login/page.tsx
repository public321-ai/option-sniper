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

  useEffect(() => {
    if (!loading && authenticated) router.replace("/");
  }, [authenticated, loading, router]);

  useEffect(() => {
    if (fillDemo) { setUsername(DEMO_USERNAME); setPassword(DEMO_PASSWORD); }
  }, [fillDemo]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const ok = login(username, password);
    setSubmitting(false);
    if (ok) router.replace("/");
    else setError("Invalid username or password.");
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-soft focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
    >
      <span className="sr-only">Toggle demo credentials</span>
      <span className={`absolute inset-0 rounded-full transition-colors ${checked ? "bg-emerald-muted" : "bg-raised"}`} />
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 transform rounded-full bg-txt shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      <span className="absolute inset-0 flex items-center justify-between px-1.5 text-[10px] font-medium">
        <span className={checked ? "text-emerald-soft" : "text-txt-dim"}>OFF</span>
        <span className={checked ? "text-white" : "text-txt-dim"}>ON</span>
      </span>
    </button>
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-obsidian">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-charcoal/30 via-obsidian to-obsidian" />
      <div className="w-full max-w-md space-y-8 soft-card p-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-bdr-accent bg-charcoal">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-soft" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-txt">
            OPTIONS <span className="text-emerald-soft">SNIPER</span>
          </h1>
          <p className="mt-1 text-sm text-txt-muted">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-txt-secondary">Username</label>
            <input
              id="username" name="username" autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)} required
              className="mt-1 block w-full rounded-[var(--radius-inner)] border border-bdr bg-charcoal px-3.5 py-2 text-txt placeholder-txt-dim focus:border-emerald-muted focus:ring-1 focus:ring-emerald-muted transition-colors"
              placeholder="demo"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-txt-secondary">Password</label>
            <input
              id="password" name="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
              className="mt-1 block w-full rounded-[var(--radius-inner)] border border-bdr bg-charcoal px-3.5 py-2 text-txt placeholder-txt-dim focus:border-emerald-muted focus:ring-1 focus:ring-emerald-muted transition-colors"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="fill-demo" className="text-xs text-txt-muted">
              Fill demo credentials (demo / Alpaca123!)
            </label>
            <Toggle checked={fillDemo} onChange={setFillDemo} />
          </div>

          {error && <p className="text-sm text-coral">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="btn-primary w-full py-2.5 text-sm disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
