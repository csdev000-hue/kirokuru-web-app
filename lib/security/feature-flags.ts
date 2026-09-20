import "server-only";
import { z } from "zod";
import { ApplicationError } from "@/lib/errors/application-error";
export function requireFeature(name: "AI_ENABLED" | "RECORDING_ENABLED") {
  if (z.enum(["true", "false"]).parse(process.env[name] ?? "true") !== "true") throw new ApplicationError("FEATURE_DISABLED", 503, "この機能は現在利用できません。");
}
