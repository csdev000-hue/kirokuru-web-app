import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("SEC-LK-01/12 secrets remain server-only, tokens not stored by UI", async () => {
 for (const name of ["client", "provider", "config"]) expect(await readFile(`lib/livekit/${name}.ts`, "utf8")).toContain('import "server-only"');
 const ui = await readFile("components/meetings/live-room.tsx", "utf8");
 for (const word of ["LIVEKIT_API_SECRET", "LIVEKIT_API_KEY", "localStorage", "sessionStorage", "IndexedDB", "dangerouslySetInnerHTML"]) expect(ui).not.toContain(word);
 expect(ui).toContain("persistUserChoices={false}"); expect(ui).toContain("RoomAudioRenderer");
});
