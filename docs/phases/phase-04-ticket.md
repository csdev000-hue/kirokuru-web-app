あなたはシニアフルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 4を実装してください。

# Phase 4の目的

Phase 4では、Phase 0〜3で構築した以下の基盤を利用し、

- Next.js
- TypeScript
- Drizzle ORM
- Neon PostgreSQL
- Auth.js
- Organization / Project Permission
- Tenant Isolation
- Audit Log
- Organization / Project CRUD

Project配下のTicket管理機能を実装します。

本Phase完了時点で、AIやMeeting機能がなくても通常のProject Management Toolとして以下が利用できる状態にしてください。

```text
Project
↓
Ticket一覧
↓
Ticket作成
↓
Ticket詳細
↓
Ticket更新
↓
Comment
↓
Kanban Board
```

---

# 前提

Phase 3まで完了しており、最低限以下が存在する前提です。

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
│   └── project-service.ts
└── validators/
```

DB:

```text
projects
project_members
tickets
ticket_comments
users
audit_logs
```

Ticket schema:

```text
id
project_id
title
description
type
status
priority
assignee_id
due_date
created_by
source_meeting_id
source_candidate_id
created_at
updated_at
deleted_at
```

---

# Ticket enum

type:

```text
task
issue
decision
followup
```

status:

```text
todo
in_progress
done
blocked
```

priority:

```text
low
medium
high
urgent
```

---

# Phase 4実装範囲

以下を実装してください。

```text
1. Ticket一覧
2. Ticket作成
3. Ticket詳細
4. Ticket更新
5. Ticket論理削除
6. Ticketコメント
7. Ticket検索
8. Filter / Sort
9. Kanban Board
10. Kanban status変更
11. Assignee設定
12. Due Date設定
13. Authorization
14. Tenant Isolation
15. Audit Log
16. API Test
17. UI Test
18. E2E
```

---

# 1. Ticket API

以下を実装してください。

```text
GET  /api/projects/:projectId/tickets
POST /api/projects/:projectId/tickets

