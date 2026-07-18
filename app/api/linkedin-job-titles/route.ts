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
    `&pivot=MEMBER_JOB_TITLE` +
    `&timeGranularity=ALL` +
    `&dateRange=${dateRange}` +
    scopeParam +
    `&fields=impressions,clicks,pivotValues`;

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

  const byTitle: Record<string, { titleId: string; impressions: number; clicks: number }> = {};

  for (const el of elements) {
    const urn = el.pivotValues?.[0];
    if (!urn) continue;

    const titleId = urn.split(':').pop();
    if (!titleId) continue;

    if (!byTitle[titleId]) {
      byTitle[titleId] = { titleId, impressions: 0, clicks: 0 };
    }
    byTitle[titleId].impressions += el.impressions || 0;
    byTitle[titleId].clicks += el.clicks || 0;
  }

  const topTitles = Object.values(byTitle)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  if (topTitles.length === 0) {
    return NextResponse.json({ jobTitles: [] });
  }

  const idsList = topTitles.map((t) => t.titleId).join(',');
  const namesResponse = await fetch(`https://api.linkedin.com/v2/titles?ids=List(${idsList})&locale=en_US`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202607',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  const namesData = await namesResponse.json();
  const results = namesData.results || {};

  const jobTitles = topTitles.map((t) => ({
    titleId: t.titleId,
    name: results[t.titleId]?.name?.localized?.en_US || `Title (ID: ${t.titleId})`,
    impressions: t.impressions,
    clicks: t.clicks,
  }));

  return NextResponse.json({ jobTitles });
}
