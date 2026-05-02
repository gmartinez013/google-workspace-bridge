import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly'
];

const DATA_DIR = path.join(process.cwd(), '.local');
const TOKEN_PATH = path.join(DATA_DIR, 'token.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8787/oauth2callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function prompt(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function authenticate() {
  ensureDataDir();
  const oauth2Client = getOAuthClient();

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\nOpen this URL in your browser and authorize:\n');
  console.log(authUrl);
  console.log('');

  const code = await prompt('Paste authorization code here: ');
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Saved token to ${TOKEN_PATH}`);
  return oauth2Client;
}

async function gmailSearch(auth: any, query: string, max = 10) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: max });
  const msgs = res.data.messages || [];
  for (const m of msgs) {
    const msg = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
    const headers = Object.fromEntries((msg.data.payload?.headers || []).map(h => [h.name!, h.value || '']));
    console.log(`${m.id}\t${headers.Date || ''}\t${headers.From || ''}\t${headers.Subject || ''}`);
  }
}

async function gmailGet(auth: any, id: string) {
  const gmail = google.gmail({ version: 'v1', auth });
  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  console.log(JSON.stringify(msg.data, null, 2));
}

async function calendarList(auth: any, from: string, to: string) {
  const cal = google.calendar({ version: 'v3', auth });
  const res = await cal.events.list({ calendarId: 'primary', timeMin: from, timeMax: to, singleEvents: true, orderBy: 'startTime' });
  for (const e of res.data.items || []) {
    console.log(`${e.id}\t${e.start?.dateTime || e.start?.date}\t${e.summary || ''}`);
  }
}

async function calendarCreate(auth: any, summary: string, from: string, to: string, description?: string) {
  const cal = google.calendar({ version: 'v3', auth });
  const res = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      description,
      start: { dateTime: from },
      end: { dateTime: to }
    }
  });
  console.log(res.data.htmlLink || res.data.id);
}

async function calendarUpdate(auth: any, eventId: string, description: string) {
  const cal = google.calendar({ version: 'v3', auth });
  const existing = await cal.events.get({ calendarId: 'primary', eventId });
  const body = existing.data;
  body.description = description;
  const res = await cal.events.update({ calendarId: 'primary', eventId, requestBody: body });
  console.log(res.data.htmlLink || res.data.id);
}

async function driveSearch(auth: any, query: string, max = 10) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({ q: `name contains '${query}' and trashed = false`, pageSize: max, fields: 'files(id,name,mimeType,modifiedTime)' });
  for (const f of res.data.files || []) {
    console.log(`${f.id}\t${f.name}\t${f.mimeType}\t${f.modifiedTime}`);
  }
}

async function driveExport(auth: any, fileId: string, mimeType: string, out: string) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.export({ fileId, mimeType }, { responseType: 'arraybuffer' });
  fs.writeFileSync(out, Buffer.from(res.data as ArrayBuffer));
  console.log(`Wrote ${out}`);
}

async function main() {
  const [cmd, subcmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    console.log('Usage: auth | gmail search|get | calendar list|create|update | drive search|export');
    process.exit(0);
  }

  const auth = await authenticate();

  if (cmd === 'auth') return;
  if (cmd === 'gmail' && subcmd === 'search') return gmailSearch(auth, rest[0] || 'in:inbox newer_than:7d', Number(rest[1] || 10));
  if (cmd === 'gmail' && subcmd === 'get') return gmailGet(auth, rest[0]);
  if (cmd === 'calendar' && subcmd === 'list') return calendarList(auth, rest[0], rest[1]);
  if (cmd === 'calendar' && subcmd === 'create') return calendarCreate(auth, rest[0], rest[1], rest[2], rest[3]);
  if (cmd === 'calendar' && subcmd === 'update') return calendarUpdate(auth, rest[0], rest.slice(1).join(' '));
  if (cmd === 'drive' && subcmd === 'search') return driveSearch(auth, rest[0] || 'resume', Number(rest[1] || 10));
  if (cmd === 'drive' && subcmd === 'export') return driveExport(auth, rest[0], rest[1], rest[2]);

  throw new Error(`Unknown command: ${cmd} ${subcmd || ''}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
