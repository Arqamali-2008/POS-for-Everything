import { Link } from 'react-router-dom';
import { Home, RotateCcw, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-6">
          <Search className="h-12 w-12 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 className="text-4xl font-bold text-secondary-900 dark:text-white mb-2">404</h1>
        <p className="text-xl text-secondary-600 dark:text-secondary-400 mb-6">Page not found</p>
        <p className="text-secondary-500 dark:text-secondary-500 mb-8 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/">
            <Button>
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </Link>
          <Button variant="secondary" onClick={() => window.history.back()}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
