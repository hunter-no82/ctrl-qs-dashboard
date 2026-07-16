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

  if (range === 'week') {
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
    `&pivot=MEMBER_COMPANY` +
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

  const byOrg: Record<string, { orgId: string; impressions: number; clicks: number; profileUrl: string }> = {};

  for (const el of elements) {
    const orgUrn = el.pivotValues?.[0];
    if (!orgUrn) continue;

    const orgId = orgUrn.split(':').pop();
    if (!orgId) continue;

    if (!byOrg[orgId]) {
      byOrg[orgId] = {
        orgId,
        impressions: 0,
        clicks: 0,
        profileUrl: `https://www.linkedin.com/company/${orgId}`,
      };
    }
    byOrg[orgId].impressions += el.impressions || 0;
    byOrg[orgId].clicks += el.clicks || 0;
  }

  const companies = Object.values(byOrg).sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ companies });
}
