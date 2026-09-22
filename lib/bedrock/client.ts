import "server-only";
import { nonprodAwsCredentials } from "@/lib/aws/credentials";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { getBedrockEnv } from "@/lib/env";
import type { GenerateStructuredOptions } from "./types";

let client: BedrockRuntimeClient | undefined;

export function getBedrockClient() {
  const env = getBedrockEnv();
  return client ??= new BedrockRuntimeClient({ region: env.AWS_REGION, credentials: nonprodAwsCredentials(), maxAttempts: 1 });
}

export async function generateStructured<T>(options: GenerateStructuredOptions<T>) {
  const { createStructuredAIClient } = await import("./structured-ai-client");
  return createStructuredAIClient().generateStructured(options);
}
