import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { queryClientInstance } from '@/lib/query-client';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import OptionChainPage from '@/pages/OptionChainPage';
import Portfolio from '@/pages/Portfolio';
import StockDetail from '@/pages/StockDetail';
import RiskAnalysis from '@/pages/RiskAnalysis';
import WatchlistPage from '@/pages/WatchlistPage';

function AuthenticatedApp() {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#07111c]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-amber-300" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Portfolio" element={<Portfolio />} />
        <Route path="/OptionChain" element={<OptionChainPage />} />
        <Route path="/StockDetail" element={<StockDetail />} />
        <Route path="/RiskAnalysis" element={<RiskAnalysis />} />
        <Route path="/Watchlist" element={<WatchlistPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster theme="dark" richColors position="top-right" />
      </QueryClientProvider>
    </AuthProvider>
  );
}
