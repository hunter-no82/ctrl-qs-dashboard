import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from('fs_goals').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const goals: Record<string, { impressionsTarget: number | null; clicksTarget: number | null; spendTarget: number | null }> = {};
  (data || []).forEach((row: any) => {
    goals[row.fs_tag] = {
      impressionsTarget: row.impressions_target,
      clicksTarget: row.clicks_target,
      spendTarget: row.spend_target,
    };
  });

  return NextResponse.json({ goals });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { fsTag, impressionsTarget, clicksTarget, spendTarget } = body;

  if (!fsTag) {
    return NextResponse.json({ error: 'fsTag is required' }, { status: 400 });
  }

  const { error } = await supabase.from('fs_goals').upsert({
    fs_tag: fsTag,
    impressions_target: impressionsTarget ?? null,
    clicks_target: clicksTarget ?? null,
    spend_target: spendTarget ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
