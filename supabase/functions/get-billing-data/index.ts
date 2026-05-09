const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:8080',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BQ_PROJECT = 'whatspot-2025';
const BQ_TABLE   = 'whatspot-2025.whatspot_billing.gcp_billing_export_v1_013FE1_F23402_48EDDE';

const MTD_QUERY = `
SELECT service.description, SUM(cost) as mtd_spend
FROM \`${BQ_TABLE}\`
WHERE invoice.month = FORMAT_DATE('%Y%m', CURRENT_DATE())
GROUP BY service.description
ORDER BY mtd_spend DESC
`.trim();

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signingInput}.${signatureB64}`;
}

async function exchangeJwtForToken(jwt: string): Promise<string> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`OAuth token exchange failed: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const credentialsRaw = Deno.env.get('GOOGLE_BILLING_SERVICE_ACCOUNT');
    if (!credentialsRaw) {
      return new Response(JSON.stringify({ error: 'Billing credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceAccount = JSON.parse(credentialsRaw);
    const jwt = await getAccessToken(serviceAccount);
    const accessToken = await exchangeJwtForToken(jwt);

    // Query BigQuery billing export
    const bqUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`;
    const bqRes = await fetch(bqUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: MTD_QUERY,
        useLegacySql: false,
        timeoutMs: 30000,
      }),
    });

    if (!bqRes.ok) {
      const err = await bqRes.text();
      console.error('BigQuery error:', bqRes.status, err);
      return new Response(
        JSON.stringify({ error: `BigQuery error: ${bqRes.status}`, detail: err }),
        { status: bqRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const bqData = await bqRes.json();
    const rows: Array<{ f: Array<{ v: string }> }> = bqData.rows ?? [];

    const services = rows.map((row) => ({
      service: row.f[0]?.v ?? '',
      mtd_spend: Number(Number(row.f[1]?.v ?? 0).toFixed(4)),
    }));

    return new Response(
      JSON.stringify({ status: 'ok', services }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('get-billing-data error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
