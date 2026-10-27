import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../utils/helpers';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { useAuth } from '../providers/AuthProvider';
import { useToast } from '../components/ui/Toaster';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, isLoading: authLoading } = useAuth();
  const { error: toastError } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@pos.com',
      password: 'admin123',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password, data.rememberMe);
    } catch (err) {
      toastError('Login failed', err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary-600 mb-4">
            <svg className="h-10 w-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a2 2 0 00-2-2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2v-5" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7l5 5M7 17l5-5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-secondary-900 dark:text-white">POS for Everything</h1>
          <p className="text-secondary-500 dark:text-secondary-400 mt-1">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <Input
              label="Email"
              type="email"
              placeholder="admin@pos.com"
              error={errors.email?.message}
              {...register('email')}
              autoComplete="email"
              leftIcon={<Mail className="h-5 w-5 text-secondary-400" />}
            />

            {/* Password */}
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                error={errors.password?.message}
                {...register('password')}
                autoComplete="current-password"
                leftIcon={<Lock className="h-5 w-5 text-secondary-400" />}
              />
              <button
                type="button"
                className="absolute right-3 top-[38px] text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  {...register('rememberMe')}
                />
                <span className="text-sm text-secondary-700 dark:text-secondary-300">Remember me</span>
              </label>
              <a href="#" className="text-sm text-primary-600 hover:underline dark:text-primary-400">
                Forgot password?
              </a>
            </div>

            {/* Error message */}
            {(errors.root?.message || errors.form?.message) && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{errors.root?.message || errors.form?.message}</p>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isLoading || authLoading}
            >
              Sign In
            </Button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
            <p className="text-xs text-secondary-600 dark:text-secondary-400 text-center">
              Demo credentials: <br />
              <code className="font-mono">admin@pos.com</code> / <code className="font-mono">admin123</code>
            </p>
          </div>
        </Card>

        {/* Version info */}
        <p className="text-center text-xs text-secondary-400 mt-6">
          POS for Everything v2.0.0
        </p>
      </div>
    </div>
  );
}
