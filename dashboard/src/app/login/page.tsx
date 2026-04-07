"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BarChart2, AlertCircle, ArrowRight, Loader } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { ...form, redirect: false });
    setLoading(false);
    if (res?.error) setError("Invalid username or password.");
    else { router.push("/"); router.refresh(); }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(230,57,70,0.12) 0%, transparent 60%)" }}>

      <div className="w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-accent shadow-accent-glow mb-4">
            <BarChart2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">UFC<span className="text-accent">Picks</span></h1>
          <p className="text-muted text-sm mt-1.5">ML-powered fight predictions</p>
        </div>

        {/* Card */}
        <div className="card p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60
                           placeholder:text-muted transition-colors"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60
                           placeholder:text-muted transition-colors"
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading
                ? <><Loader className="w-4 h-4 animate-spin" /> Signing in…</>
                : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-4">
          Private access only · UFC 327 predictions live
        </p>
      </div>
    </div>
  );
}
