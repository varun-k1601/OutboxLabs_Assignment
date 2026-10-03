import { CalendarClock, Gauge, Search } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router';
import { authApi } from '@/api/endpoints';
import { GoogleIcon, Logo } from '@/components/ui/BrandIcons';
import { FullPageSpinner } from '@/components/ui/Feedback';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useSession } from '@/hooks/useAuth';

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Your sign-in session expired. Please try again.',
  google_signin_failed: "We couldn't verify your Google account. Please try again.",
  google_not_configured: 'Google sign-in is not configured on the server yet.',
};

const HIGHLIGHTS = [
  { icon: CalendarClock, text: 'Schedule campaigns that survive restarts' },
  { icon: Gauge, text: 'Per-sender throttling and hourly limits' },
  { icon: Search, text: 'Search every scheduled and sent email' },
];

export function LoginPage() {
  const session = useSession();
  const config = useAppConfig();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (session.isPending) return <FullPageSpinner />;
  if (session.data) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-brand-50/70 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
          <Logo className="justify-center" />
          <h1 className="mt-8 text-center text-2xl font-semibold text-gray-900">Login</h1>
          <p className="mt-1.5 text-center text-sm text-gray-500">Sign in to schedule and track your cold email campaigns.</p>

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
            </div>
          )}

          <a
            href={authApi.googleLoginUrl}
            className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 shadow-xs transition-colors hover:bg-gray-50"
          >
            <GoogleIcon className="size-5" />
            Login with Google
          </a>
          {config.data && !config.data.googleAuthEnabled && (
            <p className="mt-3 text-center text-xs text-amber-700">
              Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env to enable sign-in.
            </p>
          )}

          <ul className="mt-8 space-y-2.5 border-t border-gray-100 pt-6">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-gray-600">
                <Icon className="size-4 text-brand-600" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
