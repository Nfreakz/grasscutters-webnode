const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

const claimedIdPattern =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function buildSteamLoginUrl(input: {
  realm: string;
  returnTo: string;
}): string {
  const url = new URL(STEAM_OPENID_ENDPOINT);

  url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', input.returnTo);
  url.searchParams.set('openid.realm', input.realm);
  url.searchParams.set(
    'openid.identity',
    'http://specs.openid.net/auth/2.0/identifier_select'
  );
  url.searchParams.set(
    'openid.claimed_id',
    'http://specs.openid.net/auth/2.0/identifier_select'
  );

  return url.toString();
}

export async function verifySteamOpenId(
  callbackUrl: URL,
  expectedReturnTo: string
): Promise<string | null> {
  const mode = callbackUrl.searchParams.get('openid.mode');
  const claimedId = callbackUrl.searchParams.get('openid.claimed_id') ?? '';
  const returnTo = callbackUrl.searchParams.get('openid.return_to') ?? '';

  if (mode !== 'id_res' || returnTo !== expectedReturnTo) {
    return null;
  }

  const match = claimedId.match(claimedIdPattern);
  if (!match) return null;

  const verification = new URLSearchParams();

  for (const [key, value] of callbackUrl.searchParams.entries()) {
    if (key.startsWith('openid.')) {
      verification.set(key, value);
    }
  }

  verification.set('openid.mode', 'check_authentication');

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/plain'
    },
    body: verification.toString(),
    redirect: 'error'
  });

  if (!response.ok) return null;

  const result = await response.text();
  const valid = result
    .split(/\r?\n/)
    .some((line) => line.trim().toLowerCase() === 'is_valid:true');

  return valid ? match[1] : null;
}
