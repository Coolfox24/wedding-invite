import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Config } from './config.ts';
import { Store, hashToken } from './database.ts';
import { HttpError } from './errors.ts';
import { RateLimiter } from './rate-limit.ts';

const bodyLimit = 16 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function bearerToken(req: IncomingMessage): string {
  const value = req.headers.authorization;
  const match = typeof value === 'string' ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value) : null;
  if (!match) throw new HttpError(401, 'invalid_invitation', 'An active invitation token is required.');
  return match[1];
}

async function jsonBody(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) {
    req.resume();
    throw new HttpError(415, 'unsupported_media_type', 'Use application/json.');
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    req.resume();
    throw new HttpError(415, 'unsupported_encoding', 'Compressed request bodies are not supported.');
  }
  if (Number(req.headers['content-length'] ?? 0) > bodyLimit) {
    req.resume();
    throw new HttpError(413, 'body_too_large', 'Request body exceeds 16 KiB.');
  }
  const raw = await new Promise<string>((resolveBody, rejectBody) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > bodyLimit) {
        chunks.length = 0;
        if (!tooLarge) rejectBody(new HttpError(413, 'body_too_large', 'Request body exceeds 16 KiB.'));
        tooLarge = true;
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.once('end', () => { if (!tooLarge) resolveBody(Buffer.concat(chunks).toString('utf8')); });
    req.once('error', rejectBody);
    req.once('aborted', () => rejectBody(new HttpError(400, 'invalid_body', 'Request was interrupted.')));
  });
  try { return JSON.parse(raw) as unknown; }
  catch { throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.'); }
}

function cors(req: IncomingMessage, res: ServerResponse, allowed: string[]) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin !== undefined) {
    if (!allowed.includes(origin)) throw new HttpError(403, 'origin_not_allowed', 'This origin is not allowed.');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  }
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, directory: string): Promise<boolean> {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new HttpError(400, 'invalid_path', 'Invalid URL path.'); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some((part) => part.startsWith('.'))) {
    return false;
  }
  const root = await realpath(directory);
  let file = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  const inside = (path: string) => {
    const suffix = relative(root, path);
    return suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
  };
  if (!inside(file)) return false;
  try {
    file = await realpath(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Allow frontend routes, but don't return HTML for missing assets.
    if (extname(decoded)) return false;
    file = await realpath(resolve(root, 'index.html'));
  }
  if (!inside(file)) return false;
  const info = await stat(file);
  if (!info.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'public, max-age=0, must-revalidate',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

export function createApp(store: Store, config: Config, options: { staticDirectory?: string; now?: () => number } = {}) {
  const ips = new RateLimiter(config.ipLimit);
  const tokens = new RateLimiter(config.tokenLimit);
  const now = options.now ?? Date.now;
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/health/live' && req.method === 'GET') return send(res, 200, { status: 'ok' });
      if (url.pathname === '/health/ready' && req.method === 'GET') {
        store.db.prepare('SELECT 1').get();
        return send(res, 200, { status: 'ok' });
      }
      if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') {
        if (options.staticDirectory && await serveStatic(req, res, url.pathname, options.staticDirectory)) return;
        throw new HttpError(404, 'not_found', 'Endpoint not found.');
      }
      cors(req, res, config.allowedOrigins);
      const forwardedIp = req.headers['cf-connecting-ip'];
      let ip = req.socket.remoteAddress ?? 'unknown';
      if (config.trustCloudflareProxy) {
        if (typeof forwardedIp !== 'string' || !isIP(forwardedIp)) {
          throw new HttpError(400, 'invalid_proxy', 'A valid Cloudflare client address is required.');
        }
        ip = forwardedIp;
      }
      const ipRetry = ips.consume(ip, now());
      if (ipRetry) {
        res.setHeader('Retry-After', ipRetry);
        throw new HttpError(429, 'rate_limited', 'Too many requests. Please try again shortly.');
      }
      // API tokens belong in headers, not URLs (which are often logged).
      if (url.search) throw new HttpError(400, 'unexpected_query', 'API endpoints do not accept query parameters.');
      const allowedMethod = url.pathname === '/api/invitation' ? 'GET' : url.pathname === '/api/rsvp' ? 'PUT' : null;
      if (!allowedMethod) throw new HttpError(404, 'not_found', 'Endpoint not found.');
      if (req.method === 'OPTIONS') {
        const requestedHeaders = (req.headers['access-control-request-headers'] ?? '').toString().toLowerCase().split(',').map((header) => header.trim()).filter(Boolean);
        if (!req.headers.origin || req.headers['access-control-request-method'] !== allowedMethod || requestedHeaders.some((header) => !['authorization', 'content-type'].includes(header))) {
          throw new HttpError(403, 'invalid_preflight', 'This cross-origin request is not allowed.');
        }
        res.setHeader('Access-Control-Allow-Methods', allowedMethod);
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== allowedMethod) {
        res.setHeader('Allow', `${allowedMethod}, OPTIONS`);
        throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
      }
      const token = bearerToken(req);
      // Only allocate per-invitation buckets after validating a real token.
      const invitation = store.authenticate(token, now());
      const tokenRetry = tokens.consume(hashToken(token), now());
      if (tokenRetry) {
        res.setHeader('Retry-After', tokenRetry);
        throw new HttpError(429, 'rate_limited', 'Too many requests. Please try again shortly.');
      }
      const closed = config.rsvpClosesAt !== null && Date.parse(config.rsvpClosesAt) <= now();
      if (req.method === 'GET') {
        return send(res, 200, { ...store.view(invitation), rsvpClosesAt: config.rsvpClosesAt, canRespond: !closed });
      }
      if (closed) throw new HttpError(403, 'rsvp_closed', 'The RSVP deadline has passed. Please contact the hosts.');
      const body = await jsonBody(req);
      // Deadlines and token expiry must also be checked after a slow body upload.
      if (config.rsvpClosesAt && Date.parse(config.rsvpClosesAt) <= now()) {
        throw new HttpError(403, 'rsvp_closed', 'The RSVP deadline has passed. Please contact the hosts.');
      }
      send(res, 200, { ...store.save(token, body, now()), rsvpClosesAt: config.rsvpClosesAt, canRespond: true });
    })().catch((error: unknown) => {
      req.resume();
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof HttpError) {
        if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
        send(res, error.status, { error: { code: error.code, message: error.message } });
      } else {
        // Do not log request headers/URLs, SQL parameters, tokens or guest data.
        console.error('RSVP request failed. Check application and database availability.');
        send(res, 500, { error: { code: 'internal_error', message: 'Unable to process the request. Please try again.' } });
      }
    });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  return server;
}
