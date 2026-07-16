import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code returned from LinkedIn' }, { status: 400 });
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
  });

  const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const tokenData = await tokenResponse.json();

  console.log('LinkedIn token response:', tokenData);
  console.log('=== COPY THIS TOKEN EXACTLY ===');
  console.log(tokenData.access_token);
  console.log('=== END TOKEN ===');

  return NextResponse.json(tokenData);
}