import crypto from 'node:crypto';

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const CHROMIUM_FULL_VERSION = '143.0.3650.75';
export const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
export const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
export const WIN_EPOCH = 11644473600;

export const WSS_URL =
  `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

let clockSkewSeconds = 0;

export function adjustClockSkewFromServerDate(serverDateHeader?: string): void {
  if (!serverDateHeader) return;
  const parsedMs = Date.parse(serverDateHeader);
  if (!Number.isNaN(parsedMs)) {
    const serverUnix = Math.floor(parsedMs / 1000);
    const localUnix = Math.floor(Date.now() / 1000);
    clockSkewSeconds = serverUnix - localUnix;
  }
}

export function generateSecMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000) + clockSkewSeconds + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

export function generateMuid(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

export function generateConnectId(): string {
  return crypto.randomBytes(16).toString('hex');
}
