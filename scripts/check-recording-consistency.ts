/** Local-only, read-only checker. No .env loading, Production connections or deletion. */
import { readFile } from "node:fs/promises";
import { checkRecordingConsistency, type ConsistencyRow } from "../lib/s3/consistency";
import { z } from "zod";
const row = z.object({ id: z.uuid(), s3Key: z.string(), status: z.string(), contentType: z.string(), fileSize: z.string().regex(/^\d+$/).nullable(), createdAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable(), uploadExpiresAt: z.iso.datetime().nullable() }).strict();
const snapshot = z.object({ recordings: z.array(row), objects: z.array(z.object({ key: z.string(), contentType: z.string(), fileSize: z.number().int().nonnegative() }).strict()) }).strict();
// Export DB metadata and S3 Inventory through approved operational tooling; this tool compares offline.
const file = process.argv[2]; if (!file) throw new Error("Usage: npx tsx scripts/check-recording-consistency.ts <local-inventory.json>");
const data = snapshot.parse(JSON.parse(await readFile(file, "utf8")));
const rows: ConsistencyRow[] = data.recordings.map((r) => ({ ...r, fileSize: r.fileSize === null ? null : BigInt(r.fileSize), createdAt: new Date(r.createdAt), deletedAt: r.deletedAt ? new Date(r.deletedAt) : null, uploadExpiresAt: r.uploadExpiresAt ? new Date(r.uploadExpiresAt) : null }));
const objects = new Map(data.objects.map((o) => [o.key, o]));
console.log(JSON.stringify(await checkRecordingConsistency(rows, { headObject: async (key) => objects.get(key) ?? null }, [...objects.keys()]), null, 2));
