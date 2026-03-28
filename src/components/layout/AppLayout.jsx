import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Briefcase, Eye, LogOut, Menu, Shield, Sparkles, TrendingUp, UserCircle2, X } from 'lucide-react';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import { useAuth } from '@/lib/AuthContext';
import { formatCurrency } from '@/lib/portfolioAnalytics';

const NAV_ITEMS = [
  { path: '/Dashboard', label: 'Dashboard', icon: BarChart3 },
  { path: '/Portfolio', label: 'Portfolio', icon: Briefcase },
  { path: '/RiskAnalysis', label: 'Risk Lab', icon: Shield },
  { path: '/Watchlist', label: 'Watchlist', icon: Eye },
];

function NavLink({ item, active, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all ${
        active
          ? 'bg-amber-300 text-slate-950 shadow-[0_12px_30px_rgba(245,158,11,0.18)]'
          : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated, googleConfigured, logout } = useAuth();
  const hideWorkspaceAccess = ['/StockChart', '/OptionChain'].includes(location.pathname);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const { data: indexPayload } = useQuery({
    queryKey: ['header-indices'],
    refetchInterval: 60000,
    queryFn: async () => {
      const response = await fetch(`${apiBaseUrl}/api/market/indices`);
      if (!response.ok) throw new Error('Unable to load index quotes.');
      return response.json();
    },
  });
  const indexItems = indexPayload?.items || [];
  const hasDelayedIndices = indexItems.some((item) => item.delayed);

  return (
    <div className="min-h-screen bg-[#07111c] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.15),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_32%),linear-gradient(180deg,_#09121f,_#07111c_55%,_#08131f)]" />

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-[#07111c]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="rounded-2xl bg-amber-300 p-2 text-slate-950">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">TickerTap Clone</p>
              <p className="text-xs text-slate-400">Portfolio analyzer</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/80">Workspace</p>
              <p className="mt-1 text-sm text-slate-400">Open the 3-line menu for dashboard, portfolio, risk lab, and watchlist.</p>
            </div>
            {isAuthenticated ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">
                    <UserCircle2 className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{user?.name || user?.email}</p>
                  <p className="truncate text-xs text-slate-400">{user?.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : googleConfigured ? (
              <div className="w-[280px]">
                <GoogleSignInButton />
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/6">
          <div className="mx-auto max-w-[1680px] px-4 py-2 lg:px-8">
            {hasDelayedIndices ? (
              <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">Last close shown for unavailable/holiday indices</p>
            ) : null}
            <div className="flex gap-3 overflow-x-auto whitespace-nowrap pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
              {indexItems.length ? indexItems.map((item) => {
                const positive = Number(item.changePercent || 0) >= 0;
                return (
                  <div key={item.key} className="flex min-w-fit items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(item.price, item.currency || 'INR').replace('.00', '')}</p>
                    </div>
                    <div className={`rounded-xl px-2 py-1 text-xs font-semibold ${positive ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
                      {positive ? '+' : ''}{Number(item.changePercent || 0).toFixed(2)}%
                    </div>
                    {item.delayed ? (
                      <div className="rounded-xl bg-amber-300/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                        Last close
                      </div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-400">
                  Loading NSE indices...
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-[#07111c]/70 pt-20 backdrop-blur-md">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative ml-3 h-[calc(100vh-6rem)] w-[min(360px,calc(100vw-1.5rem))] sidebar-scroll overflow-y-auto rounded-[32px] border border-white/10 bg-[#0b1624]/96 p-6 shadow-[0_28px_100px_rgba(0,0,0,0.42)]">
            <div className="flex min-h-full flex-col justify-between gap-6">
              <div>
                <div className="flex items-center gap-4">
                  <div className="rounded-[22px] bg-amber-300 p-3 text-slate-950">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">TickerTap Clone</p>
                    <p className="text-sm text-slate-400">Stock portfolio analyzing app</p>
                  </div>
                </div>

                <div className="mt-8 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-xs uppercase tracking-[0.24em]">Workspace Menu</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    Open, switch, and manage the portfolio workspace from this compact drawer so charts and analytics get the full screen width.
                  </p>
                </div>

                <nav className="mt-8 space-y-2">
                  {NAV_ITEMS.map((item) => (
                    <NavLink key={item.path} item={item} active={location.pathname === item.path} onClick={() => setMobileOpen(false)} />
                  ))}
                </nav>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/8 bg-gradient-to-br from-white/[0.07] to-transparent p-5">
                  <p className="text-sm font-medium text-white">What this app covers</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Portfolio dashboard, holding analysis, option chain, watchlist pipeline, import/export, and a risk workflow similar to a modern retail analytics app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto max-w-[1680px] px-4 pb-10 pt-36 lg:px-8 lg:pt-40">
        <main className="relative z-10 min-w-0 pt-2 lg:pt-0">
          {!hideWorkspaceAccess ? (
            <div className="mb-6 rounded-[28px] border border-white/8 bg-[#0b1624]/75 px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">Workspace Access</p>
                <p className="mt-1 text-sm text-slate-400">
                  Use the 3-line menu to switch sections while keeping the main screen maximized.
                </p>
              </div>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
