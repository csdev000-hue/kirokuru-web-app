あなたはシニアバックエンド/セキュリティエンジニアとして、「AIプロジェクトマネージャー」のPhase 2を実装してください。

# Phase 2の目的

Phase 2では、Phase 0〜1で構築したNext.js / TypeScript / Drizzle / Neon PostgreSQL基盤の上に、認証・Session・認可・マルチテナント分離の基盤を実装します。

本Phaseの最重要目的は以下です。

```text
Authentication
↓
Session
↓
User
↓
Organization Membership
↓
Project Membership
↓
Resource Authorization
```

以降のOrganization / Project / Ticket / Meeting / AI APIが、すべてこの共通認証・認可基盤を利用できる状態にしてください。

---

# 前提

Phase 0〜1が完了しており、最低限以下が存在する前提です。

```text
lib/
├── db/
│   ├── client.ts
│   └── schema/
│       ├── users.ts
│       ├── organizations.ts
│       ├── projects.ts
│       ├── meetings.ts
│       ├── tickets.ts
│       ├── audit.ts
│       └── index.ts
├── auth/
├── permissions/
└── security/
```

DBには以下が存在します。

```text
users
organizations
organization_members
projects
project_members
```

role:

```text
organization_members.role
- owner
- member

project_members.role
- owner
- member
- viewer
```

---

# 認証方式

MVPではAuth.jsを使用してください。

ただし、将来Cognito等へ変更できるよう、認証情報取得と業務認可を密結合させないでください。

推奨構造:

```text
Auth.js
↓
lib/auth/session.ts
↓
Application User
↓
lib/permissions/*
```

Permission層からAuth.js固有APIを直接大量に呼ばないでください。

---

# Phase 2実装範囲

実装対象:

```text
1. Auth.js設定
2. Login / Logout
3. Session取得
4. usersテーブル同期
5. Organization Membership認可
6. Project Membership認可
7. owner/member/viewer権限判定
8. 共通Authorization Error
9. 保護Route
10. 保護API
11. Tenant Isolation Test
12. Audit基盤の最小実装
```

まだOrganization / Project CRUD本体は作り込まないでください。

---

# 1. Auth.js導入

Auth.jsを既存Next.js App Router構成へ導入してください。

認証Providerは、既存設定がなければMVPで安全に動作確認できる構成を選択してください。

ただし以下を禁止します。

```text
- 平文Password保存
- 独自Password Authenticationの即席実装
- Secretのハードコード
```

Google等のOAuth Providerを利用する場合も、Provider固有コードを業務ロジックへ漏らさないでください。

Provider Credential未設定でも、

```text
npm run build
```

が不必要に失敗しない構成を検討してください。

---

# 2. Auth構成

以下を基本としてください。

```text
lib/auth/
├── config.ts
├── session.ts
├── current-user.ts
└── types.ts
```

必要に応じて以下も作成可能です。

```text
app/api/auth/[...nextauth]/route.ts
```

Auth.jsのVersionと実際の推奨構成に合わせて適切に実装してください。

---

# 3. Session型

Application内部では、最低限以下を取得できるようにしてください。

```ts
type CurrentUser = {
  id: string
  email: string
  name: string
}
```

Session上の外部Provider IDを、そのままApplicationのuser IDとして使わないでください。

必ずusersテーブル上のUUIDと対応させてください。

---

# 4. usersテーブル同期

ログイン成功時にApplication側のusersテーブルと同期してください。

基本ルール:

```text
emailが既存
→ existing userを利用

emailが未登録
→ usersへ作成
```

最低限同期対象:

```text
email
name
avatar_url
```

ただしProviderが返さないFieldを無理に補完しないでください。

---

# 5. User同期の競合対策

初回ログインが同時発生してもDuplicate Userを作らないようにしてください。

users.emailのUNIQUE制約を利用し、

```text
select → insert
```

だけに依存せず、Race Conditionを考慮してください。

必要であればupsert相当を利用してください。

---

# 6. Session取得共通関数

以下のようなServer-side共通関数を作成してください。

```ts
getCurrentUser()
requireCurrentUser()
```

例:

```ts
const user = await requireCurrentUser()
```

未認証の場合は共通のAuthentication Errorへ変換してください。

Route HandlerごとにSession取得処理をコピーしないでください。

---

# 7. 認証Error

以下を共通化してください。

```text
UNAUTHENTICATED
HTTP 401
```

Clientへ以下を返さないでください。

```text
- stack trace
- provider secret
- auth token
- DB query
```

---

# 8. Permission構成

以下を作成してください。

```text
lib/permissions/
├── organization.ts
├── project.ts
├── resource.ts
├── roles.ts
└── errors.ts
```

責務を明確にしてください。

---

# 9. Organization Permission

