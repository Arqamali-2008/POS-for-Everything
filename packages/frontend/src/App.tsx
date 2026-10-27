import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { POSPage } from './pages/POSPage';
import { ProductsPage } from './pages/ProductsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SalesPage } from './pages/SalesPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { InventoryPage } from './pages/InventoryPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ChequesPage } from './pages/ChequesPage';
import { LoansPage } from './pages/LoansPage';
import { ReportsPage } from './pages/ReportsPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { BarcodePage } from './pages/BarcodePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { SummaryPage } from './pages/SummaryPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useEnterNavigation } from './hooks/useEnterNavigation';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, isLoading } = useAuth();

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, isLoading } = useAuth();

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  useEnterNavigation();

  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />
      
      <Route element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/cheques" element={<ChequesPage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/barcode" element={<BarcodePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}