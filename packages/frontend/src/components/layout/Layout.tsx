import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Receipt, 
  ShoppingBag, 
  CreditCard, 
  Settings,
  Menu,
  X,
  LogOut,
  User,
  Bell,
  Sun,
  Moon,
  Monitor,
  Truck,
  Warehouse,
  FolderTree,
  UserCog,
  Landmark,
  HandCoins,
  BarChart3,
  PieChart,
  ScanLine,
  Award,
  ClipboardList,
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../providers/AuthProvider';
import { useWebSocket } from '../../providers/WebSocketProvider';
import { useToast } from '../ui/Toaster';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'POS', href: '/pos', icon: ShoppingCart },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Categories', href: '/categories', icon: FolderTree },
  { name: 'Inventory', href: '/inventory', icon: Warehouse },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Suppliers', href: '/suppliers', icon: Truck },
  { name: 'Sales', href: '/sales', icon: Receipt },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag },
  { name: 'Expenses', href: '/expenses', icon: CreditCard },
  { name: 'Employees', href: '/employees', icon: UserCog },
  { name: 'Cheques', href: '/cheques', icon: Landmark },
  { name: 'Loans', href: '/loans', icon: HandCoins },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Analysis', href: '/analysis', icon: PieChart },
  { name: 'Barcode', href: '/barcode', icon: ScanLine },
  { name: 'Leaderboard', href: '/leaderboard', icon: Award },
  { name: 'Summary', href: '/summary', icon: ClipboardList },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();
  const { success } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  const toggleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark' || (nextTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
    localStorage.setItem('theme', nextTheme);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' || 'system';
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
  }, []);

  const handleLogout = async () => {
    await logout();
    success('Logged out', 'You have been successfully logged out');
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static z-50 h-screen w-64 bg-white dark:bg-secondary-800 border-r border-secondary-200 dark:border-secondary-700 flex flex-col transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-secondary-200 dark:border-secondary-700">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-secondary-900 dark:text-white">POS for Everything</span>
          </div>
          <button
            className="lg:hidden p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/' && location.pathname.startsWith(item.href));
            
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-700'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom: Connection status & User */}
        <div className="p-4 border-t border-secondary-200 dark:border-secondary-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                'h-2 w-2 rounded-full',
                isConnected ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="text-xs text-secondary-500 dark:text-secondary-400">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <button
              className="p-1 rounded-lg text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300"
              onClick={toggleTheme}
              aria-label={`Current theme: ${theme}`}
            >
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </button>
          </div>

          <p className="text-[10px] text-center text-secondary-400 dark:text-secondary-500 mt-3 select-none">
            Designed and Developed By AMi
          </p>

          <div className="flex items-center gap-3">
            <Avatar 
              name={user?.fullName || 'User'} 
              size="md" 
              status={isConnected ? 'online' : 'offline'}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-secondary-900 dark:text-white truncate">
                {user?.fullName || 'User'}
              </p>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 capitalize truncate">
                {user?.role || 'cashier'}
              </p>
            </div>
            <button
              className="p-1.5 rounded-lg text-secondary-400 hover:bg-secondary-100 dark:hover:bg-secondary-700"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
            >
              <User className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* User dropdown menu */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
      )}
      {userMenuOpen && (
        <div className="fixed right-4 top-16 z-50 w-48 bg-white dark:bg-secondary-800 rounded-lg shadow-elevated border border-secondary-200 dark:border-secondary-700 py-1 animate-fade-in">
          <button className="w-full px-4 py-2 text-left text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-700" onClick={() => { setUserMenuOpen(false); }}>
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </span>
          </button>
          <hr className="my-1 border-secondary-200 dark:border-secondary-700" />
          <button 
            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-secondary-100 dark:hover:bg-secondary-700"
            onClick={handleLogout}
          >
            <span className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </span>
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-0 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-secondary-800/80 backdrop-blur-sm border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between px-4 lg:px-6">
          <button
            className="lg:hidden p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>

          <h1 className="lg:hidden text-lg font-semibold text-secondary-900 dark:text-white">
            {navigation.find(n => n.href === location.pathname)?.name || 'POS for Everything'}
          </h1>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <button className="relative p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
            </button>

            {/* Theme toggle (desktop) */}
            <button
              className="hidden lg:flex p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700"
              onClick={toggleTheme}
              aria-label={`Current theme: ${theme}`}
            >
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </button>

            {/* Connection status (desktop) */}
            <div className="hidden lg:flex items-center gap-2">
              <span className={cn(
                'h-2 w-2 rounded-full',
                isConnected ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="text-xs text-secondary-500 dark:text-secondary-400">
                {isConnected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