最低限以下を実装してください。

```ts
getOrganizationMembership({
  userId,
  organizationId
})

requireOrganizationMember(...)

requireOrganizationOwner(...)
```

期待動作:

```text
非所属
→ 403または404

member
→ Organization参照可能

owner
→ Organization管理操作可能
```

Resource存在情報を他Tenantへ必要以上に漏らさない設計を優先してください。

---

# 10. Project Permission

最低限以下を実装してください。

```ts
getProjectMembership({
  userId,
  projectId
})

requireProjectViewer(...)
requireProjectMember(...)
requireProjectOwner(...)
```

権限階層:

```text
owner
  ↓
member
  ↓
viewer
```

意味:

```text
owner
- Project管理
- Member管理
- CRUD全般

member
- Ticket/Meeting等の通常更新
- Project管理系は制限

viewer
- 原則Read Only
```

---

# 11. Project所属判定

Project IDだけをClientから受け取り、その値をそのまま信用しないでください。

判定:

```text
user_id
↓
project_members
↓
project_id
↓
projects.organization_id
↓
organization membership
```

Project Memberであっても所属Organizationとの整合を確認できる設計にしてください。

---

# 12. Resource Authorization

Ticket / Meeting / Minutes / Candidate用の認可基盤を先に準備してください。

Phase 2では各CRUDを作らなくても構いません。

ただし将来以下を安全に実装できるようにしてください。

```ts
requireTicketAccess(...)
requireMeetingAccess(...)
requireMinutesAccess(...)
requireTicketCandidateAccess(...)
```

基本思想:

```text
resourceId
↓
DBからprojectId取得
↓
Project Permission判定
```

絶対に以下の実装をしないでください。

```text
GET /api/tickets/:ticketId?projectId=...
```

で、Clientが送ったprojectIdだけを信頼する。

---

# 13. IDOR対策

以下を必ず考慮してください。

攻撃例:

```text
User A:
organization A
project A

User B:
organization B
project B
```

User Aが以下を指定:

```text
/api/projects/{projectBId}
```

期待結果:

```text
403 または 404
```

Project Bの名前、Organization名、Member情報等を返してはいけません。

---

# 14. Role定義

Role文字列をコード中に散在させないでください。

例:

```ts
export const ORGANIZATION_ROLES = {
  OWNER: "owner",
  MEMBER: "member",
} as const

export const PROJECT_ROLES = {
  OWNER: "owner",
  MEMBER: "member",
  VIEWER: "viewer",
} as const
```

必要であれば型も導出してください。

```ts
type ProjectRole = ...
```

DB Schemaとの不一致が起きない構造にしてください。

---

# 15. Permission Matrix

コードまたはTestで以下を表現してください。

## Organization

| 操作 | owner | member |
|---|---|---|
| 閲覧 | ○ | ○ |
| 更新 | ○ | × |
| Member管理 | ○ | × |
| 削除 | ○ | × |

## Project

| 操作 | owner | member | viewer |
|---|---|---|---|
| 閲覧 | ○ | ○ | ○ |
| Ticket作成 | ○ | ○ | × |
| Ticket更新 | ○ | ○ | × |
| Meeting作成 | ○ | ○ | × |
| AI生成 | ○ | ○ | × |
| Project設定変更 | ○ | × | × |
| Member管理 | ○ | × | × |

Phase 2では機能本体を作らなくても、このMatrixをPermission層で利用できる状態にしてください。

---

# 16. Protected Route

最低限以下を保護してください。

```text
/dashboard
/organizations
/projects
/tickets
/meetings
```

未認証時:

```text
/login
```

へ誘導してください。

実装方法はNext.js/Auth.jsの現行構成に合わせて選択してください。

Middlewareを利用する場合も、DBを必要とする複雑な権限チェックをMiddlewareへ詰め込まないでください。

Middleware:

```text
Authentication level
```

Application:

```text
Authorization level
```

と責務分離してください。

---

# 17. Login画面

Phase 2では最低限のLogin画面を実装してください。

要件:

```text
AIプロジェクトマネージャー
ログインボタン
```

認証済みの場合:

```text
/dashboard
```

へ遷移してください。

UIを作り込みすぎないでください。

---

# 18. Logout

安全なLogout処理を実装してください。

Logout後:

```text
/login
```

へ遷移してください。

Browser上に不要なSession情報を残さないでください。

---

# 19. Dashboard仮表示

認証後のDashboardへ以下を最低限表示してください。

```text
AIプロジェクトマネージャー

ログインユーザー:
<name>
<email>
```

Organization / Project CRUDは次Phaseなので、本格実装しないでください。

---

# 20. API認証Middleware/Helper

Route Handler用に共通処理を用意してください。

例:

```ts
const user = await requireCurrentUser()
```

