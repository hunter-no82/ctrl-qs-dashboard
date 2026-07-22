import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FS_TAGS = ['fs1', 'fs2', 'fs3', 'fs4', 'fs5'];

// Research-grounded defaults; overridable per FS via fs_goals columns.
const DEFAULT_THRESHOLDS = {
  awarenessReachPct: 65, // % of target audience reached
  awarenessFreq: 5, // average exposures per reached member (Nielsen 5-9 band)
  considerationEngagePct: 5, // % of aware pool that should click through
  conversionLeadPct: 12, // % of consideration clicks that should become leads
};

const AWARENESS_OBJECTIVES = ['BRAND_AWARENESS'];
const CONSIDERATION_OBJECTIVES = ['WEBSITE_VISIT', 'WEBSITE_TRAFFIC', 'ENGAGEMENT', 'VIDEO_VIEW', 'CREATIVE_ENGAGEMENT'];
const CONVERSION_OBJECTIVES = ['LEAD_GENERATION', 'WEBSITE_CONVERSION', 'JOB_APPLICANT'];

function stageForObjective(objective: string): 'awareness' | 'consideration' | 'conversion' | null {
  if (AWARENESS_OBJECTIVES.includes(objective)) return 'awareness';
  if (CONSIDERATION_OBJECTIVES.includes(objective)) return 'consideration';
  if (CONVERSION_OBJECTIVES.includes(objective)) return 'conversion';
  return null;
}

interface CampaignMetrics {
  impressions: number;
  clicks: number;
  reach: number | null;
  penetration: number | null;
  leads: number;
}

