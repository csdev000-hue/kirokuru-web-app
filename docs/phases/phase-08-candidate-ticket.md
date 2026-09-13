あなたはトランザクション設計、DB整合性、バックエンド、セキュリティに精通したシニアフルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 8を実装してください。

# Phase 8の目的

Phase 8では、Phase 7でHuman Reviewを通過し`approved`となった`ticket_candidates`を、正式な`tickets`へ登録します。

完成フローは以下です。

```text
Meeting
↓
Transcript
↓
Approved Minutes
↓
AI Ticket Candidate
↓
Human Review
↓
Candidate Approved
↓
Transaction
├─ Ticket INSERT
├─ source_candidate_id設定
├─ source_meeting_id設定
└─ Candidate status = registered
↓
正式Ticket
```

本Phaseで最も重要なのは以下です。

```text
1 Candidate
=
最大1 Ticket
```

二重クリック、API再送、並列Request、Retry等が発生しても、同一Candidateから複数Ticketを作成してはいけません。

---

# 最重要原則

必ず以下を守ってください。

```text
AI
↓
Candidate
↓
Human Approval
↓
Server-side validation
↓
Transaction
↓
Ticket
```

禁止:

```text
AI
↓
Ticket
```

または:

```text
pending Candidate
↓
Ticket
```

必ず:

```text
candidate.status = approved
```

であることを確認してください。

---

# 前提

Phase 0〜7が完了している前提です。

最低限以下が存在します。

```text
tickets
ticket_candidates
meetings
meeting_minutes
meeting_transcripts
projects
project_members
users
audit_logs
```

Phase 4:

```text
Ticket CRUD
Ticket Permission
Ticket Service
```

Phase 7:

```text
Ticket Candidate
Candidate Approve
Candidate Reject
Candidate Permission
```

が利用可能であること。

---

# ticket_candidates

重要カラム:

```text
id
project_id
meeting_id
minutes_id

title
description

type
priority

assignee_id
due_date

source_transcript_ids
source_quote
confidence

status
registered_ticket_id

ai_model
prompt_version
schema_version
```

status:

```text
pending
approved
rejected
registered
```

---

# tickets

重要カラム:

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

# Phase 8実装範囲

以下を実装してください。

```text
1. Candidate → Ticket登録API
2. Candidate登録前Validation
3. Transaction
4. Candidate row lock / concurrency control
5. 二重登録防止
6. Idempotency
7. Ticket Field Mapping
8. Candidate status transition
9. registered_ticket_id更新
10. source_candidate_id設定
11. source_meeting_id設定
12. Traceability
13. Audit Log
14. UI登録操作
15. 登録済みTicket Link
16. Bulk登録
17. Bulk Transaction方針
18. Error handling
19. Tenant Isolation
20. Security Test
21. Concurrency Test
22. Integration Test
23. E2E
```

---

# 1. 正式Ticket登録API

以下を実装してください。

推奨:

```text
POST /api/ticket-candidates/:id/register
```

または既存API詳細設計に合わせてください。

Phase 7のapprove APIとは明確に分離してください。

```text
POST /approve
→ Candidate承認

POST /register
→ 正式Ticket登録
```

です。

---

# 2. Register Permission

正式Ticket登録可能:

```text
Project owner
Project member
```

viewer:

```text
403
```

必ず:

```text
candidateId
↓
candidate.project_id
↓
requireProjectMember
```

で認可してください。

ClientからprojectIdを受け取って認可してはいけません。

---

# 3. Register Preconditions

登録前に最低限以下を確認してください。

```text
Candidate exists
Candidate belongs Project
Candidate belongs Meeting
Candidate status = approved
registered_ticket_id IS NULL
Project exists
Meeting exists
Assignee valid/null
Title valid
Type valid
Priority valid/null
Due Date valid/null
```

---

# 4. Pending Candidate禁止

以下:

```text
status = pending
```

から正式Ticket登録してはいけません。

期待:

```text
409
```

または:

```text
TICKET_CANDIDATE_NOT_APPROVED
```

---

# 5. Rejected Candidate禁止

```text
status = rejected
```

の場合も登録禁止です。

期待:

```text
409
```

---

# 6. Registered Candidate

すでに:

```text
status = registered
```

または:

```text
registered_ticket_id IS NOT NULL
```

