import { NextResponse } from 'next/server';

export async function GET() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;
  const adAccountId = '511577373'; // just the number, e.g. 123456789

  const response = await fetch(
    `https://api.linkedin.com/rest/adAccounts/${adAccountId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202607',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  const data = await response.json();
  return NextResponse.json(data);
}