import { Navigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return <Navigate to="/signin" replace />;
}
