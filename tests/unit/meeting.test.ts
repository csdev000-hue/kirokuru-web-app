import { expect, it } from "vitest";
import { createMeetingSchema, transitions } from "@/lib/validators/meeting";
import { createParticipantSchema } from "@/lib/validators/meeting-participant";
import { createTranscriptSchema } from "@/lib/validators/meeting-transcript";
import { transcriptTimestamp, meetingTime } from "@/lib/utils/meeting-time";
it("日時offset必須・タイトルtrim・status注入不可", () => {
 expect(createMeetingSchema.parse({ title: " 会議 ", meetingDate: "2026-09-16T01:00:00Z" }).title).toBe("会議");
 expect(createMeetingSchema.safeParse({ title: "x", meetingDate: "2026-09-16T01:00:00" }).success).toBe(false);
 expect(createMeetingSchema.safeParse({ title: "x", meetingDate: "2026-09-16T01:00:00Z", status: "completed" }).success).toBe(false);
});
it("外部参加者は名前必須、useridなしでもhostはProject権限と無関係", () => { expect(createParticipantSchema.safeParse({ role: "host" }).success).toBe(false); expect(createParticipantSchema.safeParse({ displayName: "Guest", role: "host" }).success).toBe(true); });
it("数値・時間順・sequenceを検証", () => {
 const base = { speakerName: "x", startedAt: 1, endedAt: 2, text: "x", sequenceNo: 1 };
 for (const patch of [{ startedAt: -1 }, { endedAt: 0 }, { startedAt: Infinity }, { sequenceNo: 1.5 }, { sequenceNo: 2147483648 }, { text: " " }]) expect(createTranscriptSchema.safeParse({ ...base, ...patch }).success).toBe(false);
});
it("completedは終端、手動会議はscheduledから完了可能", () => { expect(transitions.completed).toEqual([]); expect(transitions.scheduled).toContain("completed"); expect(transitions.scheduled).not.toContain("processing"); });
it("秒数をHH:MM:SS、開催日時をJSTで表示", () => { expect(transcriptTimestamp(3672.123)).toBe("01:01:12"); expect(meetingTime("2026-09-16T01:00:00Z")).toContain("10:00"); });