の場合、新規Ticketを作成してはいけません。

ここが最重要です。

---

# 7. Ticket Mapping

CandidateからTicketへ以下をMappingしてください。

```text
ticket.project_id
← candidate.project_id

ticket.title
← candidate.title

ticket.description
← candidate.description

ticket.type
← candidate.type

ticket.priority
← candidate.priority

ticket.assignee_id
← candidate.assignee_id

ticket.due_date
← candidate.due_date

ticket.source_meeting_id
← candidate.meeting_id

ticket.source_candidate_id
← candidate.id
```

---

# 8. Ticket Status初期値

正式Ticket登録時:

```text
status = todo
```

を基本としてください。

CandidateからstatusをAI生成しないでください。

---

# 9. created_by

Ticketの:

```text
created_by
```

は正式登録を実行したHuman User:

```text
currentUser.id
```

としてください。

AIやCandidate作成者ではありません。

---

# 10. Priority NULL対応

Candidate:

```text
priority = null
```

の可能性があります。

tickets.priorityがNOT NULLの場合は、正式登録前にHuman Reviewで必須入力とすることを推奨します。

つまり登録APIでは:

```text
candidate.priority == null
→ 422
```

例:

```text
TICKET_PRIORITY_REQUIRED
```

としてください。

勝手に:

```text
medium
```

へ補完しないでください。

---

# 11. Type Mapping

Candidate type:

```text
task
issue
followup
```

はTicket typeへそのままMapping可能です。

Ticket typeには:

```text
decision
```

も存在しますが、Candidateからdecisionは生成しない方針を維持してください。

---

# 12. Assignee再検証

Phase 7でValidation済みでも、正式登録直前に再確認してください。

```text
candidate.assignee_id
↓
Project Member
```

を確認。

なぜならPhase 7承認後にProject Memberから削除されている可能性があるためです。

不正:

```text
422
INVALID_ASSIGNEE
```

---

# 13. Due Date Validation

正式登録時も:

```text
YYYY-MM-DD
```

として有効か確認してください。

過去日付を禁止する必要はありません。

会議時点ですでに期限超過しているAction Itemも存在し得ます。

---

# 14. Candidate Evidence

Candidate EvidenceはTicketへ全文コピーする必要はありません。

Ticketは:

```text
source_candidate_id
source_meeting_id
```

からTrace可能にしてください。

Evidence本体の正:

```text
ticket_candidates
```

としてください。

---

# 15. Transaction

正式Ticket登録は必ずTransactionで実装してください。

最低限:

```text
BEGIN

1. Candidate取得 + lock
2. status再確認
3. registered_ticket_id確認
4. Assignee等Validation
5. tickets INSERT
6. candidate.status = registered
7. candidate.registered_ticket_id = ticket.id
8. Audit Log

COMMIT
```

途中失敗:

```text
ROLLBACK
```

としてください。

---

# 16. Transaction外でTicketを作らない

禁止:

```text
Ticket INSERT
↓
Transaction開始
↓
Candidate更新
```

TicketとCandidate更新は同じTransactionへ含めてください。

---

# 17. Candidate Lock

並列Requestに対応してください。

推奨:

```text
SELECT candidate
FOR UPDATE
```

相当を利用してください。

Drizzle / Neon / PostgreSQLで適切なrow lock方法を使用してください。

---

# 18. Concurrency Scenario

同一Candidateへ同時に:

```text
Request A
POST /register

Request B
POST /register
```

が到達した場合でも:

```text
Ticket 1件
```

だけ作成してください。

---

# 19. 二重登録防止

最低でも以下を組み合わせてください。

```text
Transaction
+
Row Lock
+
registered_ticket_id check
+
status check
```

可能ならDB Constraintも追加してください。

---

# 20. DB Unique Constraint

Phase 1で:

```text
tickets.source_candidate_id
```

がuniqueでない場合、以下を強く推奨します。

```text
UNIQUE(tickets.source_candidate_id)
WHERE source_candidate_id IS NOT NULL
```

PostgreSQL Partial Unique Index等を利用してください。

これによりApplication Bugがあっても:

```text
1 Candidate
→ 複数Ticket
```

をDB側で防止できます。

---

# 21. Migration

必要であればMigrationを追加してください。

例:

```sql
CREATE UNIQUE INDEX ...
ON tickets(source_candidate_id)
WHERE source_candidate_id IS NOT NULL;
```

