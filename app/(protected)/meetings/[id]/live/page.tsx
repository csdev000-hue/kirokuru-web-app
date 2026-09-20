import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getMeeting } from "@/lib/services/meeting-service";
import { getProject } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { liveMeetingEnabled } from "@/lib/livekit/config";
import { LiveMeetingRoom } from "@/components/meetings/live-room";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params; const meeting = await pageResource(() => getMeeting(user.id, id)); const project = await getProject(user.id, meeting.projectId);
 const available = liveMeetingEnabled() && project.status === "active" && meeting.status === "recording" && meeting.liveStartedAt && !meeting.liveEndedAt;
 return <main><Link href={`/meetings/${id}`}>会議詳細へ</Link><h1>{meeting.title}</h1><p>オンライン会議（自動録音なし）</p>{available ? <LiveMeetingRoom id={id} displayName={user.name} canPublish={project.role !== "viewer"} /> : <p>会議開始前・終了済み、またはオンライン会議を利用できない状態です。</p>}</main>;
}
