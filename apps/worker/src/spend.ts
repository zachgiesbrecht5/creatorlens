// Model spend meter and daily budget. Every model call records its cost in
// model_spend; optional work (discovery, reclassification, weekly agents,
// why-then) checks the budget first. Work a person is waiting on
// (neighborhoods they clicked, research they asked for) always runs.
import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_BUDGET = Number(process.env.MODEL_DAILY_BUDGET_USD || 8);
// per-million-token prices (input, output) + $0.01 per web search
const PRICE: Record<string, [number, number]> = { "claude-haiku-4-5": [1, 5], "claude-sonnet-4-5": [3, 15] };

export function costOf(model: string, usage: any): number {
  const [pin, pout] = PRICE[model] || PRICE["claude-haiku-4-5"];
  const input = (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) * 0.1 + (usage?.cache_creation_input_tokens || 0) * 1.25;
  const searches = usage?.server_tool_use?.web_search_requests || 0;
  return +((input / 1e6) * pin + ((usage?.output_tokens || 0) / 1e6) * pout + searches * 0.01).toFixed(4);
}

export async function recordSpend(sb: SupabaseClient, job: string, model: string, usage: any, ref?: string): Promise<number> {
  const cost = costOf(model, usage);
  await sb.from("model_spend").insert({ job, model, cost_usd: cost, input_tokens: usage?.input_tokens || 0, output_tokens: usage?.output_tokens || 0, searches: usage?.server_tool_use?.web_search_requests || 0, ref: ref || null }).then(() => {});
  return cost;
}

export async function spentToday(sb: SupabaseClient): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from("model_spend").select("cost_usd").gte("created_at", `${day}T00:00:00Z`);
  return +((data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0)).toFixed(2);
}

/** True when optional work may run. Reserves the last 20% of the day's budget for what people click. */
export async function optionalBudgetOpen(sb: SupabaseClient): Promise<boolean> {
  if (modelPaused() || errorPaused()) return false;
  const spent = await spentToday(sb);
  return spent < DAILY_BUDGET * 0.8;
}

// Circuit breaker: after a billing refusal, pause optional model work for an hour
// instead of retrying every few seconds. Clicks still try (they fail fast and say why).
let pausedUntil = 0;
export function noteModelError(e: unknown): boolean {
  const msg = String((e as any)?.message || e || "");
  if (/credit balance|usage limits|billing/i.test(msg)) {
    if (Date.now() > pausedUntil) console.log(new Date().toISOString(), "[spend] Anthropic refused (billing); pausing optional model work for 60 min");
    pausedUntil = Date.now() + 60 * 60e3;
    return true;
  }
  return false;
}
export function modelPaused(): boolean { return Date.now() < pausedUntil; }

/** Strip lone UTF-16 surrogates (half-cut emoji) and null bytes; they make a request body invalid JSON. */
export function cleanForModel(v: string): string {
  return String(v || "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "").replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1").replace(/\u0000/g, "");
}
// Any repeated model error (not just billing) backs off for 10 minutes so an idle loop can't hammer the API.
let errorPausedUntil = 0;
export function noteAnyModelError(): void { errorPausedUntil = Date.now() + 10 * 60e3; }
export function errorPaused(): boolean { return Date.now() < errorPausedUntil; }
