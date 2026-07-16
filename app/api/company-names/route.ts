import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from('company_names').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    map[row.org_id] = row.company_name;
  });

  return NextResponse.json({ names: map });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { orgId, companyName } = body;

  if (!orgId || !companyName) {
    return NextResponse.json({ error: 'orgId and companyName are required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('company_names')
    .upsert({ org_id: orgId, company_name: companyName });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}