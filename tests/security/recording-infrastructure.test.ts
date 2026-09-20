import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("SEC-S3-01 infrastructure examples block public access and restrict CORS/IAM", async () => {
 const bucket = JSON.parse(await readFile("infra/aws/s3-private-bucket.json", "utf8")); expect(Object.values(bucket.PublicAccessBlockConfiguration)).toEqual([true, true, true, true]);
 const cors = JSON.parse(await readFile("infra/aws/s3-cors.json", "utf8")); expect(cors.CORSRules[0].AllowedOrigins).not.toContain("*"); expect(cors.CORSRules[0].AllowedHeaders).not.toContain("*");
 const policy = JSON.parse(await readFile("infra/aws/iam-recording-policy.json", "utf8")); const actions = policy.Statement.flatMap((s: { Action: string[] }) => s.Action); expect(actions).not.toContain("s3:*"); expect(actions).not.toContain("s3:PutBucketPolicy"); expect(actions).not.toContain("s3:PutObjectAcl");
});
it("SEC-S3-09 server-only SDK and no credentials/persistent URLs in Recording client", async () => {
 for (const path of ["lib/s3/client.ts", "lib/s3/recording-storage.ts", "lib/services/meeting-recording-service.ts"]) expect(await readFile(path, "utf8")).toContain('import "server-only"');
 const client = await readFile("components/meetings/recordings.tsx", "utf8"); for (const forbidden of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "@aws-sdk", "localStorage", "sessionStorage"]) expect(client).not.toContain(forbidden);
});
