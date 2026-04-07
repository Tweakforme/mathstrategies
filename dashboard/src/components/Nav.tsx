"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BarChart2, List, TrendingUp, LogOut, FlaskConical } from "lucide-react";
import clsx from "clsx";

const links = [
  { href: "/",         label: "Fight Card", icon: List },
  { href: "/tracker",  label: "My Tracker", icon: TrendingUp },
  { href: "/backtest", label: "Backtest",   icon: FlaskConical },
];

export default function Nav({ user }: { user?: { name?: string | null } }) {
  const path = usePathname();

  return (
    <header className="border-b border-border bg-card sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-accent text-lg">
          <BarChart2 className="w-5 h-5" />
          UFC Picks
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                path === href
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User + logout */}
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{user?.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
