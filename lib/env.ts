import "server-only";
import { z } from "zod";
import { validateEnvironment } from "@/lib/utils/env-validation";

const required = z.string().trim().min(1);
const databaseSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});
const awsSchema = z.object({
  AWS_REGION: required,
  AWS_ACCESS_KEY_ID: required.optional(),
  AWS_SECRET_ACCESS_KEY: required.optional(),
}).refine((env) => Boolean(env.AWS_ACCESS_KEY_ID) === Boolean(env.AWS_SECRET_ACCESS_KEY), {
  path: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  message: "Configure both AWS credential fields or use the default provider chain.",
});
const bedrockSchema = awsSchema.safeExtend({ BEDROCK_MODEL_ID: required });
const s3Schema = awsSchema.safeExtend({ S3_BUCKET_NAME: required });
const liveKitSchema = z.object({
  LIVEKIT_URL: z.url({ protocol: /^(https?|wss?)$/ }),
  LIVEKIT_API_KEY: required,
  LIVEKIT_API_SECRET: required,
});
const serverSchema = awsSchema.safeExtend({
  ...databaseSchema.shape,
  ...liveKitSchema.shape,
  BEDROCK_MODEL_ID: required,
  S3_BUCKET_NAME: required,
  AUTH_SECRET: z.string().min(32),
  AUTH_TRUST_HOST: z.enum(["true", "false"]).transform((value) => value === "true"),
  NEXT_PUBLIC_APP_URL: z.url({ protocol: /^https?$/ }),
});

// Validate at runtime on first service use, never during module import/build.
export const getDatabaseEnv = () => validateEnvironment(databaseSchema, process.env);
export const getBedrockEnv = () => validateEnvironment(bedrockSchema, process.env);
export const getS3Env = () => validateEnvironment(s3Schema, process.env);
export const getLiveKitEnv = () => validateEnvironment(liveKitSchema, process.env);
export const getServerEnv = () => validateEnvironment(serverSchema, process.env);
