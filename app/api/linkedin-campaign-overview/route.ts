import { NextResponse } from 'next/server';

export async function GET() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
  const adAccountId = '511577373';
  const encodedAccountUrn = `urn%3Ali%3AsponsoredAccount%3A${adAccountId}`;

  const start = new Date(2026, 4, 1);
  const dateRange = `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}))`;

  const url =
    `https://api.linkedin.com/rest/adAnalytics?q=analytics` +
    `&pivot=CAMPAIGN` +
    `&timeGranularity=ALL` +
    `&dateRange=${dateRange}` +
    `&accounts=List(${encodedAccountUrn})` +
    `&fields=impressions,clicks,costInLocalCurrency,pivotValues`;

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
  const spendByCampaignId: Record<string, { impressions: number; clicks: number; spend: number }> = {};

  for (const el of elements) {
    const urn = el.pivotValues?.[0] || '';
    const campaignId = urn.split(':').pop();
    if (!campaignId) continue;
    spendByCampaignId[campaignId] = {
      impressions: el.impressions || 0,
      clicks: el.clicks || 0,
      spend: parseFloat(el.costInLocalCurrency || '0'),
    };
  }

  return NextResponse.json({ spendByCampaignId });
}
