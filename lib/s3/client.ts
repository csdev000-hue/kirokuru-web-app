import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { getS3Env } from "@/lib/env";

let client: S3Client | undefined;

export function getS3Client() {
  const env = getS3Env();
  return client ??= new S3Client({ region: env.AWS_REGION });
}
