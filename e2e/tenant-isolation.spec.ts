import { expect, test, type BrowserContext } from "@playwright/test";
const cookie=(token:string)=>({name:"authjs.session-token",value:token,domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Lax" as const});
const ids=()=>JSON.parse(process.env.E2E_FIXTURE_IDS!) as Record<string,string>;
const headers={origin:"http://127.0.0.1:3100"};
test("P0-11 two browser contexts: all resource ID tampering denied",async({browser,context})=>{
 const f=ids();await context.addCookies([cookie(process.env.E2E_SESSION_TOKEN!)]);
 const other=await browser.newContext({baseURL:"http://127.0.0.1:3100"});await other.addCookies([cookie(process.env.E2E_OTHER_SESSION_TOKEN!)]);
 try{
  for(const path of [`/api/organizations/${f.organization}`,`/api/projects/${f.project}`,`/api/tickets/${f.ticket}`,`/api/tickets/${f.ticket}/comments`,`/api/meetings/${f.meeting}`,`/api/meetings/${f.meeting}/transcripts`,`/api/minutes/${f.minutes}`,`/api/ticket-candidates/${f.candidate}`,`/api/recordings/${f.recording}`]){
   expect((await context.request.get(path)).status()).toBe(200);const response=await other.request.get(path);expect(response.status()).toBe(404);expect(JSON.stringify(await response.json())).not.toContain("Organization A");
  }
  expect((await other.request.post(`/api/meetings/${f.meeting}/token`,{headers,data:{}})).status()).toBe(404);
  const page=await other.newPage();for(const path of [`/projects/${f.project}`,`/tickets/${f.ticket}`,`/meetings/${f.meeting}`]){await page.goto(path);await expect(page.getByRole("heading",{name:"404 対象が見つかりません"})).toBeVisible();}
 }finally{await other.close();}
});
test("owner/member/viewer boundaries via independent sessions",async({browser})=>{
 const f=ids();const sessions:BrowserContext[]=[];
 try{for(const role of ["MEMBER","VIEWER"]){const ctx=await browser.newContext({baseURL:"http://127.0.0.1:3100"});sessions.push(ctx);await ctx.addCookies([cookie(process.env[`E2E_${role}_SESSION_TOKEN`]!)]);
  expect((await ctx.request.patch(`/api/projects/${f.project}`,{headers,data:{name:"forbidden"}})).status()).toBe(403);
  expect((await ctx.request.patch(`/api/organizations/${f.organization}`,{headers,data:{name:"forbidden"}})).status()).toBe(403);
  if(role==="VIEWER")for(const [path,method,data] of [
   [`/api/projects/${f.project}/tickets`,"POST",{title:"x",type:"task"}],
   [`/api/projects/${f.project}/meetings`,"POST",{title:"x",meetingDate:"2026-09-21T00:00:00Z"}],
   [`/api/minutes/${f.minutes}/approve`,"POST",{}],
   [`/api/ticket-candidates/${f.candidate}/approve`,"POST",{}],
   [`/api/ticket-candidates/${f.candidate}/register`,"POST",{}],
   [`/api/meetings/${f.meeting}/recordings/upload-url`,"POST",{contentType:"audio/webm",fileSize:100}],
   [`/api/meetings/${f.meeting}/start`,"POST",{}],
   [`/api/meetings/${f.meeting}/end`,"POST",{}],
  ] as const)expect((await ctx.request.fetch(path,{method,headers,data})).status()).toBe(403);
  else expect((await ctx.request.post(`/api/projects/${f.project}/tickets`,{headers,data:{title:"Member allowed",type:"task"}})).status()).toBe(201);
 }}finally{await Promise.all(sessions.map(s=>s.close()));}
});
test("Rate limit real HTTP response: 429, Retry-After, requestId",async({context})=>{
 await context.addCookies([cookie(process.env.E2E_RATE_SESSION_TOKEN!)]);const f=ids();
 for(const path of ["/api/ai/generate-minutes","/api/ai/generate-tickets",`/api/meetings/${f.meeting}/recordings/upload-url`,`/api/recordings/${f.recording}/download-url`,`/api/meetings/${f.meeting}/token`]){
 const response=await context.request.post(path,{headers,data:{}});expect(response.status()).toBe(429);expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);const body=await response.json();expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");expect(body.requestId).toBe(response.headers()["x-request-id"]);
 }
});
