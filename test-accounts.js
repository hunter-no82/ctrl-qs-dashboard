require('dotenv').config({ path: '.env.local' });

async function getAccounts() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const url = 'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:List(ACTIVE))';
  
  console.log('Requesting Accounts...');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202607',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

getAccounts();