API Routeごとに以下を繰り返さないでください。

```text
Auth.js Session取得
Session null判定
users lookup
Error生成
```

---

# 21. 共通Authorization Error

最低限以下を用意してください。

```text
UNAUTHENTICATED
FORBIDDEN
RESOURCE_NOT_FOUND
```

HTTP:

```text
UNAUTHENTICATED
→ 401

FORBIDDEN
→ 403

RESOURCE_NOT_FOUND
→ 404
```

内部情報をClientへ返さないでください。

---

# 22. Audit Log基盤

Phase 2では最低限のAudit関数を作成してください。

例:

```ts
writeAuditLog({
  organizationId,
  userId,
  action,
  resourceType,
  resourceId,
  metadata,
})
```

まだ全操作へ組み込む必要はありません。

後続Phaseで利用できる状態にしてください。

---

# 23. Audit対象予定

今後以下をAudit対象とします。

```text
organization.create
organization.update
organization.member.add
organization.member.remove

project.create
project.update
project.member.add
project.member.remove

ticket.create
ticket.update
ticket.delete

meeting.create
meeting.end

ai.minutes.generate
ai.ticket.generate

candidate.approve
candidate.reject
ticket.register
```

Phase 2ではFrameworkだけ実装してください。

---

# 24. Security Logging

認証・認可失敗時に必要に応じて以下を記録可能にしてください。

```text
request_id
user_id
resource_type
resource_id
action
result
```

ただしLogへ以下を保存しないでください。

```text
password
access token
session token
AUTH_SECRET
AWS credentials
```

---

# 25. テストデータ

Phase 1 Fixtureを利用してください。

想定:

```text
Organization A
├─ Owner A
├─ Member A
├─ Viewer A
└─ Project A

Organization B
├─ Owner B
└─ Project B
```

必要に応じてProject Member roleをFixtureへ追加してください。

---

# 26. Authentication Test

最低限以下を作成してください。

## AUTH-T01

```text
未認証で/dashboard
```

期待:

```text
/loginへ遷移
```

## AUTH-T02

```text
認証済みで/dashboard
```

期待:

```text
表示成功
```

## AUTH-T03

```text
未認証で保護API
```

期待:

```text
401
```

## AUTH-T04

```text
Logout
```

期待:

```text
Session無効化
```

---

# 27. Authorization Test

最低限以下を作成してください。

## AUTHZ-T01

Organization owner:

```text
requireOrganizationOwner
```

成功。

## AUTHZ-T02

Organization member:

```text
requireOrganizationOwner
```

失敗。

期待:

```text
403
```

## AUTHZ-T03

Project owner:

```text
requireProjectOwner
```

成功。

## AUTHZ-T04

Project member:

```text
requireProjectMember
```

成功。

## AUTHZ-T05

Project viewer:

```text
requireProjectMember
```

失敗。

## AUTHZ-T06

Project viewer:

```text
requireProjectViewer
```

成功。

## AUTHZ-T07

非所属Project:

```text
requireProjectViewer
```

失敗。

## AUTHZ-T08

別Organization Project:

```text
User A → Project B
```

失敗。

---

# 28. Tenant Isolation Test

特に重要です。

以下を必ずテストしてください。

```text
Organization A User
↓
Organization B resource
```

取得不可。

Resource existenceを不必要に漏らさないでください。

最低限:

```text
SEC-TENANT-01
Project越境

SEC-TENANT-02
Ticket認可helper越境

SEC-TENANT-03
Meeting認可helper越境
```

Ticket/Meetingの実データFixtureが必要な場合はTest専用Fixtureを作成してください。

---

# 29. Role Escalation Test

Clientから以下を送信しても権限昇格できないことを確認してください。

```json
{
  "role": "owner"
}
```

SessionやRequest Body内のroleをそのまま信用しないでください。

RoleはDB membershipから取得してください。

---

# 30. Mass Assignment対策

今後APIで利用するため、以下の方針を守ってください。

Clientが以下を送っても業務Entityへ反映してはいけません。

```text
created_by
organization_id
owner role
audit fields
```

Phase 2のPermission/API helperにもこの思想を反映してください。

---

# 31. CSRF / Cookie

Auth.jsの標準セキュリティ機構を壊さないでください。

本番想定:

```text
Secure
HttpOnly
SameSite
```

Cookie設定を独自変更する場合は理由を報告してください。

---

# 32. Open Redirect対策

Login/Logout Callback URLで任意外部URLへ遷移できないようにしてください。

例:

```text
callbackUrl=https://evil.example
```

を無条件に許可しないでください。

---

# 33. Authentication Provider障害

Provider設定がない状態やLogin失敗時に、Application全体がCrashしないようにしてください。

Login画面に安全なErrorを表示できる構造としてください。

---

