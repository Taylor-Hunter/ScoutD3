import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
import { LockClosedIcon, UserCircleIcon } from '@heroicons/react/24/outline';

import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isAuthenticated, user } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = (location.state as { from?: string } | null)?.from || '/settings';

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{mode === 'login' ? 'Sign In' : 'Create Account'} - ScoutD3</title>
        <meta name="description" content="Sign in to ScoutD3 or create an account to save your activity and report history." />
      </Helmet>

      <div className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="bg-slate-900 px-8 py-10 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">ScoutD3 Account</p>
                <h1 className="mt-4 text-3xl font-bold leading-tight">Save the teams, analytics views, and reports tied to your account.</h1>
                <p className="mt-4 text-sm text-slate-300">
                  Create a username of your choice. Usernames must be unique across ScoutD3. Once you sign in, ScoutD3 can keep track of the stats and reports you access.
                </p>
                <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center gap-3">
                    <UserCircleIcon className="h-8 w-8 text-cyan-300" />
                    <div>
                      <p className="text-sm font-semibold">What gets saved</p>
                      <p className="text-sm text-slate-300">Logins, team views, analytics comparisons, and report activity.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-8 py-10">
                <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-medium text-gray-600">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`flex-1 rounded-md px-3 py-2 transition ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`flex-1 rounded-md px-3 py-2 transition ${mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                  >
                    Create Account
                  </button>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                      minLength={3}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Choose a unique username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={8}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  {mode === 'register' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Repeat your password"
                      />
                    </div>
                  )}

                  {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

                  {user && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">Signed in as {user.username}</p>}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LockClosedIcon className="mr-2 h-4 w-4" />
                    {isSubmitting ? 'Working...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;