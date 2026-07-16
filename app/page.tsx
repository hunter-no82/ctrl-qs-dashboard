import { createClient } from '../lib/supabase/client';

export default async function Home() {
  const supabase = createClient();
  
  // Try to fetch data from your new 'clients' table
  const { data, error } = await supabase.from('clients').select('*');

  return (
    <main className="p-10">
      <h1 className="text-2xl font-bold">Database Connection Test</h1>
      
      {error ? (
        <p className="text-red-500">Error: {error.message}</p>
      ) : (
        <div className="mt-4">
          <p className="text-green-600">Connection Successful!</p>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}