export async function GET() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
  const adAccountId = '511577373';
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': '202607',
    'X-Restli-Protocol-Version': '2.0.0',
  };

  // audiencePenetration is null for ranges over 92 days, so clamp the window.
  const end = new Date();
  const campaignEpoch = new Date(2026, 4, 1);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(end.getDate() - 90);
  const start = campaignEpoch > ninetyDaysAgo ? campaignEpoch : ninetyDaysAgo;
  const dateRange = `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}),end:(year:${end.getFullYear()},month:${end.getMonth() + 1},day:${end.getDate()}))`;

  const campaignsRes = await fetch(
    `https://api.linkedin.com/rest/adAccounts/${adAccountId}/adCampaigns?q=search` +
      `&search=(status:(values:List(ACTIVE,PAUSED,COMPLETED,CANCELED,ARCHIVED)))`,
    { headers }
  );
  const campaignsData = await campaignsRes.json();
  if (!campaignsRes.ok) {
    return NextResponse.json({ error: campaignsData }, { status: campaignsRes.status });
  }

  const fsCampaigns = (campaignsData.elements || [])
    .map((c: any) => ({
      id: c.id as number,
      name: c.name as string,
      status: c.status as string,
      objectiveType: (c.objectiveType || '') as string,
    }))
    .filter((c: any) => FS_TAGS.some((tag) => c.name.toLowerCase().includes(tag)));

  const allIds = fsCampaigns.map((c: any) => c.id);
  const metricsById: Record<string, CampaignMetrics> = {};

  if (allIds.length > 0) {
    const url =
      `https://api.linkedin.com/rest/adAnalytics?q=analytics` +
      `&pivot=CAMPAIGN` +
      `&timeGranularity=ALL` +
      `&dateRange=${dateRange}` +
      `&campaigns=List(${allIds.map((id: number) => `urn%3Ali%3AsponsoredCampaign%3A${id}`).join(',')})` +
      `&fields=impressions,clicks,approximateMemberReach,audiencePenetration,oneClickLeads,externalWebsiteConversions,pivotValues`;

    const analyticsRes = await fetch(url, { headers });
    const analyticsData = await analyticsRes.json();
    if (!analyticsRes.ok) {
      return NextResponse.json({ error: analyticsData }, { status: analyticsRes.status });
    }

    for (const el of analyticsData.elements || []) {
      const id = (el.pivotValues?.[0] || '').split(':').pop();
      if (!id) continue;
      metricsById[id] = {
        impressions: el.impressions || 0,
        clicks: el.clicks || 0,
        reach: el.approximateMemberReach ?? null,
        penetration: el.audiencePenetration ?? null,
        leads: (el.oneClickLeads || 0) + (el.externalWebsiteConversions || 0),
      };
    }
  }

  // Snapshots preserve cumulative values once campaigns age past the 92-day
  // reach window. Best-effort: the feature still works if the table is missing.
  let snapshots: Record<string, CampaignMetrics> = {};
  try {
    const { data } = await supabase.from('funnel_snapshots').select('*');
    (data || []).forEach((row: any) => {
      snapshots[String(row.campaign_id)] = {
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        reach: row.reach != null ? Number(row.reach) : null,
        penetration: row.penetration != null ? Number(row.penetration) : null,
        leads: Number(row.leads) || 0,
      };
    });

    const upserts = Object.entries(metricsById)
      .filter(([, m]) => m.reach != null || m.impressions > 0)
      .map(([id, m]) => ({
        campaign_id: id,
        impressions: m.impressions,
        clicks: m.clicks,
        reach: m.reach,
        penetration: m.penetration,
        leads: m.leads,
        updated_at: new Date().toISOString(),
      }));
    if (upserts.length > 0) {
      await supabase.from('funnel_snapshots').upsert(upserts);
    }
  } catch {
    snapshots = {};
  }

  // Live metrics win; snapshots fill gaps for aged-out campaigns.
  const effectiveMetrics = (id: number): CampaignMetrics | null => {
    const live = metricsById[String(id)];
    if (live && (live.reach != null || live.impressions > 0)) return live;
    return snapshots[String(id)] || live || null;
  };

  let thresholdRows: any[] = [];
  try {
    const { data } = await supabase.from('fs_goals').select('*');
    thresholdRows = data || [];
  } catch {
    thresholdRows = [];
  }

  const thresholdsByTag: Record<string, typeof DEFAULT_THRESHOLDS> = {};
  for (const tag of FS_TAGS) {
    const row = thresholdRows.find((r) => r.fs_tag === tag);
    thresholdsByTag[tag] = {
      awarenessReachPct: row?.awareness_reach_pct != null ? Number(row.awareness_reach_pct) : DEFAULT_THRESHOLDS.awarenessReachPct,
      awarenessFreq: row?.awareness_freq != null ? Number(row.awareness_freq) : DEFAULT_THRESHOLDS.awarenessFreq,
      considerationEngagePct:
        row?.consideration_engage_pct != null ? Number(row.consideration_engage_pct) : DEFAULT_THRESHOLDS.considerationEngagePct,
      conversionLeadPct: row?.conversion_lead_pct != null ? Number(row.conversion_lead_pct) : DEFAULT_THRESHOLDS.conversionLeadPct,
    };
  }

  const funnel = FS_TAGS.map((tag) => {
    const tagCampaigns = fsCampaigns.filter((c: any) => c.name.toLowerCase().includes(tag));
    if (tagCampaigns.length === 0) return null;

    const t = thresholdsByTag[tag];
    const byStage: Record<string, any[]> = { awareness: [], consideration: [], conversion: [] };
    for (const c of tagCampaigns) {
      const stage = stageForObjective(c.objectiveType);
      if (stage) byStage[stage].push(c);
    }

    // Awareness: aggregate reach vs derived audience, plus average frequency.
    // Clicks on awareness content (e.g. doc ads) are also captured as "banked
    // engagement" — self-selected interest that counts toward consideration.
    let awImpressions = 0;
    let awReach = 0;
    let awAudience = 0;
    let awClicks = 0;
    let awActiveCount = 0;
    for (const c of byStage.awareness) {
      const m = effectiveMetrics(c.id);
      if (!m) continue;
      awImpressions += m.impressions;
      awClicks += m.clicks;
      if (m.reach != null && m.penetration != null && m.penetration > 0) {
        awReach += m.reach;
        awAudience += m.reach / m.penetration;
      }
      if (c.status === 'ACTIVE') awActiveCount++;
    }
    const awPenetration = awAudience > 0 ? Math.min(1, awReach / awAudience) : null;
    const awFrequency = awReach > 0 ? awImpressions / awReach : 0;
    const awProgress =
      awPenetration == null
        ? null
        : Math.min(1, Math.min(awPenetration / (t.awarenessReachPct / 100), awFrequency / t.awarenessFreq));

    // Consideration: clicks against a share of the actual aware pool. Direct
    // clicks come from consideration campaigns; banked clicks are engagement
    // already earned on awareness content, credited here so it isn't lost.
    let directConsidClicks = 0;
    let considActiveCount = 0;
    for (const c of byStage.consideration) {
      const m = effectiveMetrics(c.id);
      if (!m) continue;
      directConsidClicks += m.clicks;
      if (c.status === 'ACTIVE') considActiveCount++;
    }
    const bankedClicks = awClicks;
    const considClicks = directConsidClicks + bankedClicks;
    const considHasActivity = byStage.consideration.length > 0 || bankedClicks > 0;
    const awarePool = awReach;
    const considTarget = awarePool > 0 ? Math.round(awarePool * (t.considerationEngagePct / 100)) : null;
    const considProgress =
      !considHasActivity ? null : considTarget && considTarget > 0 ? Math.min(1, considClicks / considTarget) : null;
    const considStatus = !considHasActivity
      ? 'not_started'
      : considProgress == null
      ? 'no_data'
      : considProgress >= 1
      ? 'complete'
      : 'in_progress';

    // Conversion: leads against a share of actual consideration clicks.
    let convLeads = 0;
    let convActiveCount = 0;
    for (const c of byStage.conversion) {
      const m = effectiveMetrics(c.id);
      if (!m) continue;
      convLeads += m.leads;
      if (c.status === 'ACTIVE') convActiveCount++;
    }
    const engagedPool = considClicks;
    const convTarget = engagedPool > 0 ? Math.round(engagedPool * (t.conversionLeadPct / 100)) : null;
    const convProgress =
      byStage.conversion.length === 0 ? null : convTarget && convTarget > 0 ? Math.min(1, convLeads / convTarget) : null;

    const status = (campaignCount: number, progress: number | null) => {
      if (campaignCount === 0) return 'not_started';
      if (progress == null) return 'no_data';
      if (progress >= 1) return 'complete';
      return 'in_progress';
    };

    return {
      tag,
      label: `Flagship Solution ${tag.slice(2)}`,
      stages: {
        awareness: {
          campaignCount: byStage.awareness.length,
          activeCount: awActiveCount,
          impressions: awImpressions,
          reach: awReach,
          audience: Math.round(awAudience),
          penetration: awPenetration,
          frequency: awFrequency,
          progress: awProgress,
          status: status(byStage.awareness.length, awProgress),
        },
        consideration: {
          campaignCount: byStage.consideration.length,
          activeCount: considActiveCount,
          clicks: considClicks,
          directClicks: directConsidClicks,
          bankedClicks,
          targetClicks: considTarget,
          awarePool,
          progress: considProgress,
          status: considStatus,
        },
        conversion: {
          campaignCount: byStage.conversion.length,
          activeCount: convActiveCount,
          leads: convLeads,
          targetLeads: convTarget,
          engagedPool,
          progress: convProgress,
          status: status(byStage.conversion.length, convProgress),
        },
      },
    };
  }).filter(Boolean);

  return NextResponse.json({ funnel, thresholds: thresholdsByTag });
}
