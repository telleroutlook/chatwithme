import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { useAuthStore } from '~/stores/auth';
import { api, getApiErrorMessage } from '~/client';
import { Link } from 'react-router';
import { useTranslation } from '~/i18n';
import type { AuthResponse } from '@chatwithme/shared';

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post<AuthResponse>(
        '/auth/signin',
        { email, password },
        { withAuth: false }
      );

      if (response.success && response.data) {
        setAuth(response.data.user, response.data.tokens);
        navigate('/');
      } else {
        setError(getApiErrorMessage(response.error));
      }
    } catch {
      setError(t('common.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(71,125,255,0.18),transparent_42%),radial-gradient(circle_at_85%_85%,rgba(118,169,255,0.14),transparent_38%)]" />
      <Card className="relative w-full max-w-md border-border/90 bg-card/95">
        <CardHeader className="space-y-2 pb-4 text-center">
          <CardTitle className="text-2xl sm:text-[1.9rem]">{t('auth.signIn.title')}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('auth.signIn.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t('auth.signIn.emailLabel')}
              </label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.signIn.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t('auth.signIn.passwordLabel')}
              </label>
              <Input
                id="password"
                type="password"
                placeholder={t('auth.signIn.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-sm font-semibold"
              disabled={loading}
            >
              {loading ? t('common.loading') : t('auth.signIn.submitButton')}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {t('auth.signIn.noAccount')}{' '}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                {t('auth.signIn.signUpLink')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
