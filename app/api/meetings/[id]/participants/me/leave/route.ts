import { withCurrentUser } from "@/lib/auth/api";
import { requireWriteOrigin, resourceId } from "@/lib/api/request";
import { recordMyAttendance } from "@/lib/services/meeting-participant-service";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) { return withCurrentUser(async (user) => { requireWriteOrigin(request); return Response.json({ data: await recordMyAttendance(user.id, resourceId((await context.params).id), "leave") }); })(); }
