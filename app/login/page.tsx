'use client';
import { useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const supabase = createClient();
  const router = useRouter();

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-10 max-w-sm">
      <h1 className="text-xl font-bold">Client Login</h1>
      <input className="border p-2" type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input className="border p-2" type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
      <button className="bg-blue-500 text-white p-2 font-bold" onClick={handleLogin}>Login</button>
      <p className="text-xs text-gray-400 mt-2">Powered by Tether.82</p>
    </div>
  );
}
