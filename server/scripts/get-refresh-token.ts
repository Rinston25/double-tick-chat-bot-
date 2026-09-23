/**
 * Exchanges a Zoho Self Client grant code for a refresh token.
 *
 * Usage:
 *   npm run zoho:token -- <grant_code>
 *
 * See docs/ZOHO_SETUP.md for how to create a Self Client and generate a
 * grant code. The grant code expires within minutes of being generated —
 * run this script immediately after copying it.
 *
 * Required scopes when generating the grant code:
 *   ZohoCRM.modules.ALL,ZohoCRM.settings.ALL
 */
import { requireZohoAuthEnv } from './lib/loadZohoEnv.js';

async function main() {
  const grantCode = process.argv[2];
  if (!grantCode) {
    console.error('\nUsage: npm run zoho:token -- <grant_code>\n');
    process.exit(1);
  }

  const { clientId, clientSecret, accountsUrl } = requireZohoAuthEnv();

  const url = new URL('/oauth/v2/token', accountsUrl);
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('code', grantCode);

  console.log(`\nExchanging grant code with ${accountsUrl} ...`);
  const res = await fetch(url.toString(), { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !body.refresh_token) {
    console.error('\nFailed to obtain a refresh token.');
    console.error(`  HTTP status: ${res.status}`);
    console.error(`  Error: ${body.error ?? 'unknown error'}`);
    console.error(
      '\nCommon causes: the grant code already expired (they last only a few minutes — ' +
        'generate a fresh one), the code was already used once, or the client id/secret in ' +
        '.env do not match the Self Client that generated the code.\n',
    );
    process.exit(1);
  }

  console.log('\nSuccess! Paste this into your .env file:\n');
  console.log(`ZOHO_REFRESH_TOKEN=${body.refresh_token}\n`);
  console.log('This refresh token does not expire unless revoked from the Zoho API console.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
