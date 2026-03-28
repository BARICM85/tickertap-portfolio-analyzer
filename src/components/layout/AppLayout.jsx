import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Briefcase, Eye, LogOut, Shield, TrendingUp, UserCircle2 } from 'lucide-react';
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
  const { user, isAuthenticated, googleConfigured, logout } = useAuth();
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
            <div className="rounded-2xl bg-amber-300 p-2 text-slate-950">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">TickerTap Clone</p>
              <p className="text-xs text-slate-400">Portfolio analyzer</p>
            </div>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-2 px-8 lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.path} item={item} active={location.pathname === item.path} />
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
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

        <div className="border-t border-white/6 lg:hidden">
          <div className="mx-auto flex max-w-[1680px] gap-2 overflow-x-auto px-4 py-2 lg:px-8">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.path} item={item} active={location.pathname === item.path} />
            ))}
          </div>
        </div>

        <div className="border-t border-white/6">
          <div className="mx-auto max-w-[1680px] px-4 py-1.5 lg:px-8">
            {hasDelayedIndices ? (
              <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-amber-200/60">Last close shown for unavailable/holiday indices</p>
            ) : null}
            <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
              {indexItems.length ? indexItems.map((item) => {
                const positive = Number(item.changePercent || 0) >= 0;
                return (
                  <div key={item.key} className="flex min-w-fit items-center gap-2 rounded-[18px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">{item.label}</p>
                      <p className="mt-0.5 text-[15px] font-semibold leading-none text-white">{formatCurrency(item.price, item.currency || 'INR').replace('.00', '')}</p>
                    </div>
                    <div className={`rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${positive ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
                      {positive ? '+' : ''}{Number(item.changePercent || 0).toFixed(2)}%
                    </div>
                    {item.delayed ? (
                      <div className="rounded-full bg-amber-300/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-200">LC</div>
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
      <div className="relative mx-auto max-w-[1680px] px-4 pb-10 pt-36 lg:px-8 lg:pt-36">
        <main className="relative z-10 min-w-0 pt-2 lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
