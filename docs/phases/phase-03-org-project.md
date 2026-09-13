あなたはシニアフルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 3を実装してください。

# Phase 3の目的

Phase 3では、Phase 0〜2で構築した以下の基盤を利用し、

- Next.js
- TypeScript
- Drizzle ORM
- Neon PostgreSQL
- Auth.js
- Organization / Project Permission
- Tenant Isolation
- Audit Log

OrganizationとProjectのCRUDを実装します。

本Phaseでは、以降のTicket / Meeting / AI機能が利用する「プロジェクト管理の土台」を完成させます。

---

# Phase 3の完成イメージ

```text
Login
↓
Organization一覧
↓
Organization作成
↓
Organization詳細
↓
Project一覧
↓
Project作成
↓
Project詳細
↓
Project更新
```

また、owner / member / viewerの権限に応じて操作を制限してください。

---

# 前提

Phase 2まで完了しており、最低限以下が存在する前提です。

```text
lib/
├── db/
│   ├── client.ts
│   └── schema/
├── auth/
│   ├── config.ts
│   ├── session.ts
│   ├── current-user.ts
│   └── types.ts
├── permissions/
│   ├── organization.ts
│   ├── project.ts
│   ├── resource.ts
│   ├── roles.ts
│   └── errors.ts
└── security/
    └── audit.ts
```

DB:

```text
users
organizations
organization_members
projects
project_members
audit_logs
```

---

# Phase 3実装範囲

以下を実装してください。

```text
1. Organization一覧
2. Organization作成
3. Organization詳細
4. Organization更新
5. Organization削除
6. Organization Member一覧

7. Project一覧
8. Project作成
9. Project詳細
10. Project更新
11. Project削除
12. Project Member一覧

13. API Validation
14. Authorization
15. Audit Log
16. UI
17. Unit / Integration / E2E Test
```

---

# 1. Organization API

以下を実装してください。

```text
GET  /api/organizations
POST /api/organizations
GET  /api/organizations/:id
PATCH /api/organizations/:id
DELETE /api/organizations/:id
```

---

# 2. GET /api/organizations

ログインユーザーが所属するOrganization一覧を返してください。

取得条件:

```text
organization_members.user_id
=
currentUser.id
```

他ユーザーのOrganizationは返してはいけません。

Response例:

```json
{
  "data": [
    {
      "id": "org-uuid",
      "name": "Development Team",
      "role": "owner",
      "createdAt": "2026-09-08T10:00:00Z",
      "updatedAt": "2026-09-08T10:00:00Z"
    }
  ]
}
```

roleはorganization_membersから取得してください。

---

# 3. POST /api/organizations

Organizationを作成します。

Request:

```json
{
  "name": "Development Team"
}
```

Validation:

```text
name
- required
- string
- trim
- 1〜200文字
```

作成時はTransactionを使用してください。

処理:

```text
BEGIN

organizations INSERT
↓
organization_members INSERT
  user_id = currentUser.id
  role = owner

COMMIT
```

Organizationだけ作成されてowner membership作成に失敗する状態を作らないでください。

created_by:

```text
currentUser.id
```

Clientからcreated_byを受け取ってはいけません。

---

# 4. Organization作成Audit

成功時:

```text
action:
organization.create
```

audit_logsへ以下を記録してください。

```text
organization_id
user_id
action
resource_type = organization
resource_id
```

metadataへOrganization全文を保存する必要はありません。

---

# 5. GET /api/organizations/:id

Organization Memberのみ参照可能です。

必ず:

```ts
requireOrganizationMember(...)
```

等の共通Permissionを利用してください。

Response例:

