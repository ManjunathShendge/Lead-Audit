import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Reserved, private, loopback, link-local and cloud-metadata ranges that a crawl must never reach. */
export function isPrivateAddress(address: string): boolean {
  const ip = address
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version !== 6) return true;
  if (ip === '::' || ip === '::1') return true;
  const mapped = ip.match(/^::ffff:(.+)$/);
  if (mapped) return isIP(mapped[1]) === 4 ? isPrivateV4(mapped[1]) : true;
  const head = parseInt(ip.split(':')[0] || '0', 16);
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  return false;
}

function isPrivateV4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier grade NAT
  if (a === 169 && b === 254) return true; // link local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast and reserved
  return false;
}

export class UnsafeUrlError extends Error {}

/**
 * Accept only public http(s) origins. Resolves DNS and rejects when any answer is a private address,
 * so a public hostname pointing at internal infrastructure cannot be crawled.
 */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new UnsafeUrlError('Enter a valid website URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new UnsafeUrlError('Only http and https websites can be crawled.');
  if (url.username || url.password) throw new UnsafeUrlError('Remove credentials from the URL.');
  if (url.port && !['80', '443'].includes(url.port))
    throw new UnsafeUrlError('Only the standard web ports can be crawled.');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    throw new UnsafeUrlError('That host is not publicly reachable.');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError('That address is not publicly reachable.');
    return url;
  }
  if (!host.includes('.')) throw new UnsafeUrlError('Enter a full public domain.');

  let answers: { address: string }[];
  try {
    answers = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError('That domain could not be resolved.');
  }
  if (!answers.length) throw new UnsafeUrlError('That domain could not be resolved.');
  if (answers.some((a) => isPrivateAddress(a.address)))
    throw new UnsafeUrlError('That domain resolves to a private address.');
  return url;
}

export async function isPublicUrl(raw: string) {
  try {
    await assertPublicUrl(raw);
    return true;
  } catch {
    return false;
  }
}