ただしPhase 1 Schemaとの差分として必ず報告してください。

Production Migrationは実行しないでください。

---

# 22. registered_ticket_id FK

Phase 1で:

```text
ticket_candidates.registered_ticket_id
```

にFKがない場合、循環参照設計を確認してください。

可能なら:

```text
registered_ticket_id
→ tickets.id
```

FKを追加してください。

ただし:

```text
tickets.source_candidate_id
↔
ticket_candidates.registered_ticket_id
```

の循環によるMigration問題がある場合は、安全な片方向FK + Unique Constraintでも構いません。

無理に循環FKを作らないでください。

理由を報告してください。

---

# 23. Source Candidate Integrity

正式Ticket:

```text
tickets.source_candidate_id
```

はClientから指定不可です。

Register Serviceだけが設定できる内部Fieldとしてください。

Phase 4通常Ticket PATCH APIから変更できない方針を維持してください。

---

# 24. Source Meeting Integrity

同様に:

```text
tickets.source_meeting_id
```

もCandidateから内部設定してください。

Client指定不可。

---

# 25. Ticket Traceability

正式Ticketから最低限以下を辿れるようにしてください。

```text
Ticket
↓
Ticket Candidate
↓
Minutes
↓
Meeting
↓
Transcript Evidence
```

---

# 26. Ticket Detail API拡張

Phase 4のTicket詳細Responseを必要に応じて拡張してください。

AI由来Ticketの場合:

```json
{
  "source": {
    "meetingId": "...",
    "candidateId": "...",
    "minutesId": "..."
  }
}
```

等を返して構いません。

ただし余計なAI raw dataは返さないでください。

---

# 27. Source UI

Ticket詳細画面へAI由来の場合のみ:

```text
このチケットは会議から生成されました
```

を表示してください。

最低限リンク:

```text
Meeting
AI Candidate
Minutes
```

を表示可能にしてください。

---

# 28. Evidence UI

Ticket詳細から:

```text
Candidate
↓
Evidence
↓
Transcript
```

へ辿れるようにしてください。

EvidenceそのものをTicketへ複製しなくて構いません。

---

# 29. Register Service

推奨:

```text
lib/services/
└── ticket-registration-service.ts
```

例:

```ts
registerTicketCandidate({
  candidateId,
  userId,
})
```

---

# 30. Register Service責務

```text
Candidate取得
↓
Authorization
↓
Transaction
↓
Lock
↓
Status確認
↓
registered_ticket_id確認
↓
Business Validation
↓
Ticket INSERT
↓
Candidate UPDATE
↓
Audit
↓
Result
```

---

# 31. Phase 4 Ticket Service再利用

可能な範囲でPhase 4のTicket Validation/Field共通処理を再利用してください。

ただし通常:

```text
createTicket()
```

をそのまま呼ぶと、

```text
source_candidate_id
source_meeting_id
```

を設定できない場合があります。

必要なら:

```text
createTicketFromCandidate()
```

等の内部専用Serviceを用意してください。

通常User Ticket作成APIとAI Candidate登録処理を混同しないでください。

---

# 32. API Response

初回登録成功:

```text
201 Created
```

例:

```json
{
  "data": {
    "ticketId": "ticket-uuid",
    "candidateId": "candidate-uuid",
    "status": "registered"
  },
  "requestId": "..."
}
```

既存API envelopeを優先してください。

---

# 33. Idempotency方針

同一Candidateへ同じRegister Requestが再送された場合の挙動を明確にしてください。

推奨:

```text
Candidate already registered
+
registered_ticket_id exists
```

なら:

```text
既存Ticket IDを返す
```

ことでIdempotentにできます。

---

# 34. Idempotent Response

例:

1回目:

```text
201
```

2回目:

```text
200
```

既存Ticketを返す。

または両方200でも構いません。

一貫した方針にしてください。

重要:

```text
2回目で新Ticketを作らない
```

ことです。

---

# 35. 409方式

以下の方針でも構いません。

```text
already registered
→ 409
```

ただしUI RetryやNetwork再送を考慮すると、既存Ticket IDを返すIdempotent方式を推奨します。

既存API設計との整合を優先してください。

---

# 36. Idempotency Key

必要であれば:

```text
Idempotency-Key
```