GET    /api/tickets/:id
PATCH  /api/tickets/:id
DELETE /api/tickets/:id
```

コメント:

```text
GET  /api/tickets/:id/comments
POST /api/tickets/:id/comments
```

必要であれば:

```text
PATCH  /api/tickets/:id/comments/:commentId
DELETE /api/tickets/:id/comments/:commentId
```

まで実装して構いません。

---

# 2. GET Ticket一覧

対象:

```text
GET /api/projects/:projectId/tickets
```

必ずPhase 2で作成したProject Permissionを利用してください。

最低権限:

```text
viewer以上
```

必ず:

```ts
requireProjectViewer(...)
```

等でDB Membershipを確認してください。

Clientから送信されたprojectIdだけを信用してはいけません。

---

# 3. Ticket一覧Response

例:

```json
{
  "data": [
    {
      "id": "ticket-uuid",
      "projectId": "project-uuid",
      "title": "API仕様を更新する",
      "description": "...",
      "type": "task",
      "status": "todo",
      "priority": "high",
      "assignee": {
        "id": "user-uuid",
        "name": "田中"
      },
      "dueDate": "2026-09-15",
      "createdBy": {
        "id": "user-uuid",
        "name": "佐藤"
      },
      "sourceMeetingId": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

deleted_atがNULLのTicketのみ通常一覧に含めてください。

---

# 4. Ticket一覧Query

最低限以下のFilterを実装してください。

```text
status
type
priority
assigneeId
```

例:

```text
GET /api/projects/:projectId/tickets?status=todo
GET /api/projects/:projectId/tickets?priority=high
GET /api/projects/:projectId/tickets?assigneeId=...
```

複数Filter併用可能な構造にしてください。

---

# 5. 検索

Ticket title / descriptionを対象に簡易検索を実装してください。

例:

```text
?q=API
```

MVPではPostgreSQL ILIKE等で構いません。

ただし文字列連結によるRaw SQLは禁止です。

DrizzleのParameterized Queryを使用してください。

---

# 6. Sort

最低限以下をサポートしてください。

```text
updatedAt
createdAt
dueDate
priority
```

order:

```text
asc
desc
```

Clientから任意Column名をSQLへ直接渡さないでください。

許可ColumnをWhitelistしてください。

---

# 7. Pagination

Ticket数増加を考慮し、Paginationを実装してください。

MVPでは以下のどちらかで構いません。

```text
page
limit
```

または

```text
cursor
limit
```

推奨:

```text
limit default = 50
limit max = 100
```

例:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 120
  }
}
```

既存API設計にPagination形式がある場合はそちらを優先してください。

---

# 8. POST Ticket

対象:

```text
POST /api/projects/:projectId/tickets
```

権限:

```text
owner
member
```

viewerは禁止。

必ず:

```ts
requireProjectMember(...)
```

等を利用してください。

---

# 9. Ticket作成Request

```json
{
  "title": "API仕様を更新する",
  "description": "認証APIの変更内容を仕様書へ反映する",
  "type": "task",
  "priority": "high",
  "assigneeId": "user-uuid",
  "dueDate": "2026-09-15"
}
```

status初期値:

```text
todo
```

Clientからstatusを指定させる場合でも、初期作成では原則todoを推奨します。

---

# 10. Ticket Validation

title:

```text
required
trim
1〜300文字
```

description:

```text
optional
nullable
適切な最大長
```

type:

```text
task
issue
decision
followup
```

priority:

```text
low
medium
high
urgent
```

assigneeId:

```text
optional
nullable
UUID
```

dueDate:

```text
optional
nullable
YYYY-MM-DD
```

---

# 11. created_by

created_byは必ず:

```text
currentUser.id
```

としてください。

Clientからcreated_byを受け取らないでください。

以下もClient指定禁止です。

```text
source_meeting_id
source_candidate_id
created_at
updated_at
deleted_at
```

AI連携用Fieldは後続Phaseでサーバー内部から設定します。

---

# 12. Assignee Validation

assignee_idを設定する場合、そのUserが対象Project Memberであることを確認してください。

禁止:

```text
別Project
別Organization
Project非所属User
```

をassigneeへ設定すること。

期待:

```text
422
```

または適切な業務Error。

例:

```text
INVALID_ASSIGNEE
```

---

# 13. Ticket作成Audit

成功時:

```text
ticket.create
```

記録:

```text
organizationId
projectId
userId
resourceType = ticket
resourceId
```

metadataには必要最小限の変更情報のみ保存してください。

---

# 14. GET Ticket詳細

対象:

```text
GET /api/tickets/:id
```

重要:

ClientからprojectIdを別途受け取り認可しないでください。

必ず:

```text
ticketId
↓
DBでticket.project_id取得
↓
requireProjectViewer
```

としてください。

---

# 15. Ticket詳細Response

最低限:

```json
{
  "data": {
    "id": "...",
    "projectId": "...",
    "title": "...",
    "description": "...",
    "type": "task",
    "status": "todo",
    "priority": "high",
    "assignee": {},
    "dueDate": "2026-09-15",
    "createdBy": {},
    "sourceMeetingId": null,
    "sourceCandidateId": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

AI由来Ticketの場合にsourceMeetingId等を返せる構造を維持してください。

---

# 16. deleted Ticket

deleted_atが設定済みのTicketは通常:

```text
404
```

として扱ってください。

通常APIから復元・参照させない方針で構いません。

---

# 17. PATCH Ticket

対象:

```text
PATCH /api/tickets/:id
```

権限:

```text
owner
member
```

viewerは禁止。

変更可能Field:

```text
title
description
type
status
priority
assigneeId
dueDate
```

---

# 18. PATCH Mass Assignment対策

以下を変更できないようにしてください。

```text
id
project_id
created_by
source_meeting_id
source_candidate_id
created_at
deleted_at
```

例:

```json
{
  "projectId": "other-project",
  "createdBy": "attacker",
  "sourceMeetingId": "fake"
}
```

はrejectまたは無視してください。

推奨はZod `.strict()` 等によるrejectです。

---

# 19. Ticket Status変更

許可:

```text
todo
in_progress
done
blocked
```

MVPでは任意Status間の移動を許可して構いません。

ただしStatus変更処理は共通Serviceへ寄せてください。

将来workflow制約を追加しやすくしてください。

---

# 20. DELETE Ticket

対象:

```text
DELETE /api/tickets/:id
```

物理DELETEではなく論理削除してください。

```text
deleted_at = now()
```

権限:

```text
owner
member
```

viewerは禁止。

Audit:

```text
ticket.delete
```

---

# 21. Ticket Comment

DB:

```text
ticket_comments
```

カラム:

```text
id
ticket_id
user_id
content
created_at
updated_at
```

---

# 22. GET Comments

```text
GET /api/tickets/:id/comments
```

Project Viewer以上が参照可能。

Sort:

```text
created_at ASC
```

---

# 23. POST Comment

```text
POST /api/tickets/:id/comments
```

権限:

```text
owner
member
```

viewerは禁止を推奨します。

Request:

```json
{
  "content": "API側の修正が完了しました。"
}
```

Validation:

```text
required
trim
1文字以上
適切な最大長
```

user_id:

```text
currentUser.id
```

Client指定不可。

---

# 24. Comment更新・削除

実装する場合:

```text
PATCH /api/tickets/:id/comments/:commentId
DELETE /api/tickets/:id/comments/:commentId
```

原則:

```text
投稿者本人
または
Project owner
```

のみ操作可能。

他人のCommentをmemberが自由に変更できないようにしてください。

---

# 25. Comment Audit

必要であれば以下を記録してください。

```text
ticket.comment.create
ticket.comment.update
ticket.comment.delete
```

MVPでAudit対象を絞る場合、createのみでも構いません。

理由を報告してください。

---

# 26. Kanban Board

画面:

```text
/projects/:projectId/board
```

または既存画面設計に合わせてください。

Column:

```text
TODO
IN PROGRESS
BLOCKED
DONE
```

DB statusとの対応:

```text
todo
in_progress
blocked
done
```

---

# 27. Kanban表示

Ticket Card最低項目:

```text
title
priority
assignee
dueDate
type
```

必要に応じて:

```text
comment count
source meeting indicator
```

を将来追加できる構造にしてください。

---

# 28. Kanban Drag & Drop

可能であればDrag & Dropでstatusを変更してください。

ただし不必要に重いLibraryを追加しないでください。

ライブラリを追加する場合:

- maintenance状況
- bundle影響
- React/Next.js互換性

を確認してください。

Drag & Dropが過剰であればMVPではStatus変更Menuでも構いません。

---

# 29. Kanban status API

Drag & Drop時に既存:

```text
PATCH /api/tickets/:id
```

を利用して構いません。

例:

```json
{
  "status": "in_progress"
}
```

Kanban専用APIを増やす必要はありません。

---

# 30. Optimistic UI

Kanban status変更で可能ならOptimistic Updateを実装してください。

ただしAPI失敗時:

```text
元statusへ戻す
+
Error表示
```

を必須としてください。

Server stateを最終的な正としてください。

---

# 31. Ticket一覧画面

画面:

```text
/projects/:projectId/tickets
```

最低限表示:

```text
Title
Status
Priority
Type
Assignee
Due Date
Updated At
```

---

# 32. Ticket一覧Filter UI

最低限:

```text
Status
Priority
Type
Assignee
Search
```

Filter変更時に一覧へ反映してください。

---

# 33. Ticket作成UI

```text
/projects/:projectId/tickets/new
```

またはModal。

入力:

```text
title
description
type
priority
assignee
dueDate
```

Submit中:

```text
button disabled
loading
```

二重登録を防止してください。

---

# 34. Ticket詳細画面

```text
/tickets/:id
```

最低限:

```text
title
description
status
priority
type
assignee
dueDate
createdBy
createdAt
updatedAt
comments
```

AI連携後に以下を置けるAreaを確保してください。

```text
Source Meeting
AI Evidence
```

Phase 4では空でも構いません。

---

# 35. Ticket編集

owner/member:

```text
編集可
```

viewer:

```text
Read Only
```

UI上も適切に制御してください。

ただしServer Authorizationが最終判断です。

---

# 36. Comment UI

Ticket詳細下部:

```text
Comments
```

表示:

```text
author
content
createdAt
```

owner/memberには:

```text
Comment input
Submit
```

viewerは閲覧のみ。

---

# 37. Ticket削除UI

削除前にConfirmationを表示してください。

例:

```text
このチケットを削除しますか？
```

削除後:

```text
Ticket一覧
```

へ戻してください。

---

# 38. Priority表示

最低限ラベル化してください。

```text
Urgent
High
Medium
Low
```

色はUIガイドライン/既存デザインへ合わせてください。

色だけで意味を伝えず、テキストも表示してください。

---

# 39. Due Date表示

期限切れ:

```text
due_date < today
AND status != done
```

の場合、UI上で識別できるようにしてください。

ただし日付判定はTimezoneを考慮してください。

DBはdate型です。

---

# 40. Empty State

Ticketなし:

```text
まだチケットがありません
最初のチケットを作成
```

Kanban Columnなし:

```text
このステータスのチケットはありません
```

---

# 41. Loading State

最低限:

```text
Ticket list loading
Ticket detail loading
Comment loading
Saving
Deleting
Kanban updating
```

を表現してください。

---

# 42. Error State

適切に処理してください。

```text
401
403
404
422
500
```

内部Stackは表示しないでください。

---

# 43. Service Layer

推奨:

```text
lib/services/
├── ticket-service.ts
└── ticket-comment-service.ts
```

例:

```ts
listTickets(...)
getTicket(...)
createTicket(...)
updateTicket(...)
deleteTicket(...)

listTicketComments(...)
createTicketComment(...)
```

---

# 44. Validator

推奨:

```text
lib/validators/
├── ticket.ts
└── ticket-comment.ts
```

例:

```ts
createTicketSchema
updateTicketSchema
ticketListQuerySchema
createCommentSchema
```

---

# 45. Resource Permission

Phase 2のResource認可を利用してください。

最低限:

```ts
requireTicketViewer(...)
requireTicketMember(...)
```

または:

```text
ticket
↓
project
↓
requireProjectViewer/member
```

としてください。

認可SQL/ロジックを各Routeへコピーしないでください。

---

# 46. Tenant Isolation

最重要です。

Organization A Userが:

```text
Project B Ticket
```

へアクセス不可。

以下すべてで確認してください。

```text
Ticket detail
Ticket update
Ticket delete
Comments
Kanban
```

---

# 47. Assignee Tenant Isolation

User AがProject AのTicketへ:

```text
Organization B User
```

をassigneeとして指定できないこと。

---

# 48. Audit Log

最低限:

```text
ticket.create
ticket.update
ticket.delete
```

重要なStatus変更もticket.updateで構いません。

metadata例:

```json
{
  "changedFields": [
    "status",
    "assigneeId"
  ]
}
```

旧値・新値の全文を保存しすぎないでください。

---

# 49. Ticket API Test

最低限以下を実装してください。

## TKT-T01

ownerがTicket作成。

期待:

```text
201
```

## TKT-T02

memberがTicket作成。

期待:

```text
201
```

## TKT-T03

viewerがTicket作成。

期待:

```text
403
```

## TKT-T04

別Project UserがTicket詳細取得。

期待:

```text
403/404
```

## TKT-T05

memberがTicket更新。

期待:

```text
200
```

## TKT-T06

viewerがTicket更新。

期待:

```text
403
```

## TKT-T07

Ticket削除。

期待:

```text
deleted_at設定
一覧から消える
```

## TKT-T08

不正status。

期待:

```text
400/422
```

## TKT-T09

不正priority。

期待:

```text
400/422
```

## TKT-T10

別Project Userをassignee指定。

期待:

```text
422
```

---

# 50. Comment Test

## CMT-T01

memberがComment作成。

成功。

## CMT-T02

viewerがComment作成。

```text
403
```

## CMT-T03

別Tenant TicketへComment。

拒否。

## CMT-T04

空Comment。

```text
422
```

---

# 51. Kanban Test

## KBN-T01

todo → in_progress

成功。

## KBN-T02

in_progress → done

成功。

## KBN-T03

viewerがDrag/Status変更。

```text
403
```

## KBN-T04

API失敗時Optimistic UI rollback。

元statusに戻る。

---

# 52. Filter Test

最低限:

```text
FILTER-T01 status
FILTER-T02 priority
FILTER-T03 type
FILTER-T04 assignee
FILTER-T05 q
FILTER-T06 複数条件
```

他ProjectのTicketが混入しないことを確認してください。

---

# 53. Pagination Test

最低限:

```text
limit
page/cursor
max limit
total
```

を確認してください。

不正な負数等をrejectしてください。

---

# 54. Security Test

最低限:

```text
SEC-TKT-01
別Tenant Ticket ID

SEC-TKT-02
project_id Mass Assignment

SEC-TKT-03
created_by Mass Assignment

SEC-TKT-04
source_meeting_id Mass Assignment

SEC-TKT-05
別Tenant assignee

SEC-TKT-06
viewer write

SEC-CMT-01
他人Comment編集

SEC-XSS-01
Commentへ<script>

SEC-XSS-02
Ticket descriptionへHTML
```

XSS payloadは文字列として安全に表示してください。

`dangerouslySetInnerHTML`は禁止です。

---

# 55. E2E

最低限以下を実装してください。

```text
Login
↓
Project
↓
Ticket作成
↓
Ticket一覧
↓
Ticket詳細
↓
Ticket編集
↓
Comment投稿
↓
Kanban
↓
Status変更
```

可能なら:

```text
Ticket削除
```

まで確認してください。

---

# 56. Performance

Ticket一覧でN+1を避けてください。

特に:

```text
assignee
createdBy
comment count
```

等で1 TicketごとにQueryしないでください。

必要なJoin/Query構成を設計してください。

---

# 57. Index確認

Phase 1で最低限以下が存在することを確認してください。

```text
tickets(project_id, status)
tickets(project_id, assignee_id)
tickets(project_id, deleted_at)
tickets(due_date)
```

Query実装に必要で不足するIndexがある場合はMigration追加を検討してください。

ただし理由を報告してください。

---

# 58. AI連携への準備

Phase 4ではAI処理を実装しません。

ただし以下は壊さないでください。

```text
source_meeting_id
source_candidate_id
```

後続PhaseでAI候補からTicketを生成できるようにします。

通常ユーザーTicketでは:

```text
NULL
```

とします。

---

# 59. source情報の編集禁止

通常Ticket PATCH APIから:

```text
sourceMeetingId
sourceCandidateId
```

を変更できないようにしてください。

AI連携Serviceだけが設定できる内部Fieldとしてください。

---

# 60. KanbanとTicket一覧の整合

KanbanとTicket一覧で別々のTicket状態を管理しないでください。

唯一の正:

```text
tickets.status
```

としてください。

Kanbanはその表示形式にすぎません。

---

# 61. Client state

不要に巨大なGlobal State Managementを導入しないでください。

Next.js Server Component / Client Componentの責務を考慮し、

```text
server state
form state
temporary UI state
```

を分離してください。

---

# 62. Phase 4推奨ディレクトリ

```text
app/
├── projects/
│   └── [projectId]/
│       ├── tickets/
│       │   ├── page.tsx
│       │   └── new/
│       │       └── page.tsx
│       └── board/
│           └── page.tsx
├── tickets/
│   └── [ticketId]/
│       └── page.tsx
└── api/
    ├── projects/
    │   └── [projectId]/
    │       └── tickets/
    │           └── route.ts
    └── tickets/
        └── [ticketId]/
            ├── route.ts
            └── comments/
                └── route.ts

lib/
├── services/
│   ├── ticket-service.ts
│   └── ticket-comment-service.ts
├── validators/
│   ├── ticket.ts
│   └── ticket-comment.ts
└── permissions/
```

既存構成との整合を優先してください。

---

# 63. Phase 4で実装しないもの

まだ実装しないでください。

```text
Meeting CRUD
Online Meeting
Transcript
Recording
AI Minutes
AI Ticket Candidate
Bedrock実処理
S3 Recording本実装
LiveKit Room
Notification
Billing
External Ticket Integration
Production Deploy
```

---

# 64. セキュリティ禁止事項

絶対に以下をしないでください。

```text
Client projectIdだけで認可
Client roleだけで認可
project_id書換可能
created_by書換可能
source_meeting_id書換可能
source_candidate_id書換可能
別Project Userをassignee可能
物理DELETE
Ticket一覧取得後Client側だけでTenant filter
Raw SQL文字列連結
dangerouslySetInnerHTML
Production DB変更
```

---

# 65. 実装ルール

1. Phase 0〜3コードを最初に確認する。
2. Phase 2 Permission helperを再利用する。
3. Phase 3 Service/Validator/API Response形式に合わせる。
4. Route Handlerを薄くする。
5. Service Layerへ業務ロジックを分離する。
6. Zod validationを利用する。
7. Ticketは論理削除する。
8. Tenant Isolationを最優先する。
9. assigneeのProject Membershipを検証する。
10. Audit Logを記録する。
11. KanbanとTicket一覧で同一DBデータを利用する。
12. AI/Meeting機能を先回り実装しない。
13. Production環境を変更しない。

---

# 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

安全なTest DBが存在する場合はIntegration Testを実行してください。

可能であれば:

```bash
npm run test:e2e
```

---

# Phase 4 Definition of Done

以下をすべて満たした場合のみPhase 4完了としてください。

- Ticket一覧を取得できる
- Ticketを作成できる
- Ticket詳細を取得できる
- Ticketを更新できる
- Ticketを論理削除できる
- owner/memberがTicket更新可能
- viewerはRead Only
- assigneeをProject Memberから設定できる
- 別Project Userをassigneeへ設定できない
- status/type/priority validationがある
- Searchが動作する
- Filterが動作する
- Sortが動作する
- Paginationが動作する
- Commentsを表示できる
- Commentを投稿できる
- Kanban Boardが表示できる
- Kanbanからstatus変更できる
- API失敗時にUI stateが破綻しない
- Ticket/CommentのTenant Isolationが成立する
- Mass Assignmentが防止されている
- XSS payloadが安全に表示される
- Audit Logが記録される
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
## Phase 4 Ticket CRUD / Comments / Kanban 実装結果

### 1. Ticket CRUD
- List:
- Create:
- Detail:
- Update:
- Delete:

### 2. Ticket Query
- Search:
- Filter:
- Sort:
- Pagination:

### 3. Assignee
- Project member validation:
- Tenant isolation:

### 4. Comments
- List:
- Create:
- Update:
- Delete:

### 5. Kanban
- Columns:
- Status update:
- Drag & Drop:
- Optimistic update:
- Rollback:

### 6. Authorization
- owner:
- member:
- viewer:

### 7. Tenant Isolation
- Ticket:
- Comments:
- Assignee:

### 8. Audit
- ticket.create:
- ticket.update:
- ticket.delete:
- comments:

### 9. Security
- Mass Assignment:
- XSS:
- Raw SQL:
- source field protection:
- Production変更:

### 10. Test
- TKT-T01〜:
- CMT-T01〜:
- KBN-T01〜:
- FILTER:
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

### 14. 未実施・未解決事項
- ...

### 15. Phase 5への引継ぎ
- ...
```

既存コード・設計書から合理的に判断できる事項は質問せず実装してください。

ただし、Production DB変更、Production Migration、Production Secret、課金を伴う外部サービス操作が必要な場合は実行せず、Local/Test環境で実装可能な範囲まで完成させてください。