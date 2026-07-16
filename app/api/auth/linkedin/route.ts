import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI!;
  const scope = 'r_ads r_ads_reporting';
  const state = 'devtest123';

  const authUrl =
    `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(scope)}`;

  return NextResponse.redirect(authUrl);
}