Headerを将来導入可能な構造にしてください。

ただしPhase 8ではCandidate ID自体が自然なIdempotency Keyとなるため、過剰実装は不要です。

---

# 37. Candidate status update

Ticket作成成功後のみ:

```text
candidate.status = registered
```

としてください。

---

# 38. registered_ticket_id

同Transaction内で:

```text
candidate.registered_ticket_id = ticket.id
```

を設定してください。

---

# 39. Ticket Insert失敗

Ticket INSERT失敗時:

```text
candidate.status
```

をregisteredへ変更してはいけません。

Transaction rollbackしてください。

---

# 40. Candidate Update失敗

Ticket INSERT成功後にCandidate updateが失敗した場合も:

```text
Ticket INSERT
```

をrollbackしてください。

正式Ticketだけ存在する不整合を作らないでください。

---

# 41. Audit失敗

Audit LogをTransactionに含めるか判断してください。

推奨:

重要なTraceability上:

```text
ticket.register
```

Auditは同Transactionへ含めても構いません。

ただしAudit障害で本処理を止めるかは既存Audit方針へ合わせてください。

選択理由を報告してください。

---

# 42. Audit Log

最低限:

```text
ticket_candidate.register
ticket.create.from_candidate
```

のどちらか、または双方を記録してください。

---

# 43. Audit metadata

例:

```json
{
  "candidateId": "...",
  "ticketId": "...",
  "meetingId": "...",
  "minutesId": "..."
}
```

AI本文やTranscript全文を保存しないでください。

---

# 44. registered stateの編集

registered Candidateは:

```text
Read Only
```

としてください。

Phase 7のPATCH Candidateから編集できないことを再確認してください。

---

# 45. Registered Candidate Reject禁止

```text
registered
↓
rejected
```

は禁止です。

正式Ticketが不要になった場合はTicket側の論理削除等で管理してください。

Candidate履歴を改ざんしないでください。

---

# 46. Registered Candidate Approve

すでにregisteredの場合:

```text
approve
```

APIも変更を行わないようにしてください。

---

# 47. Human Review UI

Phase 7 Candidate Review画面でapproved Candidateに:

```text
正式チケットとして登録
```

ボタンを追加してください。

---

# 48. Register Button Permission

表示:

```text
owner
member
```

viewer:

```text
非表示 / disabled
```

ただしServer側認可が最終判断です。

---

# 49. Pending Candidate

pending状態では:

```text
正式チケットとして登録
```

ボタンを表示しないでください。

---

# 50. Rejected Candidate

rejectedでも表示しない。

---

# 51. Approved Candidate

approvedのみ:

```text
正式チケットとして登録
```

を表示してください。

---

# 52. Registered Candidate UI

登録後:

```text
登録済み
```

表示。

さらに:

```text
正式チケットを見る
```

リンクを表示してください。

---

# 53. Register Loading

クリック後:

```text
登録中...
```

Button disabled。

二重クリックを防止してください。

ただしServer側Concurrency対策は必須です。

---

# 54. API失敗

UIで安全なErrorを表示してください。

例:

```text
チケットの登録に失敗しました。
```

requestIdを問い合わせ用に表示しても構いません。

内部SQL Error等は表示しないでください。

---

# 55. Network Retry

ClientでTimeout後、ユーザーが再度押しても:

```text
既存Ticket
```

へ到達できるIdempotent設計を推奨します。

---

# 56. Bulk Registration

以下を実装してください。

```text
POST /api/ticket-candidates/bulk-register
```

または:

```text
POST /api/tickets/bulk
```

既存API詳細設計に合わせてください。

---

# 57. Bulk Request

例:

```json
{
  "candidateIds": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ]
}
```

上限:

```text
例: 50件
```

等を設定してください。

無制限件数は禁止です。

---

# 58. Bulk対象

すべて:

```text
approved
```

であること。

同一Projectに限定することを推奨します。

複数Projectを混ぜると認可・Transactionが複雑になります。

---

# 59. Bulk Transaction方針

MVP推奨:

```text
All or Nothing
```

です。

つまり:

```text
Candidate A OK
Candidate B OK
Candidate C invalid
```

の場合:

```text
全件Rollback
```

としてください。

---

# 60. Bulk Lock

Candidate IDを一定順序でlockしてください。

例:

```text
ORDER BY id
FOR UPDATE
```

