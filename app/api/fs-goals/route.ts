import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from('fs_goals').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const thresholds: Record<
    string,
    {
      awarenessReachPct: number | null;
      awarenessFreq: number | null;
      considerationEngagePct: number | null;
      conversionLeadPct: number | null;
    }
  > = {};
  (data || []).forEach((row: any) => {
    thresholds[row.fs_tag] = {
      awarenessReachPct: row.awareness_reach_pct,
      awarenessFreq: row.awareness_freq,
      considerationEngagePct: row.consideration_engage_pct,
      conversionLeadPct: row.conversion_lead_pct,
    };
  });

  return NextResponse.json({ thresholds });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { fsTag, awarenessReachPct, awarenessFreq, considerationEngagePct, conversionLeadPct } = body;

  if (!fsTag) {
    return NextResponse.json({ error: 'fsTag is required' }, { status: 400 });
  }

  const { error } = await supabase.from('fs_goals').upsert({
    fs_tag: fsTag,
    awareness_reach_pct: awarenessReachPct ?? null,
    awareness_freq: awarenessFreq ?? null,
    consideration_engage_pct: considerationEngagePct ?? null,
    conversion_lead_pct: conversionLeadPct ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
