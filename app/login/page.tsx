'use client';
import { useState, FormEvent } from 'react';
import { createClient } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center p-6"
      style={{ backgroundColor: '#FAFAF7' }}
    >
      <img
        src="/ctrl-qs-circles.png"
        alt=""
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{ top: -40, right: -40, width: 220, opacity: 0.14 }}
      />
      <img
        src="/ctrl-qs-circles.png"
        alt=""
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{ bottom: -30, left: -30, width: 170, opacity: 0.1, transform: 'rotate(180deg)' }}
      />

      <form
        onSubmit={handleLogin}
        className="relative bg-white rounded-xl shadow-sm border border-gray-100 p-10 w-full max-w-sm flex flex-col gap-4"
      >
        <img src="/ctrl-qs-logo.png" alt="ctrl QS" className="h-8 mb-2 self-start" />

        <div>
          <h1 className="text-xl font-bold" style={{ color: '#270428' }}>
            Client Login
          </h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to view your Flagship Solutions dashboard.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Email</label>
          <input
            type="email"
            required
            autoFocus
            className="w-full p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#796ffb] focus:border-transparent"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Password</label>
          <input
            type="password"
            required
            className="w-full p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#796ffb] focus:border-transparent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm rounded p-2" style={{ backgroundColor: '#fdecea', color: '#b3413a' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="text-white p-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#270428' }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="text-xs text-gray-400 text-center mt-2">Powered by Tether.82</p>
      </form>
    </div>
  );
}
