import { expect, it } from "vitest";
import { budgetSchema, checkBudget, collectUsage, estimateLiveKitCost, providers } from "../../infra/budget/guard";
const now = new Date("2026-09-22T00:00:00Z");
function input(total: number) {
  return budgetSchema.parse({ month: "2026-09", limitJpy: 3000, vercelFixedJpy: total, usage: Object.fromEntries(providers.map(p => [p, { amountJpy: 0, source: "manual", observedAt: now.toISOString(), evidence: "fixture-only" }])) });
}
it.each([[0,"Normal"],[1499,"Normal"],[1500,"Warning"],[2399,"Warning"],[2400,"Critical"],[2999,"Critical"],[3000,"Exceeded"],[4000,"Exceeded"]])("threshold %s => %s", (n,state) => { expect(checkBudget(input(Number(n)),now).state).toBe(state); });
it("unavailable Neon is Unknown, never free", async () => { const c=input(0); c.usage.neon=await collectUsage({read:async()=>{throw new Error("secret");}});const r=checkBudget(c,now);expect(r.state).toBe("Unknown");expect(r.allowPaidOperations).toBe(false);expect(JSON.stringify(r)).not.toContain("secret"); });
it("missing fixed fee and missing provider fail closed", () => {expect(checkBudget({...input(0),vercelFixedJpy:null},now).state).toBe("Unknown");expect(()=>checkBudget({...input(0),usage:{}},now)).toThrow();});
it.each(["2026-09-20T00:00:00Z","2026-09-23T00:00:00Z"])("stale/future observation %s is Unknown", observedAt => {const c=input(0);c.usage.neon.observedAt=observedAt;expect(checkBudget(c,now).state).toBe("Unknown");});
it("old accounting month is Unknown",()=>{expect(checkBudget({...input(0),month:"2026-08"},now).state).toBe("Unknown");});
it("known fixed overrun persists despite missing variable usage",()=>{const c=input(4000);c.usage.vercel.source="unknown";const r=checkBudget(c,now);expect(r.state).toBe("Exceeded");expect(r.incomplete).toBe(true);});
it("estimated LiveKit is explicit and cannot authorize paid actions",()=>{const c=input(0);c.usage.livekit={amountJpy:estimateLiveKitCost(20,2,10),source:"estimate",observedAt:now.toISOString(),evidence:"fixture"};const r=checkBudget(c,now);expect(r.knownTotalJpy).toBe(50);expect(r.estimated).toBe(true);expect(r.allowPaidOperations).toBe(false);});
it("invalid and missing API usage remain Unknown",async()=>{expect((await collectUsage()).source).toBe("unknown");expect((await collectUsage({read:async()=>({amountJpy:-1})})).source).toBe("unknown");});
it("fixed/variable providers summed once and critical prevents paid actions",()=>{const c=input(2000);c.usage.neon.amountJpy=500;c.usage.vercel.amountJpy=100;const r=checkBudget(c,now);expect(r.knownTotalJpy).toBe(2600);expect(r.allowPaidOperations).toBe(false);});
