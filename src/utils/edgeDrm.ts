import crypto from 'crypto';

export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const CHROMIUM_FULL_VERSION = '130.0.2849.68';
export const CHROMIUM_MAJOR_VERSION = '130';
export const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
export const WIN_EPOCH = 11644473600;

export function generateSecMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

export const generateSecMsGecV2 = generateSecMsGec;

export function generateMuid(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}