```json
{
  "data": {
    "id": "org-uuid",
    "name": "Development Team",
    "role": "owner",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

別TenantのOrganization内容を返してはいけません。

---

# 6. PATCH /api/organizations/:id

ownerのみ更新可能です。

必ず:

```ts
requireOrganizationOwner(...)
```

を使用してください。

Request:

```json
{
  "name": "New Organization Name"
}
```

更新可能Fieldはnameのみとしてください。

以下をClientから変更できないようにしてください。

```text
id
created_by
created_at
organization membership
role
```

Mass Assignmentを防止してください。

---

# 7. DELETE /api/organizations/:id

ownerのみ実行可能です。

ただし、Organization削除は影響範囲が大きいため、Phase 3では安全側に実装してください。

推奨:

```text
Organization配下にProjectが存在する場合
→ DELETE拒否
```

HTTP:

```text
409 Conflict
```

または業務Error:

```text
ORGANIZATION_NOT_EMPTY
```

ProjectやMeeting、Ticket等をCascadeで全削除しないでください。

Phase 3では物理削除を行う場合も、空Organizationのみ対象にしてください。

---

# 8. Organization Member一覧

以下を実装してください。

```text
GET /api/organizations/:id/members
```

Organization Memberのみ参照可能。

Response例:

```json
{
  "data": [
    {
      "userId": "uuid",
      "name": "田中",
      "email": "tanaka@example.com",
      "role": "owner"
    }
  ]
}
```

Password、Session情報等は絶対に返さないでください。

---

# 9. Member追加・削除について

Phase 3ではMember一覧までを必須とします。

以下は実装しても構いませんが、Scopeを広げすぎる場合はPhase 3.1へ分離してください。

```text
POST   /api/organizations/:id/members
PATCH  /api/organizations/:id/members/:userId
DELETE /api/organizations/:id/members/:userId
```

もし実装する場合:

- ownerのみ操作可能
- 最後のownerを削除できない
- 自分自身を最後のownerから降格できない
- duplicate membershipを作らない

を必ず守ってください。

---

# 10. Project API

以下を実装してください。

```text
GET  /api/projects
POST /api/projects
GET  /api/projects/:id
PATCH /api/projects/:id
DELETE /api/projects/:id
```

必要に応じてOrganization配下APIとして実装しても構いません。

推奨:

```text
GET  /api/organizations/:organizationId/projects
POST /api/organizations/:organizationId/projects
```

既存API詳細設計との整合性を優先してください。

---

# 11. GET Project一覧

ログインユーザーがアクセス可能なProjectのみ返してください。

基本条件:

```text
project_members.user_id = currentUser.id
```

またはOrganization roleとの設計に従ってください。

他OrganizationのProjectを絶対に返さないでください。

Response例:

```json
{
  "data": [
    {
      "id": "project-uuid",
      "organizationId": "org-uuid",
      "name": "AI Project Manager",
      "description": "...",
      "status": "active",
      "role": "owner",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

# 12. POST Project

Project作成にはOrganization Member権限が必要です。

MVP推奨:

```text
Organization owner
→ Project作成可能

Organization member
→ Project作成可能
```

もし既存Permission Matrixがowner限定なら、その設計を優先してください。

重要:

Clientからorganization_idを受け取った場合でも、必ずOrganization MembershipをDBで検証してください。

Request:

```json
{
  "organizationId": "org-uuid",
  "name": "AI Project Manager",
  "description": "Meeting to Ticket automation"
}
```

またはNested Routeの場合:

```text
POST /api/organizations/:organizationId/projects
```

Request:

```json
{
  "name": "AI Project Manager",
  "description": "Meeting to Ticket automation"
}
```

---

# 13. Project作成Transaction

Project作成時はTransactionを使用してください。

```text
BEGIN

projects INSERT
↓
project_members INSERT
  user_id = currentUser.id
  role = owner

COMMIT
```

Projectだけ作られてOwnerが存在しない状態を作らないでください。

status初期値:

```text
active
```

created_by:

```text
currentUser.id
```

---

# 14. Project作成Audit

Audit:

```text
project.create
```

最低限:

```text
organizationId
userId
resourceType = project
resourceId
```

を記録してください。

---

# 15. GET /api/projects/:id

必ずDBからProject IDを取得し、

```ts
requireProjectViewer(...)
```

等を利用してください。

Project詳細Response例:

```json
{
  "data": {
    "id": "uuid",
    "organizationId": "uuid",
    "name": "AI Project Manager",
    "description": "...",
    "status": "active",
    "role": "member",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

# 16. PATCH /api/projects/:id

Project ownerのみProject設定を変更可能としてください。

必須:

```ts
requireProjectOwner(...)
```

Request例:

```json
{
  "name": "AI Project Manager v2",
  "description": "Updated description",
  "status": "active"
}
```

更新可能Field:

```text
name
description
status
```

status:

```text
active
archived
```

以下は変更禁止:

```text
organization_id
created_by
id
created_at
```

---

# 17. Project Archive

Project削除より先にarchivedを活用してください。

通常のユーザー操作では、

```text
status = archived
```

を推奨します。

Archived Project:

```text
- 通常一覧では非表示可能
- 詳細参照は可能
- 新規Ticket/Meeting作成は将来制限
```

---

# 18. DELETE /api/projects/:id

ownerのみ。

ただしProject配下には将来以下が存在します。

```text
tickets
meetings
minutes
candidates
```

そのためPhase 3では安全側に実装してください。

推奨:

```text
関連Ticket/Meetingが存在
→ DELETE拒否
```

または:

```text
DELETE API自体をarchivedへの変更として扱う
```

設計書との整合を確認し、安全な方を選んでください。

Cascade Deleteは禁止です。

---

# 19. Project Member一覧

以下を実装してください。

```text
GET /api/projects/:id/members
```

Project Viewer以上が参照可能。

Response:

```json
{
  "data": [
    {
      "userId": "uuid",
      "name": "田中",
      "email": "tanaka@example.com",
      "role": "owner"
    }
  ]
}
```

---

# 20. Project Member変更

Phase 3必須範囲はMember一覧までです。

余力がある場合のみ以下を実装してください。

```text
POST   /api/projects/:id/members
PATCH  /api/projects/:id/members/:userId
DELETE /api/projects/:id/members/:userId
```

ownerのみ操作可能。

必須ルール:

```text
- 最後のownerを削除しない
- duplicate member禁止
- Organization非所属ユーザーをProjectへ追加しない
- viewer/member/owner以外禁止
```

---

# 21. Request Validation

Zodを使用してください。

推奨構成:

```text
lib/
└── validators/
    ├── organization.ts
    └── project.ts
```

または:

```text
lib/domain/
```

等、既存構成に合わせてください。

---

# 22. Organization Schema

例:

```ts
const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
})
```

Patch:

```ts
const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
}).strict()
```

未知Fieldをどう扱うか統一してください。

推奨:

```text
strict validation
```

---

# 23. Project Validation

Create:

```text
name
- required
- 1〜200

