import { createClient } from './utils/supabase/server';

export default async function Page() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  const email = data.user?.email ?? null;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Supabase Session Check</h1>
      {error ? <p>Auth error: {error.message}</p> : null}
      <p>{email ? `Signed in as ${email}` : 'No active session'}</p>
    </main>
  );
}