等。

複数並列Bulk処理でDeadlockリスクを減らしてください。

---

# 61. Bulk Duplicate

Input:

```text
candidate A
candidate A
```

が2回含まれていた場合はValidation Errorにしてください。

---

# 62. Bulk already registered

一部Candidateが既にregisteredの場合の方針を明確にしてください。

MVP推奨:

```text
All-or-Nothingなので409
```

です。

単体RegisterのIdempotent挙動とは分けても構いません。

---

# 63. Bulk Ticket作成

すべてのCandidateをValidationした後にTicket INSERTしてください。

途中までTicketを作ってからValidationしないでください。

---

# 64. Bulk Audit

1 CandidateずつAuditを書くか:

```text
ticket.bulk_register
```

+ candidate IDsを必要最小限記録するか選択してください。

監査上、最終的にCandidate→Ticket対応を追えることが重要です。

---

# 65. Error Code

最低限以下を定義してください。

```text
TICKET_CANDIDATE_NOT_FOUND

TICKET_CANDIDATE_NOT_APPROVED

TICKET_CANDIDATE_ALREADY_REGISTERED

TICKET_CANDIDATE_INVALID_STATUS

TICKET_PRIORITY_REQUIRED

INVALID_ASSIGNEE

TICKET_REGISTRATION_CONFLICT

TICKET_REGISTRATION_FAILED

BULK_REGISTRATION_INVALID
```

---

# 66. HTTP Status

例:

```text
NOT_FOUND
→ 404

NOT_APPROVED
→ 409

ALREADY_REGISTERED
→ 200 existing resource
または 409

PRIORITY_REQUIRED
→ 422

INVALID_ASSIGNEE
→ 422

CONFLICT
→ 409

INTERNAL FAILURE
→ 500
```

既存共通Error仕様を優先してください。

---

# 67. Tenant Isolation

Organization A Userが:

```text
Organization B Candidate
```

を正式Ticket登録できないこと。

以下:

```text
single register
bulk register
ticket source lookup
```

すべてで確認してください。

---

# 68. Candidate Project改ざん

Clientから:

```json
{
  "projectId": "attacker-project"
}
```

を受け取る必要はありません。

Candidate IDからDB上のproject_idを取得してください。

---

# 69. Ticket Field Mass Assignment

Register APIではCandidate ID以外を原則受け取らないでください。

禁止:

```json
{
  "candidateId": "...",
  "title": "改ざん",
  "createdBy": "...",
  "sourceCandidateId": "...",
  "status": "done"
}
```

正式登録内容はApproved Candidateから取得してください。

---

# 70. Candidate承認後の値

Approve後CandidateはRead Onlyなので、登録時はDBのCandidate値を使ってください。

Clientが送ったCandidate表示値をTicketへコピーしてはいけません。

---

# 71. Security Boundary

正:

```text
DB Candidate
```

誤:

```text
Browserに表示されているCandidate object
```

です。

---

# 72. Ticket Source保護

Phase 4の通常Ticket Update APIから:

```text
sourceCandidateId
sourceMeetingId
```

を変更できないことを再テストしてください。

---

# 73. Ticket削除

AI由来TicketもPhase 4と同じ:

```text
logical delete
```

を利用してください。

Ticket削除時にCandidate statusをrejectedへ戻したりしないでください。

Traceabilityを維持してください。

---

# 74. Candidateと削除Ticket

正式Ticketが論理削除された場合も:

```text
candidate.status = registered
```

のままとしてください。

Candidateは「正式Ticket登録済みだった」という履歴です。

---

# 75. 再登録禁止

正式Ticketが削除されたからといって:

```text
Candidate
↓
別Ticket
```

を再生成しないでください。

1 Candidate = 1 Ticketの原則を維持してください。

---

# 76. Ticket復元

将来Ticket Restore機能を追加する場合も、Candidateから再登録するのではなく既存Ticketのdeleted_atを戻す設計にしてください。

Phase 8ではRestore実装不要です。

---

# 77. Concurrency Test

最低限以下を実装してください。

## REG-CON-01

同一Candidateへ2並列Register。

期待:

```text
Ticket count = 1
registered_ticket_id = same ticket
```

---

# 78. REG-CON-02

10並列Register。

期待:

```text
Ticket count = 1
```

可能なTest DBで実行してください。

