import type { z } from "zod";

export type GenerateStructuredOptions<T> = {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
};

export interface StructuredGenerator {
  generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T>;
}