description
- optional
- nullable
- reasonable max length

status
- Client指定不可、またはactiveのみ
```

Update:

```text
name
description
status
```

のみ。

---

# 24. API Response共通形式

既存API詳細設計を優先してください。

例:

Success:

```json
{
  "data": {}
}
```

List:

```json
{
  "data": []
}
```

Error:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission.",
    "requestId": "..."
  }
}
```

APIごとに形式をバラバラにしないでください。

---

# 25. Error Code

最低限以下を利用してください。

```text
UNAUTHENTICATED
FORBIDDEN
RESOURCE_NOT_FOUND
VALIDATION_ERROR

ORGANIZATION_NOT_FOUND
ORGANIZATION_NOT_EMPTY

PROJECT_NOT_FOUND
PROJECT_NOT_EMPTY

MEMBERSHIP_ALREADY_EXISTS
LAST_OWNER_REQUIRED
```

必要なものだけ実装してください。

---

# 26. Authorization

すべてのAPIでPhase 2のPermission helperを利用してください。

禁止:

```text
if (session.user.role === "owner")
```

のみで認可。

必ずDB Membershipを確認してください。

---

# 27. Tenant Isolation

最重要です。

Organization AのUserが、

```text
Organization B
Project B
```

へアクセスできないこと。

URLのIDを書き換えても越境不可であること。