---

# 79. REG-CON-03

ApproveとRegister同時。

RegisterがCandidate lock取得時にstatusを確認し、安全に処理してください。

Approved確定前ならRegister失敗。

---

# 80. REG-CON-04

RegisterとReject同時。

registered/rejected両方になる不整合を作らないでください。

状態遷移更新にもlock/条件付きUPDATEを利用してください。

---

# 81. Transaction Test

## REG-T01

正常Candidate登録。

期待:

```text
Ticket作成
Candidate registered
registered_ticket_id設定
```

---

# 82. REG-T02

pending Candidate。

```text
Ticketなし
Candidate pending
```

---

# 83. REG-T03

rejected Candidate。

Ticketなし。

---

# 84. REG-T04

Assignee無効。

```text
Rollback
Ticketなし
Candidate approvedのまま
```

---

# 85. REG-T05

Ticket INSERT failure。

期待:

```text
Candidate registeredにならない
```

---

# 86. REG-T06

Candidate UPDATE failure。

期待:

```text
Ticket INSERTもRollback
```

---

# 87. REG-T07

既登録Candidate再送。

期待:

```text
新Ticketなし
既存Ticket ID
```

---

# 88. DB Constraint Test

Unique source_candidate_idを追加した場合:

```text
同一source_candidate_idで2 Ticket INSERT
```

をDBが拒否すること。

---

# 89. Bulk Test

## BULK-T01

3件Approved Candidate。

期待:

```text
3 Ticket
全Candidate registered
```

---

# 90. BULK-T02

1件pending混在。

期待:

```text
0 Ticket
全Rollback
```

---

# 91. BULK-T03

別Project Candidate混在。

期待:

```text
422/403
0 Ticket
```

---

# 92. BULK-T04

Duplicate ID。

期待:

```text
422
```

---

# 93. BULK-T05

一部既登録。

All-or-Nothing方針なら:

```text
409
新規作成なし
```

---

# 94. Authorization Test

## REG-AUTH-01

owner登録。

成功。

## REG-AUTH-02

member登録。

成功。

## REG-AUTH-03

viewer登録。

```text
403
```

## REG-AUTH-04

別Tenant User。

```text
403/404
```

---

# 95. Security Test

最低限:

```text
SEC-REG-01
pending Candidate register

SEC-REG-02
rejected Candidate register

SEC-REG-03
cross tenant Candidate

SEC-REG-04
Client title改ざん

SEC-REG-05
Client status指定

SEC-REG-06
Client sourceCandidateId指定

SEC-REG-07
Client createdBy指定

SEC-REG-08
Invalid assignee after approval

SEC-REG-09
Repeated register

SEC-REG-10
Parallel register
```

---

# 96. Traceability Test

正式Ticketから:

```text
source_candidate_id
```

を取得。

そこから:

```text
minutes_id
meeting_id
source_transcript_ids
```

を辿れることを確認してください。

---

# 97. Ticket Detail E2E

E2E:

```text
Login
↓
Meeting
↓
Approved Minutes
↓
Approved Candidate
↓
正式チケットとして登録
↓
Ticket Detail
↓
Source Meeting確認
↓
Candidate確認
↓
Transcript Evidence確認
```

---

# 98. Register後Kanban

登録したTicketは:

```text
status = todo
```

なのでPhase 4 Kanbanの:

```text
TODO
```

Columnに表示されることを確認してください。

---

# 99. Register後Ticket一覧

Phase 4 Ticket一覧にも即時表示されること。

AI専用Ticket一覧を別に作らないでください。

正式Ticket化後は通常Ticketと同じ`tickets`テーブルを正とします。

---

# 100. AI由来表示

通常Ticketと区別可能にする場合:

```text
AI Generated
```

ではなく、

```text
会議から作成
```

等のTraceabilityラベルを推奨します。

AIが完全自動作成したように誤解させないためです。

---

# 101. Recommended Directory

以下に近い構成を推奨します。

```text
lib/
├── services/
│   ├── ticket-registration-service.ts
│   └── ticket-service.ts
│
└── validators/
    └── ticket-registration.ts

app/
└── api/
    ├── ticket-candidates/
    │   └── [candidateId]/
    │       └── register/
    │           └── route.ts
    │
    └── tickets/
        └── bulk/
            └── route.ts
```

