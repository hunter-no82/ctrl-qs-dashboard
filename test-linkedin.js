require('dotenv').config({ path: '.env.local' });

async function testLinkedIn() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = '1254387'; // one of the real organization IDs from our last result

  const url = `https://api.linkedin.com/rest/organizations/${orgId}`;

  console.log('Requesting:', url);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202506',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  console.log('Status:', response.status);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

testLinkedIn();