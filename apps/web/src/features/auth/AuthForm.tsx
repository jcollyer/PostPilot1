'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

type Mode = 'signin' | 'signup' | 'forgot';

interface AuthFormProps {
  hasGoogle: boolean;
}

/**
 * Email/password authentication card. Toggles between signing in, creating an
 * account, and requesting a password reset. New accounts require email
 * verification before they can sign in, so signup ends on a "check your email"
 * notice rather than an immediate redirect.
 */
export function AuthForm({ hasGoogle }: AuthFormProps) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function switchMode(next: Mode) {
    resetMessages();
    setPassword('');
    setMode(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setPending(true);

    try {
      if (mode === 'signup') {
        const { error } = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (error) {
          setError(error.message ?? 'Could not create your account.');
        } else {
          setNotice(
            'Account created. Check your email for a verification link to finish signing in.',
          );
          setMode('signin');
          setPassword('');
        }
        return;
      }

      if (mode === 'forgot') {
        const { error } = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: '/reset-password',
        });
        if (error) {
          setError(error.message ?? 'Could not send the reset email.');
        } else {
          setNotice("If an account exists for that email, we've sent a reset link.");
          setMode('signin');
        }
        return;
      }

      // Sign in.
      const { error } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (error) {
        // Better Auth returns 403 when the email isn't verified yet and
        // re-sends the verification link automatically.
        if (error.status === 403) {
          setNotice(
            "Your email isn't verified yet. We've sent a fresh verification link — check your inbox.",
          );
        } else {
          setError(error.message ?? 'Invalid email or password.');
        }
        return;
      }
      router.push('/home');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    resetMessages();
    await authClient.signIn.social({ provider: 'google', callbackURL: '/home' });
  }

  const titles: Record<Mode, { title: string; description: string }> = {
    signin: { title: 'Welcome back', description: 'Sign in to your queue.' },
    signup: { title: 'Create your account', description: 'Start building your content queue.' },
    forgot: { title: 'Reset your password', description: "We'll email you a reset link." },
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="bg-primary mx-auto mb-2 flex size-10 items-center justify-center rounded-xl">
          <span className="text-primary-foreground text-lg font-bold">P</span>
        </div>
        <CardTitle className="text-2xl">{titles[mode].title}</CardTitle>
        <CardDescription>{titles[mode].description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {hasGoogle && mode !== 'forgot' ? (
          <>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </Button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">or</span>
              </div>
            </div>
          </>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' ? (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Creator"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode !== 'forgot' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === 'signin' ? (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'forgot' ? (
              <Mail className="h-4 w-4" />
            ) : null}
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </Button>
        </form>

        <div className="text-muted-foreground text-center text-sm">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-foreground font-medium hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-foreground font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.84-2.66-5.84-5.95s2.62-5.95 5.84-5.95c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.9 3.95 14.7 3 12 3 6.92 3 2.8 7.13 2.8 12.2S6.92 21.4 12 21.4c6.92 0 9.55-4.85 9.55-7.36 0-.5-.05-.83-.2-1.94z"
        fill="currentColor"
      />
    </svg>
  );
}
