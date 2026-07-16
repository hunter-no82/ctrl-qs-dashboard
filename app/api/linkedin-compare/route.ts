import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || 'week';
  const idsParam = searchParams.get('campaignIds') || '';
  const campaignIds = idsParam.split(',').filter(Boolean);

  if (campaignIds.length === 0) {
    return NextResponse.json({ error: 'No campaigns provided' }, { status: 400 });
  }

  let start = new Date();
  const end = new Date();
  if (range === 'week') start.setDate(end.getDate() - 7);
  else if (range === 'last30') start.setDate(end.getDate() - 30);
  else if (range === 'all') start = new Date(2023, 0, 1);

  const dateRange = `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}),end:(year:${end.getFullYear()},month:${end.getMonth() + 1},day:${end.getDate()}))`;

  const encodedUrns = campaignIds
    .map((id) => `urn%3Ali%3AsponsoredCampaign%3A${id}`)
    .join(',');

  const url =
    `https://api.linkedin.com/rest/adAnalytics?q=analytics` +
    `&pivot=CAMPAIGN` +
    `&timeGranularity=DAILY` +
    `&dateRange=${dateRange}` +
    `&campaigns=List(${encodedUrns})` +
    `&fields=impressions,clicks,pivotValues,dateRange`;

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
  const byDate: Record<string, Record<string, number>> = {};

  for (const el of elements) {
    const urn = el.pivotValues?.[0] || '';
    const campaignId = urn.split(':').pop();
    const d = el.dateRange?.start;
    if (!d || !campaignId) continue;
    const dateKey = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    if (!byDate[dateKey]) byDate[dateKey] = {};
    byDate[dateKey][campaignId] = (byDate[dateKey][campaignId] || 0) + (el.impressions || 0);
  }

  const trend = Object.entries(byDate)
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ trend, campaignIds });
}