# 34. npm scripts

既存Phase 0〜1 scriptsを壊さないでください。

最低限以下が引き続き動作すること。

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

E2Eが設定済みの場合:

```bash
npm run test:e2e
```

---

# 35. E2E

Playwrightで最低限以下を追加してください。

```text
login
↓
dashboard
↓
logout
```

実OAuth Providerで自動化が困難な場合は、Test専用Authentication StrategyまたはSession Mockを安全に利用してください。

ProductionにTest Login機構を露出させないでください。

---

# Phase 2で実装しないもの

以下はまだ実装しないでください。

```text
Organization CRUD本体
Project CRUD本体
Ticket CRUD
Meeting CRUD
AI Minutes
AI Ticket Candidate
Bedrock実処理
S3 Upload本実装
LiveKit Room本実装
Production Deployment
Production User作成
```

認証・認可に集中してください。

---

# セキュリティ禁止事項

絶対に以下をしないでください。

```text
Session roleを信用してDB認可を省略
Client roleを信用
Client organizationIdを信用
Client projectIdだけで認可
UI非表示だけで権限制御
SecretをNEXT_PUBLIC_へ設定
Session Tokenをconsole.log
Production Auth Secretを生成・登録
Production DBを変更
```

---

# 実装ルール

1. 既存Phase 0〜1コードを最初に確認する。
2. users / organization_members / project_members Schemaを再利用する。
3. Auth.jsとPermissionを分離する。
4. Server-side Authorizationを必須とする。
5. Client-side role表示は補助情報とする。
6. IDOR対策を最優先する。
7. Permission関数はUnit Test可能にする。
8. TypeScriptのanyを安易に使わない。
9. 認証失敗と権限不足を適切に区別する。
10. Phase 3以降のCRUDを先回り実装しない。

---

# 推奨ディレクトリ

最終的に以下に近い構成にしてください。

```text
lib/
├── auth/
│   ├── config.ts
│   ├── session.ts
│   ├── current-user.ts
│   └── types.ts
├── permissions/
│   ├── roles.ts
│   ├── organization.ts
│   ├── project.ts
│   ├── resource.ts
│   └── errors.ts
└── security/
    └── audit.ts

app/
├── login/
│   └── page.tsx
├── dashboard/
│   └── page.tsx
└── api/
    └── auth/
```

現在のAuth.js推奨構成がこれと異なる場合は、現行APIを優先し、理由を報告してください。

---

# 完了時に実行

最低限以下を実行してください。

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

可能なら:

```bash
npm run test:e2e
```

---

# Phase 2 Definition of Done

以下をすべて満たした場合のみPhase 2完了としてください。

- Auth.jsがServer-sideで動作する構成になっている
- Loginができる
- Logoutができる
- SessionからApplication Userを取得できる
- usersテーブルとの同期が安全に行える
- requireCurrentUserが存在する
- Organization owner/member判定ができる
- Project owner/member/viewer判定ができる
- Role hierarchyが一貫している
- 別Organizationへの越境を防止できる
- Resource→Project認可の共通基盤がある
- Client roleを信用していない
- 未認証APIが401
- 権限不足が403/404
- Login/Dashboardが保護されている
- Audit Log helperが存在する
- Authentication/Authorization testが成功
- Tenant Isolation testが成功
- lint成功
- typecheck成功
- test成功
- build成功
- Production環境を変更していない

---

# 作業終了時の報告形式

以下の形式で報告してください。

```text
## Phase 2 認証・認可 実装結果

### 1. Authentication
- Auth.js:
- Provider:
- Session方式:
- User同期:

### 2. Authorization
- Organization:
- Project:
- Resource:
- Role hierarchy:

### 3. 作成・変更ファイル
- ...

### 4. 認証テスト
- AUTH-T01:
- AUTH-T02:
- AUTH-T03:
- AUTH-T04:

### 5. 認可テスト
- AUTHZ-T01:
- ...
- AUTHZ-T08:

### 6. Tenant Isolation
- SEC-TENANT-01:
- SEC-TENANT-02:
- SEC-TENANT-03:

### 7. E2E
- login:
- dashboard:
- logout:

### 8. セキュリティ確認
- Client role信用:
- Client projectId信用:
- Secret露出:
- Session Token log:
- Production変更:

### 9. 実行結果
- lint:
- typecheck:
- unit test:
- integration test:
- e2e:
- build:

### 10. 未実施・未解決
- ...

### 11. Phase 3への引継ぎ
- ...
```

既存コード・設計書から合理的に判断できる事項は質問せず実装してください。

ただし、実OAuth ProviderのCredential入力、Production Auth Secret登録、Production DB変更、課金を伴う外部設定が必要な場合は実行せず、ローカル/テストで実装可能な範囲を完成させて報告してください。