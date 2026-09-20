import { z } from "zod";
import { BusinessError } from "@/lib/api/errors";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody } from "@/lib/api/request";
import { bulkRegisterSchema } from "@/lib/validators/ticket-registration";
import { bulkRegisterTicketCandidates } from "@/lib/services/ticket-registration-service";
export function POST(request: Request) { return withCurrentUser(async (user, requestId) => { const parsed = bulkRegisterSchema.safeParse(await readBody(request, z.unknown())); if (!parsed.success) throw new BusinessError("BULK_REGISTRATION_INVALID", 422, "1〜50件の重複しない候補IDのみを指定してください。"); const input = parsed.data; return Response.json({ data: await bulkRegisterTicketCandidates({ ...input, userId: user.id, requestId }), requestId }, { status: 201 }); })(); }
