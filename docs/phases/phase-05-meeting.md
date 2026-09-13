あなたはシニアフルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 5を実装してください。

# Phase 5の目的

Phase 5では、Phase 0〜4で構築した以下の基盤を利用し、

- Next.js
- TypeScript
- Drizzle ORM
- Neon PostgreSQL
- Auth.js
- Organization / Project Permission
- Tenant Isolation
- Audit Log
- Organization / Project CRUD
- Ticket CRUD / Comments / Kanban

Project配下のMeeting管理機能、参加者、Transcript保存基盤を実装します。

本Phase完了時点で以下が成立する状態にしてください。

```text
Project
↓
Meeting一覧
↓
Meeting作成
↓
Meeting詳細
↓
Participant
↓
Transcript
↓
Meeting完了
```

次PhaseのAI議事録生成が、このMeeting / Transcriptデータを直接利用できる構造にしてください。

---

# 前提

Phase 4まで完了しており、最低限以下が存在する前提です。

```text
lib/
├── db/
│   ├── client.ts
│   └── schema/
├── auth/
├── permissions/
│   ├── organization.ts
│   ├── project.ts
│   ├── resource.ts
│   └── roles.ts
├── security/
│   └── audit.ts
├── services/
│   ├── organization-service.ts
│   ├── project-service.ts
│   ├── ticket-service.ts
│   └── ticket-comment-service.ts
└── validators/
```

DB:

```text
projects
project_members
meetings
meeting_participants
meeting_transcripts
meeting_recordings
meeting_minutes
users
audit_logs
```

---

# Meeting Schema

対象テーブル:

```text
meetings
```

カラム:

```text
id
project_id
title
meeting_date
status
created_by
created_at
updated_at
```

status:

```text
scheduled
recording
processing
completed
failed
```

---

# Meeting Participant Schema

```text
meeting_participants
```

カラム:

```text
meeting_id
user_id
display_name
role
joined_at
left_at
```

role:

```text
host
participant
```

user_id:

```text
NULL可
```

外部参加者を考慮してください。

---

# Meeting Transcript Schema

```text
meeting_transcripts
```

カラム:

```text
id
meeting_id
speaker_user_id
speaker_name
started_at
ended_at
text
sequence_no
created_at
```

Constraint:

```text
UNIQUE(meeting_id, sequence_no)
```

started_at:

```text
0以上
```

ended_at:

```text
NULL
または
started_at以上
```

DB Constraintが未実装の場合は安全なMigration追加を検討してください。

---

# Phase 5実装範囲

以下を実装してください。

```text
1. Meeting一覧
2. Meeting作成
3. Meeting詳細
4. Meeting更新
5. Meeting削除/Cancel方針
6. Meeting status管理
7. Participant一覧
8. Participant追加
9. Participant更新
10. Participant削除
11. Transcript一覧
12. Transcript登録
13. Transcript一括登録
14. Transcript更新
15. Transcript削除方針
16. Transcript sequence管理
17. Authorization
18. Tenant Isolation
19. Audit Log
20. UI
21. API Test
22. Security Test
23. E2E
```

---

# 1. Meeting API

以下を実装してください。

```text
GET  /api/projects/:projectId/meetings
POST /api/projects/:projectId/meetings

GET    /api/meetings/:id
PATCH  /api/meetings/:id
DELETE /api/meetings/:id
```

参加者:

```text
GET    /api/meetings/:id/participants
POST   /api/meetings/:id/participants
PATCH  /api/meetings/:id/participants/:participantId
DELETE /api/meetings/:id/participants/:participantId
```

Transcript:

```text
GET    /api/meetings/:id/transcripts
POST   /api/meetings/:id/transcripts
POST   /api/meetings/:id/transcripts/bulk
PATCH  /api/meetings/:id/transcripts/:transcriptId
DELETE /api/meetings/:id/transcripts/:transcriptId
```

既存API詳細設計と異なる場合は、既存設計を優先してください。

---

# 2. GET Meeting一覧

対象:

```text
GET /api/projects/:projectId/meetings
```

権限:

```text
viewer以上
```

必ず:

```ts
requireProjectViewer(...)
```

等を使用してください。

Response例:

