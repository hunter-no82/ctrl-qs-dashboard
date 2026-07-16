import { NextResponse } from 'next/server';

export async function GET() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
  const adAccountId = '511577373';

  const url =
    `https://api.linkedin.com/rest/adAccounts/${adAccountId}/adCampaigns?q=search` +
    `&search=(status:(values:List(ACTIVE,PAUSED,COMPLETED,CANCELED,ARCHIVED)))`;

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

  const campaigns = (data.elements || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    status: c.status,
  }));

  return NextResponse.json({ campaigns });
}