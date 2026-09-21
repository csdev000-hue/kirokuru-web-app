import { beforeAll, afterAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "../helpers/postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
import { createOrganization } from "@/lib/services/organization-service";
import { createProject } from "@/lib/services/project-service";
import { createMeeting } from "@/lib/services/meeting-service";
let context:TestDatabase;let f:DatabaseFixture;
beforeAll(async()=>{context=await createTestDatabase();await migrate(context.db,{migrationsFolder:"drizzle/migrations"});f=await seedTestDatabase(context);},120000);
afterAll(async()=>{if(context)await context.close();},30000);
it.each([["organization_members","organizations"],["project_members","projects"],["meeting_participants","meetings"]] as const)("QA-TX %s insert failure rolls back parent %s",async(child,parent)=>{
 const count=async()=>Number((await context.db.execute<{n:string}>(sql`SELECT count(*) AS n FROM ${sql.identifier(parent)}`))[0].n);const before=await count();
 await context.db.execute(sql`CREATE FUNCTION qa_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_TX_FAILURE'; END; $$`);
 await context.db.execute(sql`CREATE TRIGGER qa_fail BEFORE INSERT ON ${sql.identifier(child)} FOR EACH ROW EXECUTE FUNCTION qa_fail()`);
 try{
  const run=()=>parent==="organizations"?createOrganization(f.ownerA.id,{name:"QA rollback"},context.db):parent==="projects"?createProject(f.ownerA.id,{organizationId:f.organizationA.id,name:"QA rollback"},context.db):createMeeting(f.ownerA.id,f.projectA.id,{title:"QA rollback",meetingDate:"2026-09-21T00:00:00Z"},context.db);
  await expect(run()).rejects.toThrow();expect(await count()).toBe(before);
 }finally{await context.db.execute(sql`DROP TRIGGER qa_fail ON ${sql.identifier(child)}`);await context.db.execute(sql`DROP FUNCTION qa_fail()`);}
});
