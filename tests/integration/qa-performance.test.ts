import { beforeAll, afterAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { createTestDatabase, type TestDatabase } from "../helpers/postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
import * as s from "@/lib/db/schema";
import { listTicketCandidates } from "@/lib/services/ticket-candidate-service";
import { listTickets } from "@/lib/services/ticket-service";
import { listMeetings } from "@/lib/services/meeting-service";
import { listTranscripts } from "@/lib/services/meeting-transcript-service";
let context: TestDatabase; let f: DatabaseFixture;
beforeAll(async () => {
 context = await createTestDatabase(); await migrate(context.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(context);
 await context.db.insert(s.tickets).values(Array.from({length:100},(_,i)=>({projectId:f.projectA.id,title:`QA Ticket ${i}`,createdBy:f.ownerA.id})));
 await context.db.insert(s.meetings).values(Array.from({length:100},(_,i)=>({projectId:f.projectA.id,title:`QA Meeting ${i}`,createdBy:f.ownerA.id,meetingDate:new Date("2026-09-01T00:00:00Z")})));
 await context.db.insert(s.meetingTranscripts).values(Array.from({length:499},(_,i)=>({meetingId:f.meetingA.id,speakerName:"QA",startedAt:String(i+1),text:`QA transcript ${i}`,sequenceNo:i+2})));
 await context.db.insert(s.ticketCandidates).values(Array.from({length:100},(_,i)=>({projectId:f.projectA.id,meetingId:f.meetingA.id,minutesId:f.minutes.id,title:`QA Candidate ${i}`,type:"task" as const,sourceTranscriptIds:[f.transcript.id]})));
},120000);
afterAll(async()=>{if(context) await context.close();},30000);
it("QA-PERF candidate list is bounded with constant query count (N+1 regression)",async()=>{
 let queries=0; const db=drizzle(context.db.$client,{schema:s,logger:{logQuery(){queries++;}}});
 const start=performance.now(); const page=await listTicketCandidates(f.ownerA.id,f.meetingA.id,{page:1,limit:25},db);
 expect(page).toHaveLength(25); expect(queries).toBeLessThanOrEqual(6);
 const next=await listTicketCandidates(f.ownerA.id,f.meetingA.id,{page:2,limit:25},db);
 expect(next.some((r)=>page.some((p)=>p.id===r.id))).toBe(false);
 console.info(JSON.stringify({qa:"candidates",fixture:101,pageSize:25,queries:queries/2,durationMs:performance.now()-start}));
 await expect(listTicketCandidates(f.ownerB.id,f.meetingA.id,{},db)).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
});
it("QA-PERF 100 tickets, 100 meetings, 500 transcripts bounded smoke",async()=>{
 const rows: Record<string,number>={};
 for(const [name,run] of [["tickets",()=>listTickets(f.ownerA.id,f.projectA.id,{limit:50},context.db)],["meetings",()=>listMeetings(f.ownerA.id,f.projectA.id,{limit:50},context.db)],["transcripts",()=>listTranscripts(f.ownerA.id,f.meetingA.id,{limit:100},context.db)]] as const){
  const start=performance.now();const result=await run();rows[name]=performance.now()-start;expect(result.data.length).toBeLessThanOrEqual(name==="transcripts"?100:50);expect(result.data.length).toBeGreaterThan(0);expect(rows[name]).toBeLessThan(2000);
 }
 console.info(JSON.stringify({qa:"performance-smoke",durationMs:rows,scope:"isolated local database, not production p95"}));
});
it("QA-PERF default candidate query does not grow with each row",async()=>{
 let queries=0;const db=drizzle(context.db.$client,{schema:s,logger:{logQuery(){queries++;}}});
 const rows=await listTicketCandidates(f.ownerA.id,f.meetingA.id,{},db);
 console.info(JSON.stringify({qa:"candidate-query-count",rows:rows.length,queries}));
 expect(queries).toBeLessThanOrEqual(6);expect(rows.length).toBeLessThanOrEqual(50);
});
