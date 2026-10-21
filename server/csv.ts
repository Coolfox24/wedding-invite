import type { InviteInput } from './validation.ts';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const input = text.replace(/^\uFEFF/, '');
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => { finishField(); if (row.some((cell) => cell.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',' ) finishField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('Malformed CSV quoting.');
      field += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field !== '' || row.length || closed) finishRow();
  return rows;
}

export function invitesFromCsv(text: string): InviteInput[] {
  const [header, ...rows] = parseCsv(text);
  const columns = ['invitation_key', 'invitation_label', 'guest_name', 'is_plus_one', 'expires_at'];
  if (!header || header.join(',') !== columns.join(',')) throw new Error(`CSV header must be: ${columns.join(',')}`);
  if (rows.length < 1 || rows.length > 10000) throw new Error('CSV must contain 1–10,000 guest rows.');
  const invitations = new Map<string, InviteInput>();
  for (const row of rows) {
    if (row.length !== columns.length) throw new Error('Each CSV row must have five columns.');
    const [key, label, name, plusOne, expires] = row.map((cell) => cell.trim());
    if (!['', 'true', 'false'].includes(plusOne)) throw new Error('is_plus_one must be true, false, or empty.');
    let invite = invitations.get(key);
    if (!invite) {
      invite = { key, label, guests: [], expiresAt: expires || null };
      invitations.set(key, invite);
    }
    if (invite.label !== label || invite.expiresAt !== (expires || null)) throw new Error(`Inconsistent label or expiry for invitation ${key}.`);
    invite.guests.push({ name, isPlusOne: plusOne === 'true' });
  }
  return [...invitations.values()];
}

export function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map((value) => {
    let text = value === null || value === undefined ? '' : String(value);
    // Prevent spreadsheet formula execution when the owner opens a guest-data export.
    if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n') + '\r\n';
}