---

# 28. Query設計

一覧QueryではN+1を避けてください。

Organization一覧:

```text
organizations
JOIN organization_members
```

Project一覧:

```text
projects
JOIN project_members
```

必要なFieldだけSELECTしてください。

---

# 29. Pagination

MVPで件数が少ない場合、Organization一覧はPaginationなしでも構いません。

Project一覧は将来拡張を考慮し、

```text
limit
cursor
```

または

```text
page
limit
```

へ拡張可能な構造にしてください。

Phase 3で過剰実装は不要です。

---

# 30. Sort

最低限:

Organization:

```text
created_at DESC
```

Project:

```text
updated_at DESC
```

等、表示順を明示してください。

---

# 31. Organization UI

最低限以下を実装してください。

```text
/organizations
```

表示:

```text
Organization一覧
Organization作成ボタン
```

カードまたはListで構いません。

---

# 32. Organization作成UI

```text
/organizations/new
```

またはModalでも構いません。

入力:

```text
Organization Name
```

処理中:

```text
Submit disabled
Loading indication
```

成功後:

```text
Organization詳細
または
Organization一覧
```

へ遷移してください。

---

# 33. Organization詳細

```text
/organizations/:id
```

最低限表示:

```text
Organization name
User role
Projects
Members
```

ownerの場合のみ:

```text
Edit
```

を表示してください。

ただしUI非表示だけで認可を完結させないでください。

---

# 34. Project一覧UI

Organization詳細内または以下:

```text
/projects
```

でProject一覧を表示してください。

最低限:

```text
Project name
status
role
updatedAt
```

---

# 35. Project作成UI

入力:

```text
name
description
```

statusは初期:

```text
active
```

成功後:

```text
/projects/:id
```

へ遷移してください。

---

# 36. Project詳細UI

```text
/projects/:id
```

表示:

```text
Project name
description
status
current user role
members
```

将来以下のNavigationを置ける構造としてください。

```text
Overview
Tickets
Board
Meetings
Members
Settings
```

Phase 3では空Tabでも構いません。

---

# 37. Project編集

ownerのみUI上で編集ボタンを表示してください。

ただしAPI側でもowner Permission必須。

変更:

```text
name
description
status
```

---

# 38. Loading State

最低限:

```text
Loading
Submit Processing
```

状態を表示してください。

二重Submitを防止してください。

---

# 39. Empty State

Organizationなし:

```text
まだOrganizationがありません
Organizationを作成
```

Projectなし:

```text
まだProjectがありません
新しいProjectを作成
```

---

# 40. Error State

以下を適切に表示してください。

```text
403
404
Validation Error
Server Error
```

内部Stack Traceは表示しないでください。

---

# 41. Audit Log

以下を記録してください。

```text
organization.create
organization.update
organization.delete

project.create
project.update
project.archive
project.delete
```

Member操作を実装した場合:

```text
organization.member.add
organization.member.update
organization.member.remove

project.member.add
project.member.update
project.member.remove
```

---

# 42. Transaction

最低限以下はTransactionを使用してください。

```text
Organization作成
→ Organization + owner membership

Project作成
→ Project + owner membership
```

Member変更で複数DB更新が必要ならTransactionを使用してください。

---

# 43. API Test

最低限以下を実装してください。

## ORG-T01

Organization作成。

期待:

```text
Organization作成成功
作成者がowner
```

## ORG-T02

未認証でOrganization一覧。

期待:

```text
401
```

## ORG-T03

別Organization参照。

期待:

```text
403/404
```

## ORG-T04

memberがOrganization更新。

期待:

```text
403
```