既存構成との整合を優先してください。

---

# 102. Validator

Single RegisterではRequest Body不要でも構いません。

Bulk:

```ts
const bulkRegisterSchema = z.object({
  candidateIds: z
    .array(z.string().uuid())
    .min(1)
    .max(50)
})
```

等を実装してください。

Duplicate IDも検証してください。

---

# 103. Transaction Isolation

PostgreSQL/Neonで適切なTransaction Isolationを利用してください。

Candidate row lockを利用する場合、無闇にSerializableへ上げる必要はありません。

安全性と性能のバランスを考慮してください。

---

# 104. Deadlock対策

Bulk lock時は毎回同じ順序でCandidateをlockしてください。

例えば:

```text
candidateId ASC
```

です。

---

# 105. Timeout

Transaction中に外部サービスを呼び出さないでください。

禁止:

```text
BEGIN
↓
Bedrock呼び出し
↓
Ticket INSERT
```

Phase 8ではAI呼び出し不要です。

DB Transactionを短く保ってください。

---

# 106. DB Query削減

Transaction開始前に可能なValidationを行っても構いませんが、最終状態:

```text
status
registered_ticket_id
assignee membership
```

等はTransaction内で再検証してください。

---

# 107. Monitoring

最低限以下をLog/Metricで追跡可能にしてください。

```text
requestId
candidateId
ticketId
projectId

registration result
durationMs

idempotentHit
conflict
```

---

# 108. Security Logging

失敗時にCandidate本文やTicket description全文をログへ出さないでください。

---

# 109. Audit

正式登録は非常に重要な操作なので必ずAudit対象にしてください。

例:

```text
ticket.register_from_candidate
```

---

# 110. Human Actor

Auditの:

```text
user_id
```

は登録操作を実行したHuman Userです。

AIやSystem Userにしないでください。

---

# 111. Phase 8で実装しないもの

まだ以下を実装しないでください。

```text
S3 Recording Upload
LiveKit
WebRTC
Speech-to-Text
Async Worker
SQS
Lambda
Notification
External Jira/Backlog/GitHub Issues連携
Billing
Production Deploy
```

Phase 8は:

```text
Approved Candidate
↓
Formal Ticket
```

に集中してください。

---

# 112. セキュリティ禁止事項

絶対に以下をしないでください。

```text
pending CandidateからTicket登録
rejected CandidateからTicket登録

Client Candidate DataをそのままTicket INSERT

Client createdByを信用
Client sourceMeetingIdを信用
Client sourceCandidateIdを信用

Transactionなし登録

Row Lock/競合対策なし登録

同一Candidateから複数Ticket

登録済みCandidateの再登録

Candidate statusだけregisteredでTicketなし

Ticketだけ存在してCandidate approvedのまま

Cross Tenant Candidate登録

Invalid assignee登録

AI呼び出しをDB Transaction内で実行

registered Candidate編集

Production DB変更
Production Migration
Production Deploy
```

---

# 113. 実装ルール

1. Phase 0〜7コードを最初に確認する。
2. Phase 4 Ticket Service/Validationを再利用する。
3. Phase 7 Candidate Service/Permissionを再利用する。
4. Candidate IDを唯一の登録元とする。
5. DB Candidate Dataを正とする。
6. Approved Candidateのみ登録可能とする。
7. Transactionを必須とする。
8. Candidate row lockまたは同等の競合制御を実装する。
9. DB Unique Constraintによる二重登録防止を推奨する。
10. Ticket INSERTとCandidate updateを同Transactionにする。
11. registered_ticket_idを同Transactionで設定する。
12. source_candidate_id/source_meeting_idを内部設定する。
13. 登録直前にAssigneeを再検証する。
14. Register APIをIdempotentにすることを推奨する。
15. BulkはAll-or-Nothingを基本とする。
16. Audit Logを必ず記録する。
17. Traceabilityを維持する。
18. Phase 9以降へ先回りしない。
19. Production環境を変更しない。

---

# 114. 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Test DBが安全に利用可能なら:

```bash
npm run test:integration
```

E2E:

```bash
npm run test:e2e
```

Concurrency Testは可能なTest DB上で実際に並列実行してください。

---

# 115. Phase 8 Definition of Done

以下をすべて満たした場合のみPhase 8完了としてください。

