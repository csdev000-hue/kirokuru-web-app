import { z } from "zod";
export const meetingStatuses = ["scheduled", "recording", "processing", "completed", "failed"] as const;
export type MeetingStatus = typeof meetingStatuses[number];
export const transitions: Record<MeetingStatus, readonly MeetingStatus[]> = { scheduled: ["recording", "completed"], recording: ["processing", "completed", "failed"], processing: ["completed", "failed"], failed: ["processing"], completed: [] };
export const editableMeeting = (status: MeetingStatus) => status !== "processing" && status !== "completed";
export const meetingDateSchema = z.iso.datetime({ offset: true }).refine((v) => !v.startsWith("0000") && Number.isFinite(Date.parse(v)));
export const createMeetingSchema = z.object({ title: z.string().trim().min(1).max(200), meetingDate: meetingDateSchema }).strict();
export const updateMeetingSchema = createMeetingSchema.extend({ status: z.enum(meetingStatuses) }).partial().strict().refine((v) => Object.keys(v).length > 0);
export const meetingListQuerySchema = z.object({ status: z.enum(meetingStatuses).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), sort: z.enum(["meetingDate", "createdAt", "updatedAt"]).default("meetingDate"), order: z.enum(["asc", "desc"]).default("desc"), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(30) }).strict().refine((v) => !v.from || !v.to || v.from <= v.to);
