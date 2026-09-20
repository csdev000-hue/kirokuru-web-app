import "server-only";
import { z } from "zod";
import { validateEnvironment } from "@/lib/utils/env-validation";
const settings = z.object({
 MAX_RECORDING_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(5_000_000_000).default(500 * 1024 * 1024),
 RECORDING_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(600),
 RECORDING_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
});
export const getRecordingSettings = () => validateEnvironment(settings, process.env);