```json
{
  "data": [
    {
      "id": "meeting-uuid",
      "projectId": "project-uuid",
      "title": "週次開発定例",
      "meetingDate": "2026-09-10T09:00:00Z",
      "status": "scheduled",
      "createdBy": {
        "id": "user-uuid",
        "name": "田中"
      },
      "participantCount": 4,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

# 3. Meeting一覧Filter

最低限:

```text
status
from
to
```

例:

```text
?status=completed
?from=2026-09-01
?to=2026-09-30
```

必要なら:

```text
q
```

によるtitle検索を追加して構いません。

---

# 4. Meeting一覧Sort

最低限:

```text
meetingDate
createdAt
updatedAt
```

order:

```text
asc
desc
```

許可ColumnをWhitelistしてください。

---

# 5. Meeting Pagination

MVPでは以下を推奨します。

```text
page
limit
```

default:

```text
limit = 30
```

max:

```text
100
```

他Project Meetingが混入しないようにしてください。

---

# 6. POST Meeting

対象:

```text
POST /api/projects/:projectId/meetings
```

権限:

```text
owner
member
```

viewerは禁止。

Request例:

```json
{
  "title": "週次開発定例",
  "meetingDate": "2026-09-10T09:00:00+09:00"
}
```

初期status:

```text
scheduled
```

created_by:

```text
currentUser.id
```

Clientから指定させないでください。

---

# 7. Meeting作成Validation

title:

```text
required
trim
1〜200文字
```

meetingDate:

```text
required
ISO 8601
```

status:

```text
Client指定禁止
```

作成時は必ずscheduledとしてください。

---

# 8. Meeting作成時Participant

Meeting作成者を自動的にhostとしてParticipantへ登録してください。

Transaction:

```text
BEGIN

meetings INSERT
↓
meeting_participants INSERT
  user_id = currentUser.id
  display_name = currentUser.name
  role = host

