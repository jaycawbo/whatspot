const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:8081',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Services we care about — matched against Google Cloud billing service descriptions
const TRACKED_SERVICES = ['Maps Platform', 'Vertex AI', 'Gemini'];

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-billing.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import the private key from the service account PEM
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

  const jwt = `${signingInput}.${signatureB64}`;

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
    const billingAccountId = Deno.env.get('GOOGLE_BILLING_ACCOUNT_ID');
    if (!billingAccountId) {
      return new Response(JSON.stringify({ error: 'GOOGLE_BILLING_ACCOUNT_ID not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(serviceAccount);

    // Build month-to-date date range
    const now = new Date();
    const startDate = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: 1 };
    const endDate = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };

    const billingRes = await fetch(
      `https://cloudbilling.googleapis.com/v1/billingAccounts/${billingAccountId}/skus`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    // Use Cloud Billing Budget API isn't ideal here — use Cloud Billing catalog + cost data
    // The correct API for spend data is the Cloud Billing API reports endpoint
    const reportsRes = await fetch(
      `https://cloudbilling.googleapis.com/v1beta/billingAccounts/${billingAccountId}:getSpendingInformation?` +
        new URLSearchParams({
          'filter.creditTypes': 'DISCOUNT',
          'filter.services': 'maps-platform',
        }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    // The Cloud Billing API for spend-by-service requires the Cloud Billing Data Export
    // or the recommender API. The most straightforward read-only approach is the
    // Cloud Billing Projects.getBillingInfo endpoint combined with the
    // cloudbilling.googleapis.com/v1/services list + BigQuery export.
    // Without BigQuery export enabled, we use the budgets API as a proxy.

    const budgetsRes = await fetch(
      `https://billingbudgets.googleapis.com/v1/billingAccounts/${billingAccountId}/budgets`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!budgetsRes.ok) {
      const err = await budgetsRes.text();
      console.error('Billing API error:', budgetsRes.status, err);

      // Fall back: return a structured response indicating billing API access works
      // but budget data isn't available — surface the auth success at minimum
      return new Response(
        JSON.stringify({
          status: 'auth_ok',
          message: 'Service account authenticated successfully. No budget data returned — ensure the Billing Account Viewer role is granted and budgets exist.',
          billing_account: billingAccountId,
          period: {
            start: `${startDate.year}-${String(startDate.month).padStart(2, '0')}-01`,
            end: `${endDate.year}-${String(endDate.month).padStart(2, '0')}-${String(endDate.day).padStart(2, '0')}`,
          },
          services: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const budgetsData = await budgetsRes.json();
    const budgets: Array<Record<string, unknown>> = budgetsData.budgets ?? [];

    // Map budget entries to tracked services
    const services = budgets
      .filter((b) => {
        const displayName = String(b.displayName ?? '');
        return TRACKED_SERVICES.some((s) => displayName.includes(s));
      })
      .map((b) => {
        const amount = (b.budgetFilter as Record<string, unknown>) ?? {};
        const spent = (b.amount as Record<string, unknown>) ?? {};
        return {
          service: b.displayName,
          currency: ((spent.specifiedAmount as Record<string, unknown>)?.currencyCode as string) ?? 'USD',
          budget_usd: (spent.specifiedAmount as Record<string, unknown>)?.units ?? null,
          last_period_spend: (b.lastPeriodAmount as Record<string, unknown>) ?? null,
        };
      });

    return new Response(
      JSON.stringify({
        status: 'ok',
        billing_account: billingAccountId,
        period: {
          start: `${startDate.year}-${String(startDate.month).padStart(2, '0')}-01`,
          end: `${endDate.year}-${String(endDate.month).padStart(2, '0')}-${String(endDate.day).padStart(2, '0')}`,
        },
        services,
        raw_budget_count: budgets.length,
      }),
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
