import type { RecordingStorage } from "./recording-storage";
export type ConsistencyRow = { id: string; s3Key: string; status: string; fileSize: bigint | null; contentType: string; createdAt: Date; deletedAt: Date | null; uploadExpiresAt: Date | null };
/** Read-only reconciliation. Inventory includes tombstones; output never includes keys/URLs. */
export async function checkRecordingConsistency(rows: ConsistencyRow[], storage: Pick<RecordingStorage, "headObject">, objectKeys: string[], now = new Date()) {
 const findings: { recordingId: string; issue: string }[] = [];
 let totalBytes = 0; let storedCount = 0; let staleUploading = 0;
 for (const row of rows) {
  const object = await storage.headObject(row.s3Key);
  if (row.status === "uploading" && !row.deletedAt && now.getTime() - row.createdAt.getTime() > 86400000) { staleUploading++; findings.push({ recordingId: row.id, issue: "stale_uploading" }); }
  if (!object && !row.deletedAt && ["uploaded", "processing", "completed"].includes(row.status)) findings.push({ recordingId: row.id, issue: "missing_object" });
  if (object) {
   storedCount++; totalBytes += object.fileSize ?? 0;
   if (row.deletedAt) findings.push({ recordingId: row.id, issue: row.uploadExpiresAt && row.uploadExpiresAt > now ? "deleted_object_live_put_url" : "deleted_object_cleanup_required" });
   else if (row.status === "failed") findings.push({ recordingId: row.id, issue: "failed_object_quarantined" });
   else if (object.contentType !== row.contentType || BigInt(object.fileSize ?? -1) !== row.fileSize) findings.push({ recordingId: row.id, issue: "metadata_mismatch" });
  }
 }
 const known = new Set(rows.map((r) => r.s3Key));
 return { recordingCount: rows.filter((r) => !r.deletedAt).length, totalBytes, averageFileSize: storedCount ? Math.round(totalBytes / storedCount) : 0, staleUploading, orphanObjectCount: objectKeys.filter((key) => !known.has(key)).length, findings };
}
