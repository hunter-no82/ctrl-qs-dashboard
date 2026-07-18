import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
  const adAccountId = '511577373';
  const encodedAccountUrn = `urn%3Ali%3AsponsoredAccount%3A${adAccountId}`;

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || 'week';
  const campaignId = searchParams.get('campaignId');
  const campaignIdsParam = searchParams.get('campaignIds');

  let start = new Date();
  const end = new Date();

  if (range === 'day') {
    start.setDate(end.getDate() - 1);
  } else if (range === 'week') {
    start.setDate(end.getDate() - 7);
  } else if (range === 'last30') {
    start.setDate(end.getDate() - 30);
  } else if (range === 'all') {
    start = new Date(2026, 4, 1);
  }

  const dateRange = `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}),end:(year:${end.getFullYear()},month:${end.getMonth() + 1},day:${end.getDate()}))`;

  const campaignIds = campaignIdsParam ? campaignIdsParam.split(',').filter(Boolean) : [];

  const scopeParam =
    campaignIds.length > 0
      ? `&campaigns=List(${campaignIds.map((id) => `urn%3Ali%3AsponsoredCampaign%3A${id}`).join(',')})`
      : campaignId
      ? `&campaigns=List(urn%3Ali%3AsponsoredCampaign%3A${campaignId})`
      : `&accounts=List(${encodedAccountUrn})`;

  const url =
    `https://api.linkedin.com/rest/adAnalytics?q=analytics` +
    `&pivot=CAMPAIGN` +
    `&timeGranularity=DAILY` +
    `&dateRange=${dateRange}` +
    scopeParam +
    `&fields=impressions,clicks,costInLocalCurrency,pivotValues,dateRange`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202607',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: data }, { status: response.status });
  }

  const elements = data.elements || [];

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalCost = 0;

  type DayPoint = { date: string; impressions: number; clicks: number; spend: number };
  const byDate: Record<string, DayPoint> = {};

  for (const el of elements) {
    const impressions = el.impressions || 0;
    const clicks = el.clicks || 0;
    const cost = parseFloat(el.costInLocalCurrency || '0');

    totalImpressions += impressions;
    totalClicks += clicks;
    totalCost += cost;

    const d = el.dateRange?.start;
    if (d) {
      const dateKey = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
      if (!byDate[dateKey]) {
        byDate[dateKey] = { date: dateKey, impressions: 0, clicks: 0, spend: 0 };
      }
      byDate[dateKey].impressions += impressions;
      byDate[dateKey].clicks += clicks;
      byDate[dateKey].spend += cost;
    }
  }

  const trend = Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      spend: Math.round(d.spend * 100) / 100,
    }));

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;

  return NextResponse.json({
    summary: { impressions: totalImpressions, clicks: totalClicks, ctr, cpc, spend: totalCost },
    trend,
  });
}