COMMIT
```

Meetingだけ作成されhostが存在しない状態を作らないでください。

---

# 9. Meeting作成Audit

成功時:

```text
meeting.create
```

Audit:

```text
organizationId
projectId
meetingId
userId
resourceType = meeting
resourceId
```

---

# 10. GET Meeting詳細

対象:

```text
GET /api/meetings/:id
```

重要:

ClientからprojectIdを受け取って認可しないでください。

必ず:

```text
meetingId
↓
DBでmeeting.project_id取得
↓
requireProjectViewer
```

としてください。

---

# 11. Meeting詳細Response

例:

```json
{
  "data": {
    "id": "meeting-uuid",
    "projectId": "project-uuid",
    "title": "週次開発定例",
    "meetingDate": "2026-09-10T09:00:00Z",
    "status": "scheduled",
    "createdBy": {
      "id": "user-uuid",
      "name": "田中"
    },
    "participants": [],
    "transcriptCount": 120,
    "recording": null,
    "minutes": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

meeting_minutesはPhase 6以降で扱うため、現時点では最新Minutes ID程度の軽い情報でも構いません。

---

# 12. PATCH Meeting

対象:

```text
PATCH /api/meetings/:id
```

権限:

```text
owner
member
```

変更可能Field:

```text
title
meetingDate
status
```

ただしstatus変更は通常Field更新と分離してService内で業務ルールを適用してください。

---

# 13. Meeting Status Transition

以下の遷移を基本としてください。

```text
scheduled
   ↓
recording
   ↓
processing
   ↓
completed
```

異常:

```text
recording
processing
↓
failed
```

再処理:

```text
failed
↓
processing
```

MVPで必要なら:

```text
scheduled → completed
```

を手動会議用として許可しても構いません。

ただし何でも自由にstatus変更できる設計にはしないでください。

---

# 14. Status Transition共通Service

例:

```ts
startMeeting(...)
finishRecording(...)
startProcessing(...)
completeMeeting(...)
failMeeting(...)
retryMeeting(...)
```

または:

```ts
transitionMeetingStatus(...)
```

を実装してください。

UI/APIが直接好きなstatusを書き込むだけの構造は避けてください。

---

# 15. PATCH Mass Assignment対策

以下は変更不可です。

```text
id
project_id
created_by
created_at
updated_at
```

Clientから:

```json
{
  "projectId": "other-project",
  "createdBy": "attacker"
}
```

等を送っても反映されないようにしてください。

---

# 16. DELETE Meeting

Meetingには今後:

```text
Transcript
Recording
Minutes
Ticket Candidate
Ticket
```

が紐付きます。

そのため物理DELETEを安易に行わないでください。

Phase 5推奨:

```text
Transcript/Recording/Minutes等が存在
→ DELETE拒否
```

またはMeeting削除APIをPhase 5では限定的にしてください。

空Meetingのみ削除可能:

```text
participants以外関連データなし
```

等、安全なルールを選択してください。

Cascade Deleteは禁止です。

---

# 17. Participant一覧

対象:

```text
GET /api/meetings/:id/participants
```

権限:

```text
viewer以上
```

Response例:

```json
{
  "data": [
    {
      "id": "participant-id",
      "userId": "user-uuid",
      "displayName": "田中",
      "role": "host",
      "joinedAt": null,
      "leftAt": null
    }
  ]
}
```

Schemaにparticipant IDがない場合は、Phase 1実装結果に合わせて識別方法を採用してください。

---

# 18. Participant追加

対象:

```text
POST /api/meetings/:id/participants
```

権限:

```text
owner
member
```

Request例:

内部User:

```json
{
  "userId": "user-uuid",
  "role": "participant"
}
```

外部参加者:

```json
{
  "displayName": "外部ユーザー",
  "role": "participant"
}
```

---

# 19. Internal Participant Validation

userIdがある場合:

```text
対象Project Member
```

であることを確認してください。

別Project / 別Organization Userを追加できないようにしてください。

---

# 20. External Participant

userIdなしの場合:

```text
displayName必須
```

としてください。

外部ParticipantにはApplication User権限を与えないでください。

Meeting上の表示用データに限定してください。

---

# 21. Participant Role

role:

```text
host
participant
```

host追加はProject owner/memberのみにしてください。

必要なら:

```text
最低1名host
```

を維持してください。

最後のhost削除を禁止することを推奨します。

---

# 22. Participant重複

同一Meetingに同一user_idが複数登録されないようにしてください。

DB Constraintがない場合はApplication Validationを行ってください。

必要性が高い場合:

```text
UNIQUE(meeting_id, user_id)
WHERE user_id IS NOT NULL
```

相当のPartial Unique IndexをMigrationで追加して構いません。

理由を報告してください。

---

# 23. Participant Join / Leave

以下を更新可能にしてください。

```text
joined_at
left_at
```

ただし通常のプロフィール編集APIと分離することを推奨します。

例:

```text
POST /api/meetings/:id/participants/me/join
POST /api/meetings/:id/participants/me/leave
```

LiveKit導入前のPhase 5では、骨組みだけでも構いません。

---

# 24. Transcript一覧

対象:

```text
GET /api/meetings/:id/transcripts
```

権限:

```text
viewer以上
```

Sort:

```text
sequence_no ASC
```

Response例:

```json
{
  "data": [
    {
      "id": "transcript-uuid",
      "speakerUserId": "user-uuid",
      "speakerName": "田中",
      "startedAt": 12.200,
      "endedAt": 18.700,
      "text": "API仕様は金曜日までに更新します。",
      "sequenceNo": 1
    }
  ]
}
```

---

# 25. Transcript Pagination

通常は会議単位なので全件取得でも構いませんが、長時間会議に備えてPaginationを検討してください。

推奨:

```text
cursor = sequence_no
limit
```

または:

```text
fromSequence
limit
```

ただしAI生成用Server Serviceでは全Transcriptを別経路で取得できるようにしてください。

UI APIとAI内部Queryを無理に同じPaginationにしないでください。

---

# 26. POST Transcript

対象:

```text
POST /api/meetings/:id/transcripts
```

権限:

```text
owner
member
```

Request例:

```json
{
  "speakerUserId": "user-uuid",
  "speakerName": "田中",
  "startedAt": 12.2,
  "endedAt": 18.7,
  "text": "API仕様は金曜日までに更新します。",
  "sequenceNo": 1
}
```

---

# 27. Transcript Validation

speakerUserId:

```text
optional
nullable
```

speakerName:

```text
required
1〜100文字
```

startedAt:

```text
required
number
>= 0
```

endedAt:

```text
optional
nullable
number
>= startedAt
```

text:

```text
required
trim
1文字以上
```

sequenceNo:

```text
required
integer
>= 1
```

---

# 28. Speaker Validation

speakerUserIdが指定されている場合:

```text
Meeting Participant
または
Project Member
```

であることを確認してください。

他Tenant User IDをspeakerとして紐付けないでください。

---

# 29. Transcript sequence

同一Meeting:

```text
sequence_no unique
```

DB Constraint違反を適切なAPI Errorへ変換してください。

例:

```text
TRANSCRIPT_SEQUENCE_CONFLICT
409
```

---

# 30. Transcript一括登録

AI/音声認識連携のため、以下を実装してください。

```text
POST /api/meetings/:id/transcripts/bulk
```

Request:

```json
{
  "transcripts": [
    {
      "speakerUserId": "...",
      "speakerName": "田中",
      "startedAt": 12.2,
      "endedAt": 18.7,
      "text": "...",
      "sequenceNo": 1
    }
  ]
}
```

---

# 31. Bulk Transcript Transaction

一括登録はTransactionを使用してください。

```text
BEGIN
Transcript 1
Transcript 2
Transcript 3
...
COMMIT
```

途中で不正データがある場合:

```text
全体Rollback
```

を基本としてください。

部分成功はMVPでは避けてください。

---

# 32. Bulk Size Limit

無制限配列を受け取らないでください。

例:

```text
max 500 transcripts / request
```

実際のユースケースに合わせて適切な上限を設定してください。

長時間会議ではClient/音声認識側から分割送信できる前提とします。

---

# 33. Transcript更新

対象:

```text
PATCH /api/meetings/:id/transcripts/:transcriptId
```

変更可能:

```text
speakerUserId
speakerName
startedAt
endedAt
text
sequenceNo
```

権限:

```text
owner
member
```

AI議事録生成前に文字起こし修正できるようにしてください。

---

# 34. Transcript削除

Phase 5では削除可能でも構いません。

ただしPhase 6以降、Minutes/Ticket CandidateのEvidenceとして利用されたTranscriptは削除制限が必要になります。

Phase 5時点では:

```text
Minutes未生成
→ 削除可

Minutes生成済み
→ 将来DELETE拒否
```

へ拡張可能なService構造にしてください。

---

# 35. Transcript Audit

最低限:

```text
meeting.transcript.create
meeting.transcript.bulk_create
meeting.transcript.update
meeting.transcript.delete
```

すべて記録するとAudit量が多すぎる場合は、

```text
bulk_create
update
delete
```

を重点対象としても構いません。

方針を報告してください。

---

# 36. Transcript編集履歴

MVPではTranscript version tableまでは不要です。

ただしAuditに:

```text
resource_id
action
```

を残してください。

本文全文をAudit metadataへ複製しないでください。

---

# 37. Meeting statusとTranscript

以下のルールを検討してください。

scheduled:

```text
Transcript登録可
```

手動会議対応のため許可しても構いません。

recording:

```text
登録可
```

processing:

```text
原則追加/更新制限
```

completed:

```text
通常Read Only
```

ただしユーザー修正要件を考慮し、MVPでcompleted後編集を許可する場合は理由を明示してください。

---

# 38. AI Phaseへの準備

Phase 6でAI議事録生成を行います。

そのため以下のServiceを用意してください。

例:

```ts
loadMeetingAIContext(meetingId)
```

返却:

```ts
{
  meeting,
  project,
  projectMembers,
  participants,
  transcripts
}
```

ただしBedrock呼び出しはまだ実装しないでください。

---

# 39. AI Context安全性

`loadMeetingAIContext()`では必ず:

```text
meeting_id
project_id
participants
project members
transcripts
```

が同一Project/Meetingに属していることを保証してください。

Client入力からAI Contextを組み立てないでください。

---

# 40. Meeting一覧UI

画面:

```text
/projects/:projectId/meetings
```

最低限表示:

```text
Meeting title
Meeting date
Status
Participants
Created by
```

---

# 41. Meeting作成UI

```text
/projects/:projectId/meetings/new
```

またはModal。

入力:

```text
title
meetingDate
```

作成後:

```text
/meetings/:meetingId
```

へ遷移してください。

---

# 42. Meeting詳細UI

```text
/meetings/:meetingId
```

最低限以下を表示してください。

```text
Meeting title
Meeting date
Status
Participants
Transcript
```

将来以下を追加できるAreaを用意してください。

```text
Recording
AI Minutes
AI Ticket Candidates
```

---

# 43. Meeting Header Action

owner/member:

```text
Edit Meeting
Start Meeting
Complete Meeting
```

viewer:

```text
Read Only
```

Start MeetingのLiveKit接続はまだ実装しません。

Phase 5ではStatus変更だけでも構いません。

---

# 44. Participant UI

Meeting詳細に:

```text
Participants
```

を表示。

表示:

```text
displayName
role
joinedAt
leftAt
```

owner/member:

```text
Add Participant
Remove Participant
```

viewer:

```text
Read Only
```

---

# 45. Transcript UI

Meeting詳細または専用Tab:

```text
Transcript
```

表示:

```text
timestamp
speaker
text
```

例:

```text
00:12 田中
API仕様は金曜日までに更新します。
```

---

# 46. Timestamp表示

startedAt秒数をUI上:

```text
HH:MM:SS
```

または:

```text
MM:SS
```

へ変換してください。

DB値はnumeric秒のまま保持します。

---

# 47. Transcript編集UI

owner/memberは:

```text
speaker
text
timestamp
```

を修正可能。

viewer:

```text
閲覧のみ
```

---

# 48. Transcript Empty State

Transcriptなし:

```text
文字起こしはまだありません
```

owner/memberには:

```text
文字起こしを追加
```

を表示して構いません。

---

# 49. Meeting Empty State

Meetingなし:

```text
まだ会議がありません
最初の会議を作成
```

---

# 50. Loading / Error State

最低限:

```text
Meeting list loading
Meeting detail loading
Participant loading
Transcript loading
Saving
Deleting
Processing
```

Error:

```text
401
403
404
409
422
500
```

内部Stackは表示しないでください。

---

# 51. Service Layer

推奨:

```text
lib/services/
├── meeting-service.ts
├── meeting-participant-service.ts
└── meeting-transcript-service.ts
```

最低限:

```ts
listMeetings(...)
getMeeting(...)
createMeeting(...)
updateMeeting(...)
transitionMeetingStatus(...)
deleteMeeting(...)

listParticipants(...)
addParticipant(...)
updateParticipant(...)
removeParticipant(...)

listTranscripts(...)
createTranscript(...)
bulkCreateTranscripts(...)
updateTranscript(...)
deleteTranscript(...)
loadMeetingAIContext(...)
```

---

# 52. Validator

推奨:

```text
lib/validators/
├── meeting.ts
├── meeting-participant.ts
└── meeting-transcript.ts
```

Schema:

```text
createMeetingSchema
updateMeetingSchema
meetingListQuerySchema

createParticipantSchema
updateParticipantSchema

createTranscriptSchema
updateTranscriptSchema
bulkTranscriptSchema
```

---

# 53. Permission

Phase 2のResource Permissionを利用してください。

最低限:

```text
meetingId
↓
meeting.project_id
↓
requireProjectViewer/member
```

Routeごとに認可Queryを重複実装しないでください。

---

# 54. Tenant Isolation

最重要です。

Organization A Userが:

```text
Organization B
Project B
Meeting B
Transcript B
```

へアクセスできないこと。

以下すべてで確認してください。

```text
Meeting detail
Meeting update
Meeting delete
Participants
Transcript list
Transcript create
Transcript update
Transcript delete
```

---

# 55. Participant Tenant Isolation

Project A Meetingへ:

```text
Organization B User
```

をParticipant追加できないこと。

---

# 56. Transcript Speaker Tenant Isolation

Project A Meeting Transcriptへ:

```text
Organization B User ID
```

をspeakerUserIdとして設定できないこと。

---

# 57. Mass Assignment

以下をRequestへ含めても変更不可としてください。

Meeting:

```text
projectId
createdBy
createdAt
```

Participant:

```text
meetingId
```

Transcript:

```text
meetingId
createdAt
```

---

# 58. Meeting API Test

最低限:

## MTG-T01

ownerがMeeting作成。

期待:

```text
201
作成者がhostになる
```

## MTG-T02

memberがMeeting作成。

成功。

## MTG-T03

viewerがMeeting作成。

```text
403
```

## MTG-T04

別Project UserがMeeting詳細。

```text
403/404
```

## MTG-T05

owner/memberがMeeting更新。

成功。

## MTG-T06

viewerがMeeting更新。

```text
403
```

## MTG-T07

不正status transition。

```text
409/422
```

## MTG-T08

関連データありMeeting削除。

```text
409
```

---

# 59. Participant Test

## PRT-T01

Project MemberをParticipant追加。

成功。

## PRT-T02

別Project Userを追加。

拒否。

## PRT-T03

External Participant追加。

成功。

## PRT-T04

viewerがParticipant追加。

```text
403
```

## PRT-T05

最後のhost削除。

禁止する設計なら:

```text
409
```

---

# 60. Transcript Test

## TRN-T01

Transcript作成。

成功。

## TRN-T02

sequence duplicate。

```text
409
```

## TRN-T03

startedAt < 0。

```text
422
```

## TRN-T04

endedAt < startedAt。

```text
422
```

## TRN-T05

空text。

```text
422
```

## TRN-T06

別Tenant speakerUserId。

拒否。

## TRN-T07

viewerがTranscript作成。

```text
403
```

---

# 61. Bulk Transcript Test

## TRN-B01

100件一括登録。

成功。

## TRN-B02

途中1件不正。

期待:

```text
全件Rollback
```

## TRN-B03

sequence重複。

```text
409
全件Rollback
```

## TRN-B04

上限超過。

```text
422
```

---

# 62. Security Test

最低限:

```text
SEC-MTG-01
別Tenant Meeting ID

SEC-MTG-02
project_id Mass Assignment

SEC-PRT-01
別Tenant Participant

SEC-TRN-01
別Tenant Transcript

SEC-TRN-02
別Tenant speakerUserId

SEC-TRN-03
meeting_id Mass Assignment

SEC-XSS-01
Transcriptに<script>
```

Transcript本文は文字列として安全に表示してください。

`dangerouslySetInnerHTML`は禁止です。

---

# 63. E2E

最低限:

```text
Login
↓
Project
↓
Meeting作成
↓
Meeting詳細
↓
Participant追加
↓
Transcript追加
↓
Transcript編集
↓
Meeting status変更
```

可能なら:

```text
Meeting completed
```

まで確認してください。

---

# 64. Performance

Transcript一覧でN+1を避けてください。

特に:

```text
speaker user
participant
createdBy
```

を1発言ごとに個別Queryしないでください。

---

# 65. Index確認

Phase 1で最低限:

```text
meetings(project_id, meeting_date)
meeting_transcripts(meeting_id, sequence_no)
```

が存在することを確認してください。

必要なら:

```text
meeting_participants(meeting_id)
```

等のIndexを追加してください。

理由を報告してください。

---

# 66. Transaction

最低限以下をTransaction化してください。

```text
Meeting作成
+ Host Participant作成
```

Transcript Bulk InsertもTransaction必須。

Participant変更で複数操作が必要な場合もTransactionを利用してください。

---

# 67. Audit Log

最低限:

```text
meeting.create
meeting.update
meeting.delete
meeting.status.change

meeting.participant.add
meeting.participant.remove

meeting.transcript.create
meeting.transcript.bulk_create
meeting.transcript.update
meeting.transcript.delete
```

ログ量を考慮し、Transcript単発createをAudit対象外とする場合は理由を報告してください。

---

# 68. Meeting status Audit

status変更時は最低限:

```json
{
  "from": "recording",
  "to": "processing"
}
```

程度のmetadataを保存して構いません。

Transcript全文等は保存しないでください。

---

# 69. Phase 6 AI Minutesへの引継ぎ

Phase 5終了時点で以下が安全に取得できること。

```ts
const context = await loadMeetingAIContext(meetingId)
```

最低限:

```ts
{
  meeting: {
    id,
    projectId,
    title,
    meetingDate
  },
  project: {
    id,
    name
  },
  projectMembers: [],
  participants: [],
  transcripts: [
    {
      id,
      sequenceNo,
      speakerUserId,
      speakerName,
      startedAt,
      endedAt,
      text
    }
  ]
}
```

このContextを次PhaseでBedrockへ渡します。

---

# 70. Phase 5で実装しないもの

まだ実装しないでください。

```text
AI Minutes生成
AI Ticket Candidate生成
Bedrock本処理
Meeting Minutes UI
AI Review UI
Recording Upload本実装
S3 Presigned Upload本実装
LiveKit Room実接続
WebRTC
音声認識エンジン
Notification
Billing
Production Deploy
```

Transcriptは手動/API登録基盤までとします。

---

# 71. セキュリティ禁止事項

絶対に以下をしないでください。

```text
Client projectIdだけでMeeting認可
Client meetingIdだけでTenant判定省略
Client roleを信用
別Tenant UserをParticipant登録
別Tenant Userをspeaker登録
Meeting project_id書換
Transcript meeting_id書換
Cascade Delete
Raw SQL文字列連結
dangerouslySetInnerHTML
Production DB変更
```

---

# 72. 実装ルール

1. Phase 0〜4のコードを最初に確認する。
2. Phase 2 Permission helperを再利用する。
3. Phase 3〜4のService/Validator/API Response形式へ合わせる。
4. Route Handlerを薄くする。
5. Meeting / Participant / Transcript Serviceを分離する。
6. Zod Validationを利用する。
7. Tenant Isolationを最優先する。
8. Bulk TranscriptはTransaction化する。
9. Transcript sequenceの一意性を保証する。
10. Project外UserをParticipant/Speakerにしない。
11. Audit Logを重要操作へ追加する。
12. `loadMeetingAIContext()`を安全に実装する。
13. Bedrock処理を先回り実装しない。
14. LiveKit/S3本実装を先回りしない。
15. Production環境を変更しない。

---

# 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

安全なTest DBがある場合:

```bash
npm run test:integration
```

設定されている場合:

```bash
npm run test:e2e
```

---

# Phase 5 Definition of Done

以下をすべて満たした場合のみPhase 5完了としてください。

- Meeting一覧を取得できる
- Meetingを作成できる
- Meeting作成者がhost Participantになる
- Meeting詳細を取得できる
- Meetingを更新できる
- Meeting status transitionが制御されている
- viewerはMeeting Read Only
- Participant一覧を取得できる
- Internal Participantを追加できる
- External Participantを追加できる
- 他Tenant UserをParticipantへ追加できない
- Transcript一覧をsequence順で取得できる
- Transcriptを作成できる
- Transcriptを一括登録できる
- Bulk途中失敗時にRollbackされる
- Transcriptを修正できる
- duplicate sequenceを防止できる
- startedAt / endedAt validationがある
- 他Tenant Userをspeakerへ設定できない
- Meeting / Participant / TranscriptのTenant Isolationが成立する
- Mass Assignmentが防止されている
- Transcript XSS payloadが安全に表示される
- Audit Logが記録される
- `loadMeetingAIContext()`が利用可能
- N+1を避けている
- lint成功
- typecheck成功
- test成功
- build成功
- E2E成功または未実施理由が明確
- Production環境を変更していない

---

# 作業終了時報告形式

以下の形式で必ず報告してください。

```text
## Phase 5 Meeting / Participant / Transcript 実装結果

### 1. Meeting CRUD
- List:
- Create:
- Detail:
- Update:
- Delete:
- Status transition:

### 2. Participants
- List:
- Add internal:
- Add external:
- Update:
- Remove:
- Host protection:

### 3. Transcript
- List:
- Create:
- Bulk create:
- Update:
- Delete:
- Sequence:
- Pagination:

### 4. AI Context
- loadMeetingAIContext:
- Project members:
- Participants:
- Transcripts:

### 5. Authorization
- owner:
- member:
- viewer:

### 6. Tenant Isolation
- Meeting:
- Participant:
- Transcript:
- Speaker:

### 7. Transaction
- Meeting + host:
- Transcript bulk:

### 8. Audit
- meeting:
- participant:
- transcript:

### 9. Security
- Mass Assignment:
- XSS:
- Cross tenant:
- Raw SQL:
- Production変更:

### 10. Test
- MTG-T01〜:
- PRT-T01〜:
- TRN-T01〜:
- TRN-B01〜:
- Security:
- E2E:

### 11. Performance
- N+1:
- Index:
- Query:

### 12. 実行結果
- lint:
- typecheck:
- unit:
- integration:
- e2e:
- build:

### 13. 作成・変更ファイル
- ...

### 14. DB Migration差分
- なし
または
- ...

### 15. 未実施・未解決事項
- ...

### 16. Phase 6への引継ぎ
- ...
```

既存コード、要件定義、DB設計、API詳細設計、画面詳細設計、AIプロンプト・JSON Schema設計、セキュリティ設計から合理的に判断できる事項は質問せず実装してください。

ただし、Production DB変更、Production Migration、Production Secret設定、外部サービスへの課金・破壊的操作が必要な場合は実行せず、Local/Test環境で完成可能な範囲まで実装してください。