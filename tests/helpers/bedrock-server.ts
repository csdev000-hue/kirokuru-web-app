import { createServer } from "node:http2";
import { z } from "zod";
const promptSchema = z.object({ meeting: z.object({ id: z.string() }), transcripts: z.array(z.object({ id: z.string(), started_at: z.number(), ended_at: z.number().nullable() })) });
/** Loopback-only Converse fixture; never contacts AWS. */
export async function startBedrockServer() {
 const server = createServer(async (req, res) => {
  try {
   const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
   const body = JSON.parse(Buffer.concat(chunks).toString()); const prompt = promptSchema.parse(JSON.parse(body.messages[0].content[0].text)); const t = prompt.transcripts[0];
   const item = { title: "API仕様の更新", detail: "API仕様を確認して更新する。", source_evidence: [{ transcript_id: t.id, started_at: t.started_at, ended_at: t.ended_at }] };
   const data = { schema_version: "1.0", language: "ja", meeting_id: prompt.meeting.id, summary: "API仕様の更新を確認した。", decisions: [item], action_items: [{ ...item, assignee: null, due_date: null }], issues: [], pending_items: [] };
   res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ output: { message: { role: "assistant", content: [{ text: JSON.stringify(data) }] } }, stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 }, metrics: { latencyMs: 1 } }));
  } catch { res.writeHead(400); res.end('{}'); }
 });
 await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
 const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing local mock address");
 return { endpoint: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
