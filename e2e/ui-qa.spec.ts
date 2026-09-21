import {expect,test} from "@playwright/test";
test("QA-UI keyboard, labels, loading lock and safe HTTP error states",async({page,context})=>{
 await context.addCookies([{name:"authjs.session-token",value:process.env.E2E_SESSION_TOKEN!,domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Lax"}]);
 const f=JSON.parse(process.env.E2E_FIXTURE_IDS!) as {project:string};
 await page.goto(`/projects/${f.project}/tickets/new`);
 const title=page.getByLabel("タイトル",{exact:true});await title.fill("Keyboard QA");await title.press("Tab");await expect(page.getByLabel("説明",{exact:true})).toBeFocused();
 expect(await page.locator("main input, main textarea, main select").evaluateAll(elements=>elements.every(e=>(e as HTMLInputElement).labels?.length||e.getAttribute("aria-label")))).toBe(true);
 for(const button of await page.locator("main button").all())await expect(button).toHaveAccessibleName(/.+/);
 let status=401;let calls=0;let release:(()=>void)|undefined;
 await page.route(`**/api/projects/${f.project}/tickets`,async route=>{calls++;await new Promise<void>(resolve=>{release=resolve;});await route.fulfill({status,contentType:"application/json",headers:{"retry-after":"2"},body:JSON.stringify({error:{code:"QA_ERROR",message:"安全なテストエラー"},requestId:"00000000-0000-4000-8000-000000000001"})});});
 for(const code of [401,403,404,409,422,429,500,502,504]){
  status=code;release=undefined;const before=calls;const button=page.getByRole("button",{name:"チケットを作成",exact:true});await button.focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"保存中…",exact:true})).toBeDisabled();await page.keyboard.press("Enter");await expect.poll(()=>calls).toBe(before+1);release!();
  await expect(page.getByRole("button",{name:"チケットを作成",exact:true})).toBeEnabled();await expect(page.locator("main [role=status]")).not.toBeEmpty();
  if(code>=500)await expect(page.locator("main [role=status]")).toContainText("Request ID");
  if(code===429)await expect(page.locator("main [role=status]")).toContainText("2秒後");
 }
});
