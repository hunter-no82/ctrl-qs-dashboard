// test-creative-fetch.js
// Standalone feasibility test - run with: node test-creative-fetch.js
// Tests two things:
//   1. Per-creative analytics via pivot=CREATIVE (should already work per prior testing)
//   2. Fetching actual creative content (image + headline copy) - UNTESTED, this is what we're checking

require('dotenv').config({ path: '.env.local' });

const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
const adAccountId = '511577373';

// Change this to a specific campaign ID you want to test against,
// or leave as null to test at the account level (all campaigns).
const TEST_CAMPAIGN_ID = null; // e.g. '802804374'

// Change this to adjust the test date range (days back from today)
const DAYS_BACK = 30;

async function main() {
  if (!accessToken) {
    console.error('Missing LINKEDIN_ACCESS_TOKEN in .env.local');
    process.exit(1);
  }

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - DAYS_BACK);

  const dateRange =
    `(start:(year:${start.getFullYear()},month:${start.getMonth() + 1},day:${start.getDate()}),` +
    `end:(year:${end.getFullYear()},month:${end.getMonth() + 1},day:${end.getDate()}))`;

  const scopeParam = TEST_CAMPAIGN_ID
    ? `&campaigns=List(urn%3Ali%3AsponsoredCampaign%3A${TEST_CAMPAIGN_ID})`
    : `&accounts=List(urn%3Ali%3AsponsoredAccount%3A${adAccountId})`;

  const analyticsUrl =
    `https://api.linkedin.com/rest/adAnalytics?q=analytics` +
    `&pivot=CREATIVE` +
    `&timeGranularity=ALL` +
    `&dateRange=${dateRange}` +
    scopeParam +
    `&fields=impressions,clicks,costInLocalCurrency,pivotValues,oneClickLeads,likes,comments,shares,follows`;

  console.log('--- STEP 1: Fetching per-creative analytics ---');
  console.log('URL:', analyticsUrl);
  console.log('');

  const analyticsRes = await fetch(analyticsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202506',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  const analyticsData = await analyticsRes.json();

  console.log('Status:', analyticsRes.status);
  console.log(JSON.stringify(analyticsData, null, 2));
  console.log('');

  if (!analyticsRes.ok) {
    console.error('Step 1 failed - stopping here. Fix this before testing creative content fetch.');
    return;
  }

  const elements = analyticsData.elements || [];
  if (elements.length === 0) {
    console.log('No creative-level data returned for this range/scope. Try a wider date range or different campaign.');
    return;
  }

  // Grab the creative URN from the first result to test content fetch
  const firstCreativeUrn = elements[0].pivotValues?.[0];
  console.log('First creative URN found:', firstCreativeUrn);
  console.log('');

  if (!firstCreativeUrn) {
    console.log('Could not find a creative URN in pivotValues - inspect the raw response above.');
    return;
  }

  // The URN looks like urn:li:sponsoredCreative:123456 - extract the numeric ID
  const creativeId = firstCreativeUrn.split(':').pop();

  console.log('--- STEP 2: Fetching creative content (image + copy) ---');
  console.log('This is the UNTESTED part - checking if we can get the actual ad content.');
  console.log('');

  // Try the creatives endpoint - LinkedIn now requires the ad account ID
  // baked into the URL path, and the key itself appears to need the full
  // URN (percent-encoded), not just the bare numeric ID.
  const encodedCreativeUrn = `urn%3Ali%3AsponsoredCreative%3A${creativeId}`;
  const creativeUrl = `https://api.linkedin.com/rest/adAccounts/${adAccountId}/creatives/${encodedCreativeUrn}`;

  console.log('URL:', creativeUrl);

  const creativeRes = await fetch(creativeUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202506',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  const creativeData = await creativeRes.json();

  console.log('Status:', creativeRes.status);
  console.log(JSON.stringify(creativeData, null, 2));

  if (creativeRes.ok) {
    console.log('');
    console.log('SUCCESS - creative content endpoint works.');

    const shareUrn = creativeData.content?.reference;
    if (!shareUrn) {
      console.log('No content.reference found on the creative - inspect the raw response above.');
      return;
    }

    console.log('');
    console.log('--- STEP 3: Resolving the share/post itself (actual image + copy) ---');
    const encodedShareUrn = encodeURIComponent(shareUrn);
    const postUrl = `https://api.linkedin.com/rest/posts/${encodedShareUrn}`;
    console.log('URL:', postUrl);

    const postRes = await fetch(postUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202506',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    const postData = await postRes.json();
    console.log('Status:', postRes.status);
    console.log(JSON.stringify(postData, null, 2));

    if (postRes.ok) {
      console.log('');
      console.log('SUCCESS - post content endpoint works. Paste this whole output back to Claude.');
    } else {
      console.log('');
      console.log('FAILED at Step 3 - paste this whole output back to Claude.');
    }
  } else {
    console.log('');
    console.log('FAILED - creative content endpoint did not work as expected. Paste this whole output back to Claude so we can figure out the right approach (may need a different endpoint or additional permissions).');
  }
}

main().catch((err) => {
  console.error('Script error:', err);
});