## ORG-T05

ownerがOrganization更新。

期待:

```text
200
```

## ORG-T06

ProjectありOrganization削除。

期待:

```text
409
```

---

# 44. Project API Test

## PRJ-T01

Project作成。

期待:

```text
Project作成成功
作成者Project owner
```

## PRJ-T02

非所属Project参照。

期待:

```text
403/404
```

## PRJ-T03

viewerがProject更新。

期待:

```text
403
```

## PRJ-T04

memberがProject設定更新。

期待:

```text
403
```

## PRJ-T05

ownerがProject更新。

期待:

```text
200
```

## PRJ-T06

status不正値。

期待:

```text
400/422
```

## PRJ-T07

organization_id変更試行。

期待:

```text
反映されない / validation error
```

---

# 45. Tenant Isolation Test

最低限:

```text
TENANT-T01
User A → Organization B
拒否

TENANT-T02
User A → Project B
拒否

TENANT-T03
Organization一覧にBが含まれない

TENANT-T04
Project一覧に他Tenant Projectが含まれない
```

---

# 46. Mass Assignment Test

以下を送信してください。

```json
{
  "name": "Test",
  "createdBy": "attacker-id",
  "organizationId": "other-org",
  "role": "owner"
}
```

期待:

```text
不正Fieldはreject
または無視

権限昇格しない
```

---

# 47. E2E

最低限以下を実装してください。

```text
Login
↓
Organization作成
↓
Organization詳細
↓
Project作成
↓
Project詳細
↓
Project編集
```

可能なら:

```text
Project archive
```

まで確認してください。

---

# 48. Security Test

最低限:

```text
SEC-ORG-01
別Tenant Organization ID

SEC-PRJ-01
別Tenant Project ID

SEC-ROLE-01
viewer write

SEC-ROLE-02
member settings write

SEC-MASS-01
created_by書換

SEC-MASS-02
organization_id書換
```

---

# 49. 推奨ディレクトリ

以下に近い構成にしてください。

```text
app/
├── organizations/
│   ├── page.tsx
│   ├── new/
│   │   └── page.tsx
│   └── [organizationId]/
│       └── page.tsx
├── projects/
│   ├── page.tsx
│   ├── new/
│   │   └── page.tsx
│   └── [projectId]/
│       └── page.tsx
└── api/
    ├── organizations/
    │   ├── route.ts
    │   └── [id]/
    │       ├── route.ts
    │       └── members/
    │           └── route.ts
    └── projects/
        ├── route.ts
        └── [id]/
            ├── route.ts
            └── members/
                └── route.ts

lib/
├── services/
│   ├── organization-service.ts
│   └── project-service.ts
└── validators/
    ├── organization.ts
    └── project.ts
```

ただし既存Phase 0〜2の構成との整合を優先してください。

---

# 50. Route Handler責務

Route Handlerは薄くしてください。

推奨:

```text
Route Handler
↓
Authentication
↓
Validation
↓
Service
↓
Permission
↓
DB
↓
Audit
```

Route Handlerへ巨大なSQLや業務ロジックを書かないでください。

---

# 51. Service Layer

以下のようなServiceを検討してください。

```ts
createOrganization(...)
updateOrganization(...)
deleteOrganization(...)
listOrganizations(...)

createProject(...)
updateProject(...)
archiveProject(...)
deleteProject(...)
listProjects(...)
```

TransactionやAuditをService側で一貫させてください。

---

# 52. Phase 3で実装しないもの

以下はまだ実装しないでください。

```text
Ticket CRUD
Kanban Board本実装
Ticket Comments
Meeting CRUD
Transcript
Recording
AI Minutes
AI Ticket Candidates
Bedrock
S3 Upload本実装
LiveKit会議
Notification
Billing
Production Deploy
```

Phase 4以降へ残してください。

---

# 53. セキュリティ禁止事項

禁止:

```text
Clientのroleだけを信用
ClientのorganizationIdだけで認可
ClientのprojectIdだけで認可
他TenantデータをSELECTしてClientでfilter
Organization削除時の大量Cascade
Project削除時の大量Cascade
created_byをRequestから設定
owner roleをRequestから自由設定
Production DB変更
```

---

# 54. 実装ルール

1. Phase 0〜2の既存コードを最初に確認する。
2. Phase 2 Permission helperを必ず再利用する。
3. APIとUIの両方で権限制御するが、最終判断はServer側で行う。
4. Zod validationを行う。
5. Route Handlerは薄くする。
6. DB操作はServiceへ分離する。
7. N+1を避ける。
8. Transactionが必要な処理は必ずTransaction化する。
9. Audit Logを重要操作で記録する。
10. Tenant Isolation Testを必ず追加する。
11. Production環境を変更しない。
12. Ticket/Meeting実装へ先回りしない。

---

# 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

安全なTest DBが利用可能ならIntegration Testも実行してください。

可能なら:

```bash
npm run test:e2e
```

---

# Phase 3 Definition of Done

以下をすべて満たした場合のみPhase 3完了としてください。

- Organization一覧が取得できる
- Organizationを作成できる
- 作成者がownerになる
- Organization詳細を取得できる
- ownerのみOrganization更新可能
- Organization Member一覧を取得できる
- Project一覧を取得できる
- Projectを作成できる
- 作成者がProject ownerになる
- Project詳細を取得できる
- ownerのみProject設定更新可能
- Projectをarchiveできる
- 別Tenant Organizationへアクセスできない
- 別Tenant Projectへアクセスできない
- Mass Assignmentによる権限昇格ができない
- Organization/Project作成がTransaction化されている
- Audit Logが記録される
- UIにLoading/Empty/Error Stateがある
- API Test成功
- Tenant Isolation Test成功
- E2E成功または未実施理由が明確
- lint成功
- typecheck成功
- test成功
- build成功
- Production環境を変更していない

---

# 作業終了時報告形式

以下の形式で報告してください。

```text
## Phase 3 Organization / Project CRUD 実装結果

### 1. Organization
- List:
- Create:
- Detail:
- Update:
- Delete/Archive:
- Members:

### 2. Project
- List:
- Create:
- Detail:
- Update:
- Delete/Archive:
- Members:

### 3. API
- GET /api/organizations:
- POST /api/organizations:
- GET /api/organizations/:id:
- PATCH /api/organizations/:id:
- DELETE /api/organizations/:id:
- GET /api/projects:
- POST /api/projects:
- GET /api/projects/:id:
- PATCH /api/projects/:id:
- DELETE /api/projects/:id:

### 4. Authorization
- Organization owner:
- Organization member:
- Project owner:
- Project member:
- Project viewer:

### 5. Tenant Isolation
- Organization越境:
- Project越境:
- List漏えい:

### 6. Transaction
- Organization create:
- Project create:

### 7. Audit
- ...

### 8. UI
- Organization一覧:
- Organization詳細:
- Project一覧:
- Project詳細:
- Loading/Empty/Error:

### 9. Test
- ORG-T01〜:
- PRJ-T01〜:
- Tenant:
- Security:
- E2E:

### 10. 実行結果
- lint:
- typecheck:
- unit test:
- integration test:
- e2e:
- build:

### 11. セキュリティ確認
- Mass Assignment:
- Client role信用:
- Client organizationId信用:
- Client projectId信用:
- Production変更:

### 12. 未実施・未解決
- ...

### 13. Phase 4への引継ぎ
- ...
```

既存コード・要件定義・DB設計・API詳細設計・画面詳細設計・セキュリティ設計から合理的に判断できる事項は質問せず実装してください。

ただし、Production DB変更、Production Secret設定、外部サービスへの課金・破壊的操作が必要な場合は実行せず、ローカル/Test環境で完成可能な範囲まで実装してください。