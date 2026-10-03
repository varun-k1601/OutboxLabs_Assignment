import { QueryClientProvider } from '@tanstack/react-query';
import { Navigate, createBrowserRouter, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { queryClient } from '@/lib/query-client';
import { EmailDetailPage } from '@/pages/EmailDetailPage';
import { EmailListPage } from '@/pages/EmailListPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// OAuth redirects land on /dashboard (sometimes with ?slack=...), keep the query string
function DashboardHome() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/dashboard/scheduled', search: location.search }} replace />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard/scheduled" replace /> },
      { path: 'dashboard', element: <DashboardHome /> },
      { path: 'dashboard/scheduled', element: <EmailListPage key="scheduled" view="scheduled" /> },
      { path: 'dashboard/sent', element: <EmailListPage key="sent" view="sent" /> },
      // the editor is the biggest dependency, only load it on the compose page
      { path: 'compose', lazy: async () => ({ Component: (await import('@/pages/ComposePage')).ComposePage }) },
      { path: 'emails/:emailId', element: <EmailDetailPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
