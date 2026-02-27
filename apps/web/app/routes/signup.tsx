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

export default function SignUp() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.signUp.errors.passwordTooShort'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.signUp.errors.passwordTooShort'));
      return;
    }

    setLoading(true);

    try {
      const response = await api.post<AuthResponse>(
        '/auth/signup',
        { email, username, password },
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(68,115,255,0.16),transparent_40%),radial-gradient(circle_at_85%_8%,rgba(102,157,255,0.14),transparent_35%)]" />
      <Card className="relative w-full max-w-md border-border/90 bg-card/95">
        <CardHeader className="space-y-2 pb-4 text-center">
          <CardTitle className="text-2xl sm:text-[1.9rem]">{t('auth.signUp.title')}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('auth.signUp.subtitle')}
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
                {t('auth.signUp.emailLabel')}
              </label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.signUp.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                {t('auth.signUp.usernameLabel')}
              </label>
              <Input
                id="username"
                type="text"
                placeholder={t('auth.signUp.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t('auth.signUp.passwordLabel')}
              </label>
              <Input
                id="password"
                type="password"
                placeholder={t('auth.signUp.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                {t('auth.signUp.passwordLabel')}
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t('auth.signUp.passwordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-sm font-semibold"
              disabled={loading}
            >
              {loading ? t('common.loading') : t('auth.signUp.submitButton')}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {t('auth.signUp.hasAccount')}{' '}
              <Link to="/signin" className="font-semibold text-primary hover:underline">
                {t('auth.signUp.signInLink')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
