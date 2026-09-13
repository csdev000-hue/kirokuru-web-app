import "server-only";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { getBedrockEnv } from "@/lib/env";
import type { GenerateStructuredOptions } from "./types";

let client: BedrockRuntimeClient | undefined;

export function getBedrockClient() {
  const env = getBedrockEnv();
  return client ??= new BedrockRuntimeClient({ region: env.AWS_REGION });
}

export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
  // TODO Phase 6: invoke Bedrock and validate the untrusted response with options.schema.
  void options;
  throw new Error("Structured generation is not implemented in Phase 0.");
}
