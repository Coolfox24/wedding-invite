import { resolve } from 'node:path';
import { isoDate } from './validation.ts';

export interface HostContact {
  name: string;
  phone: string;
  phoneDisplay: string;
  email: string;
}

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  allowedOrigins: string[];
  trustCloudflareProxy: boolean;
  rsvpClosesAt: string | null;
  ipLimit: number;
  tokenLimit: number;
  hostContacts: HostContact[];
}

function hostContacts(raw: string | undefined): HostContact[] {
  try {
    const contacts: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(contacts) || contacts.length > 10) throw new Error();
    return contacts.map((contact: unknown) => {
      if (contact === null || typeof contact !== 'object') throw new Error();
      const { name, phone, phoneDisplay, email } = contact as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim() || name.length > 100 ||
          typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone) ||
          typeof phoneDisplay !== 'string' || !phoneDisplay.trim() || phoneDisplay.length > 50 ||
          typeof email !== 'string' || email.length > 254 || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) throw new Error();
      return { name, phone, phoneDisplay, email };
    });
  } catch {
    // Configuration errors must not echo the private values into logs.
    throw new Error('HOST_CONTACTS_JSON must be a JSON array of contacts with name, phone (international format), phoneDisplay and email.');
  }
}

function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error('Invalid numeric configuration.');
  }
  return parsed;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((origin) => origin.trim());
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins, without trailing slashes.');
    }
  }
  if (env.TRUST_CLOUDFLARE_PROXY !== undefined && !['true', 'false'].includes(env.TRUST_CLOUDFLARE_PROXY)) {
    throw new Error('TRUST_CLOUDFLARE_PROXY must be true or false.');
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port: positiveInteger(env.PORT, 3001, 65535),
    databasePath: resolve(env.DATABASE_PATH ?? './data/rsvp.sqlite'),
    allowedOrigins,
    trustCloudflareProxy: env.TRUST_CLOUDFLARE_PROXY === 'true',
    rsvpClosesAt: env.RSVP_CLOSES_AT ? isoDate(env.RSVP_CLOSES_AT) : null,
    ipLimit: positiveInteger(env.RATE_LIMIT_PER_IP, 120, 10000),
    tokenLimit: positiveInteger(env.RATE_LIMIT_PER_INVITE, 30, 10000),
    hostContacts: hostContacts(env.HOST_CONTACTS_JSON),
  };
}
