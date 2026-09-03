// Shared Google Sheets access for the bridge scripts.
// Auth: a service account JSON in GOOGLE_SERVICE_ACCOUNT_JSON (share both
// sheets with the service account's email as Editor).
import { google } from "googleapis";

export function sheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Set GOOGLE_SERVICE_ACCOUNT_JSON (contents of the service-account key file)");
  const creds = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

export async function readTab(sheetId: string, tab: string): Promise<string[][]> {
  const s = sheetsClient();
  const r = await s.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab.replace(/'/g, "''")}'` });
  return (r.data.values || []) as string[][];
}

export async function listTabs(sheetId: string): Promise<string[]> {
  const s = sheetsClient();
  const r = await s.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  return (r.data.sheets || []).map((x) => x.properties!.title!);
}

export async function writeTab(sheetId: string, tab: string, rows: (string | number | null)[][]) {
  const s = sheetsClient();
  const tabs = await listTabs(sheetId);
  if (!tabs.includes(tab)) await s.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } });
  await s.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `'${tab}'` });
  await s.spreadsheets.values.update({ spreadsheetId: sheetId, range: `'${tab}'!A1`, valueInputOption: "RAW", requestBody: { values: rows } });
}

export const brandKey = (name: string) => name.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
