"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BarChart2, List, TrendingUp, LogOut, FlaskConical, User } from "lucide-react";
import clsx from "clsx";

const links = [
  { href: "/",         label: "Fight Card",  icon: List },
  { href: "/tracker",  label: "My Tracker",  icon: TrendingUp },
  { href: "/backtest", label: "Backtest",    icon: FlaskConical },
];

export default function Nav({ user }: { user?: { name?: string | null } }) {
  const path = usePathname();

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent flex items-center justify-center shadow-accent-glow">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight hidden sm:block">
            UFC<span className="text-accent">Picks</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center max-w-xs">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== "/" && path.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-accent/15 text-accent border border-accent/25"
                    : "text-muted hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-7 h-7 rounded-full bg-white/5 border border-border flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-muted" />
            </div>
            <span className="text-muted hidden sm:block">{user?.name}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
