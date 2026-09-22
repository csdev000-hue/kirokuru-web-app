import { z } from "zod";
export const providers = ["vercel", "neon", "bedrock", "s3", "awsMonitoring", "livekit", "other"] as const;
const amount = z.number().finite().nonnegative();
const observation = z.object({
  amountJpy: amount.nullable(), source: z.enum(["api", "manual", "estimate", "unknown"]),
  observedAt: z.iso.datetime().nullable(), evidence: z.string().max(200).nullable(),
}).strict();
export const budgetSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), limitJpy: z.literal(3000),
  warningRatio: z.number().gt(0).lt(1).default(0.5), criticalRatio: z.number().gt(0).lt(1).default(0.8),
  maxAgeHours: z.number().positive().max(168).default(24),
  vercelFixedJpy: amount.nullable(),
  // Vercel observation is variable cost only; fixed cost is added exactly once.
  usage: z.object(Object.fromEntries(providers.map(p => [p, observation])) as Record<typeof providers[number], typeof observation>).strict(),
}).strict().refine(v => v.warningRatio < v.criticalRatio);
export type BudgetInput = z.input<typeof budgetSchema>;
export type BudgetState = "Normal" | "Warning" | "Critical" | "Exceeded" | "Unknown";
export function checkBudget(input: unknown, now = new Date()) {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success || !Number.isFinite(now.getTime())) throw new Error("Invalid budget input (values omitted)");
  const c = parsed.data;
  const tier = (n: number): BudgetState => n >= c.limitJpy ? "Exceeded" : n >= c.limitJpy * c.criticalRatio ? "Critical" : n >= c.limitJpy * c.warningRatio ? "Warning" : "Normal";
  let knownTotalJpy = c.month === now.toISOString().slice(0, 7) ? c.vercelFixedJpy ?? 0 : 0; let incomplete = c.month !== now.toISOString().slice(0, 7); let estimated = false;
  const breakdown = providers.map(provider => {
    const o = c.usage[provider]; const age = o.observedAt ? now.getTime() - Date.parse(o.observedAt) : NaN;
    const unknown = c.month !== now.toISOString().slice(0, 7) || o.amountJpy === null || o.source === "unknown" || !o.evidence?.trim() || !Number.isFinite(age) || age < 0 || age > c.maxAgeHours * 3600000 || o.observedAt?.slice(0, 7) !== c.month || (provider === "vercel" && c.vercelFixedJpy === null);
    if (unknown) { incomplete = true; return { provider, state: "Unknown" as BudgetState, amountJpy: null, source: o.source }; }
    const n = o.amountJpy! + (provider === "vercel" ? c.vercelFixedJpy! : 0);
    knownTotalJpy += o.amountJpy!; estimated ||= o.source === "estimate";
    return { provider, state: tier(n), amountJpy: n, source: o.source };
  });
  // Known overrun must remain visible even when other providers are unavailable.
  const state: BudgetState = knownTotalJpy >= c.limitJpy ? "Exceeded" : incomplete ? "Unknown" : tier(knownTotalJpy);
  return { month: c.month, state, knownTotalJpy, incomplete, estimated, limitJpy: c.limitJpy, breakdown,
    allowPaidOperations: !incomplete && !estimated && (state === "Normal" || state === "Warning") };
}
// Provider-specific collectors can supply this shape without exposing tokens or billing responses.
export interface UsageReader { read(): Promise<unknown>; }
export async function collectUsage(reader?: UsageReader) {
  try { const parsed = observation.safeParse(await reader?.read()); if (parsed.success) return parsed.data; } catch { /* unavailable is unknown, never zero */ }
  return { amountJpy: null, source: "unknown" as const, observedAt: null, evidence: null };
}
export function estimateLiveKitCost(minutes: number, rateJpy: number, fixedJpy: number) {
  return amount.parse(minutes) * amount.parse(rateJpy) + amount.parse(fixedJpy);
}