- approved Candidateのみ正式Ticket化できる
- pending Candidateを登録できない
- rejected Candidateを登録できない
- Candidate登録APIが存在する
- owner/memberのみ登録できる
- viewerは登録できない
- Candidate IDからDB上の値を取得してTicketを作成する
- ClientのTicket内容を信用していない
- Ticket statusがtodoで作成される
- created_byがHuman Actorになる
- priority nullを安全に処理する
- assigneeを正式登録直前に再検証する
- source_candidate_idを設定する
- source_meeting_idを設定する
- TicketとCandidate更新が同一Transaction
- Candidate row lockまたは同等のConcurrency対策がある
- 同一Candidateから複数Ticketを作れない
- DB Unique Constraint等で二重登録をDefense in Depthしている
- registered_ticket_idが設定される
- Candidate statusがregisteredになる
- Transaction途中失敗時にRollbackされる
- 再送で新しいTicketを作らない
- Bulk登録が安全に動作する
- Bulk処理がAll-or-Nothing
- Cross Tenant登録を防止する
- registered CandidateはRead Only
- TicketからCandidate/Minutes/Meeting/Transcriptへ追跡できる
- Ticket詳細からSourceを確認できる
- 登録TicketがKanban TODOへ表示される
- Audit Logが記録される
- Parallel Register Testが成功
- Transaction Testが成功
- Tenant Isolation Testが成功
- Mass Assignment Testが成功
- lint成功
- typecheck成功
- test成功
- build成功
- E2E成功または未実施理由が明確
- Production環境を変更していない

---

# 116. 作業終了時報告形式

以下の形式で必ず報告してください。

```text
## Phase 8 Candidate → Ticket Registration 実装結果

### 1. Registration API
- Single:
- Bulk:
- Permission:
- Idempotency:

### 2. Preconditions
- Candidate status:
- registeredTicketId:
- Priority:
- Assignee:
- Project:
- Meeting:

### 3. Mapping
- title:
- description:
- type:
- priority:
- assignee:
- dueDate:
- status:
- createdBy:
- sourceMeetingId:
- sourceCandidateId:

### 4. Transaction
- Candidate lock:
- Ticket insert:
- Candidate update:
- Audit:
- Rollback:

### 5. 二重登録防止
- Row lock:
- registered_ticket_id:
- status:
- DB unique constraint:
- parallel request:

### 6. Idempotency
- First request:
- Retry:
- Existing ticket response:

### 7. Bulk
- Max count:
- Same project validation:
- Lock order:
- All-or-Nothing:
- Already registered:
- Duplicate IDs:

### 8. State Transition
- approved → registered:
- pending → registered:
- rejected → registered:
- registered → registered:

### 9. Traceability
- Ticket → Candidate:
- Candidate → Minutes:
- Minutes → Meeting:
- Candidate → Transcript:

### 10. UI
- Register button:
- Loading:
- Registered state:
- Ticket link:
- Source link:

### 11. Authorization / Tenant
- owner:
- member:
- viewer:
- cross tenant:

### 12. Security
- Client candidate data:
- Mass Assignment:
- Invalid assignee:
- Double registration:
- Production変更:

### 13. Audit / Monitoring
- Actor:
- candidateId:
- ticketId:
- requestId:
- idempotentHit:
- conflict:

### 14. Test
- REG-T01〜:
- REG-CON-01〜:
- BULK-T01〜:
- REG-AUTH:
- Security:
- Traceability:
- E2E:

### 15. DB Migration
- Unique source_candidate_id:
- registered_ticket_id FK:
- Other changes:

### 16. 実行結果
- lint:
- typecheck:
- unit:
- integration:
- concurrency:
- e2e:
- build:

### 17. 作成・変更ファイル
- ...

### 18. 未実施・未解決事項
- ...

### 19. Phase 9への引継ぎ
- ...
```

既存コード、要件定義、DB設計書、API詳細設計書、画面詳細設計書、AI Prompt/JSON Schema設計書、テスト詳細設計書、セキュリティ設計書、リリース・運用設計書から合理的に判断できる事項は質問せず実装してください。

ただし以下は実行しないでください。

```text
Production DB Migration
Production DB変更
Production Secret設定
Production Deploy
課金を伴う外部サービス設定
破壊的Production操作
```

Local/Test環境でPhase 8として完成可能な範囲まで実装してください。