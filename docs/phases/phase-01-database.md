あなたはシニアバックエンドエンジニアとして、「AIプロジェクトマネージャー」のPhase 1を実装してください。

# Phase 1の目的

Phase 1では、Phase 0で構築したNext.js / TypeScript / Drizzle / Neon PostgreSQL基盤の上に、本サービスのMVPで必要となるDB Schema・Relation・Index・Constraint・Migrationを実装します。

このPhaseではAPIや画面の業務実装には進まず、後続Phaseで安全にCRUD・認証・AI処理を実装できるデータ基盤を完成させてください。

---

# 前提

Phase 0が完了しており、以下が存在する前提です。

```text
/
├── app/
├── components/
├── lib/
│   ├── db/
│   │   ├── client.ts
│   │   └── schema/
│   ├── auth/
│   ├── permissions/
│   ├── ai/
│   ├── bedrock/
│   ├── s3/
│   ├── livekit/
│   └── security/
├── drizzle/
│   └── migrations/
├── tests/
├── e2e/
├── scripts/
├── ops/
├── infra/
├── drizzle.config.ts
├── .env.example
└── package.json
```

技術スタック:

* Next.js App Router
* TypeScript
* PostgreSQL / Neon
* Drizzle ORM
* Zod
* Vitest
* GitHub Actions

---

# 実装対象テーブル

以下をMVPの正式Schemaとして実装してください。

## 1. users

```text
users
```

カラム:

* id: uuid PK
* email: varchar(255) NOT NULL UNIQUE
* name: varchar(100) NOT NULL
* avatar_url: text NULL
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

方針:

* UUIDを主キーとする
* emailはunique
* passwordは保存しない
* 認証情報はAuth.js/Cognito等へ委譲する前提

---

## 2. organizations

```text
organizations
```

カラム:

* id: uuid PK
* name: varchar(200) NOT NULL
* created_by: uuid NOT NULL FK users.id
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

---

## 3. organization_members

```text
organization_members
```

カラム:

* organization_id: uuid NOT NULL FK organizations.id
* user_id: uuid NOT NULL FK users.id
* role: varchar(20) NOT NULL
* created_at: timestamptz NOT NULL

Primary Key:

```text
organization_id + user_id
```

role:

```text
owner
member
```

不正値を入れられないよう、可能であればDB ConstraintまたはDrizzle enum相当を使用してください。

---

## 4. projects

```text
projects
```

カラム:

* id: uuid PK
* organization_id: uuid NOT NULL FK organizations.id
* name: varchar(200) NOT NULL
* description: text NULL
* status: varchar(20) NOT NULL
* created_by: uuid NOT NULL FK users.id
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

status:

```text
active
archived
```

---

## 5. project_members

```text
project_members
```

カラム:

* project_id: uuid NOT NULL FK projects.id
* user_id: uuid NOT NULL FK users.id
* role: varchar(20) NOT NULL
* created_at: timestamptz NOT NULL

Primary Key:

```text
project_id + user_id
```

role:

```text
owner
member
viewer
```

---

## 6. meetings

```text
meetings
```

カラム:

* id: uuid PK
* project_id: uuid NOT NULL FK projects.id
* title: varchar(200) NOT NULL
* meeting_date: timestamptz NOT NULL
* status: varchar(20) NOT NULL
* created_by: uuid NOT NULL FK users.id
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

status:

```text
scheduled
recording
processing
completed
failed
```

---

## 7. meeting_participants

```text
meeting_participants
```

カラム:

* meeting_id: uuid NOT NULL FK meetings.id
* user_id: uuid NULL FK users.id
* display_name: varchar(100) NOT NULL
* role: varchar(30) NOT NULL
* joined_at: timestamptz NULL
* left_at: timestamptz NULL

role:

```text
host
participant
```

外部参加者を考慮してuser_idはNULLを許可してください。

複合Primary Keyに無理がある場合はUUID idを追加して構いませんが、その場合は理由を報告してください。

---

## 8. meeting_transcripts

```text
meeting_transcripts
```

カラム:

* id: uuid PK
* meeting_id: uuid NOT NULL FK meetings.id
* speaker_user_id: uuid NULL FK users.id
* speaker_name: varchar(100) NOT NULL
* started_at: numeric(12,3) NOT NULL
* ended_at: numeric(12,3) NULL
* text: text NOT NULL
* sequence_no: integer NOT NULL
* created_at: timestamptz NOT NULL

Constraint:

```text
UNIQUE(meeting_id, sequence_no)
```

started_at:

* 0以上

ended_at:

* NULL可
* 値がある場合は0以上

---

## 9. meeting_recordings

```text
meeting_recordings
```

カラム:

* id: uuid PK
* meeting_id: uuid NOT NULL FK meetings.id
* s3_key: text NOT NULL UNIQUE
* content_type: varchar(100) NOT NULL
* file_size: bigint NULL
* duration_seconds: integer NULL
* status: varchar(20) NOT NULL
* created_at: timestamptz NOT NULL

status:

```text
uploading
uploaded
processing
completed
failed
```

---

## 10. meeting_minutes

```text
meeting_minutes
```

カラム:

* id: uuid PK
* meeting_id: uuid NOT NULL FK meetings.id
* version: integer NOT NULL
* status: varchar(20) NOT NULL
* summary: text NULL
* decisions: jsonb NULL
* action_items: jsonb NULL
* issues: jsonb NULL
* pending_items: jsonb NULL
* ai_model: varchar(100) NULL
* ai_raw_output: jsonb NULL
* prompt_version: varchar(50) NULL
* schema_version: varchar(50) NULL
* created_by: uuid NOT NULL FK users.id
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

status:

```text
draft
review
approved
```

Constraint:

```text
UNIQUE(meeting_id, version)
```

version:

```text
1以上
```

---

## 11. tickets

```text
tickets
```

カラム:

* id: uuid PK
* project_id: uuid NOT NULL FK projects.id
* title: varchar(300) NOT NULL
* description: text NULL
* type: varchar(30) NOT NULL
* status: varchar(30) NOT NULL
* priority: varchar(20) NOT NULL
* assignee_id: uuid NULL FK users.id
* due_date: date NULL
* created_by: uuid NOT NULL FK users.id
* source_meeting_id: uuid NULL FK meetings.id
* source_candidate_id: uuid NULL
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL
* deleted_at: timestamptz NULL

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

deleted_atは論理削除用です。

---

## 12. ticket_candidates

```text
ticket_candidates
```

カラム:

* id: uuid PK
* project_id: uuid NOT NULL FK projects.id
* meeting_id: uuid NOT NULL FK meetings.id
* minutes_id: uuid NULL FK meeting_minutes.id
* title: varchar(300) NOT NULL
* description: text NULL
* type: varchar(30) NOT NULL
* priority: varchar(20) NULL
* assignee_id: uuid NULL FK users.id
* due_date: date NULL
* source_transcript_ids: jsonb NULL
* source_quote: text NULL
* confidence: numeric(5,4) NULL
* status: varchar(20) NOT NULL
* registered_ticket_id: uuid NULL
* ai_model: varchar(100) NULL
* prompt_version: varchar(50) NULL
* schema_version: varchar(50) NULL
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

type:

```text
task
issue
followup
```

priority:

```text
low
medium
high
urgent
NULL
```

status:

```text
pending
approved
rejected
registered
```

confidence:

```text
0.0000 ～ 1.0000
```

Constraintを設定してください。

---

## 13. ticket_comments

```text
ticket_comments
```

カラム:

* id: uuid PK
* ticket_id: uuid NOT NULL FK tickets.id
* user_id: uuid NOT NULL FK users.id
* content: text NOT NULL
* created_at: timestamptz NOT NULL
* updated_at: timestamptz NOT NULL

---

## 14. audit_logs

```text
audit_logs
```

カラム:

* id: uuid PK
* organization_id: uuid NOT NULL FK organizations.id
* user_id: uuid NULL FK users.id
* action: varchar(100) NOT NULL
* resource_type: varchar(50) NOT NULL
* resource_id: uuid NULL
* metadata: jsonb NULL
* created_at: timestamptz NOT NULL

監査ログは通常のユーザー操作から更新・削除する設計にしないでください。

---

# Foreign Key方針

原則としてCascade Deleteを多用しないでください。

特に以下のデータは履歴・監査・トレーサビリティ上重要です。

* meetings
* meeting_transcripts
* meeting_minutes
* ticket_candidates
* tickets
* audit_logs

基本方針:

```text
ON DELETE RESTRICT
```

または

```text
ON DELETE SET NULL
```

を用途に応じて選択してください。

例:

```text
tickets.assignee_id
→ user削除時 SET NULL候補
```

ただし、実際のDrizzle / PostgreSQL設計として不整合が出る場合は、合理的な修正を行い理由を報告してください。

---

# 循環Foreign Keyについて

以下は循環参照になる可能性があります。

```text
tickets.source_candidate_id
ticket_candidates.registered_ticket_id
```

Migration上問題になる場合は、

1. 一方のFKを後続Migrationで追加する
2. または片方向FK + application validationとする

など、安全な設計を選択してください。

無理に1回のMigrationへ押し込まないでください。

---

# Index設計

最低限以下を作成してください。

## organizations / members

```text
organization_members(user_id)
```

## projects

```text
projects(organization_id, status)
project_members(user_id)
```

## tickets

```text
tickets(project_id, status)
tickets(project_id, assignee_id)
tickets(project_id, deleted_at)
tickets(due_date)
```

## meetings

```text
meetings(project_id, meeting_date)
```

必要であればDESC等を検討してください。

## transcripts

```text
meeting_transcripts(meeting_id, sequence_no)
```

## minutes

```text
meeting_minutes(meeting_id, version)
```

## candidates

```text
ticket_candidates(meeting_id, status)
ticket_candidates(project_id, status)
```

## audit

```text
audit_logs(organization_id, created_at)
```

実際のQuery Patternを考慮して重複Indexは避けてください。

---

# Drizzle Schema構成

以下を基本としてください。

```text
lib/db/schema/
├── users.ts
├── organizations.ts
├── projects.ts
├── meetings.ts
├── tickets.ts
├── audit.ts
└── index.ts
```

責務例:

```text
users.ts
- users

organizations.ts
- organizations
- organization_members

projects.ts
- projects
- project_members

meetings.ts
- meetings
- meeting_participants
- meeting_transcripts
- meeting_recordings
- meeting_minutes

tickets.ts
- tickets
- ticket_candidates
- ticket_comments

audit.ts
- audit_logs
```

過度に1ファイルへ集約しないでください。

---

# Drizzle Relations

Drizzleのrelationsを実装してください。

最低限以下を表現してください。

```text
User
 ├─ OrganizationMember
 ├─ ProjectMember
 ├─ Tickets assigned
 └─ Meetings created

Organization
 ├─ Members
 └─ Projects

Project
 ├─ Members
 ├─ Tickets
 └─ Meetings

Meeting
 ├─ Participants
 ├─ Transcripts
 ├─ Recordings
 ├─ Minutes
 └─ TicketCandidates

Ticket
 └─ Comments
```

RelationはApplicationで読みやすくするためのものであり、DBのFK制約も別途正しく設定してください。

---

# Timestamp方針

日時は原則:

```text
TIMESTAMPTZ
```

使用してください。

保存はUTC基準とします。

created_at / updated_at:

* DB defaultまたはApplicationで一貫した方式を使用
* updated_at更新方式を明確にする

同一Project内で方式を混在させないでください。

---

# UUID方針

Primary Keyは原則UUIDとします。

DB側:

```text
gen_random_uuid()
```

等を利用するか、Application側生成かを統一してください。

MVPではDB default UUIDを推奨します。

---

# JSONB方針

以下はMVPではJSONBとします。

```text
meeting_minutes.decisions
meeting_minutes.action_items
meeting_minutes.issues
meeting_minutes.pending_items

ticket_candidates.source_transcript_ids

audit_logs.metadata
```

ただしJSONB内の型保証はAI Schema / Zodで行う前提です。

Phase 1ではAI用Schema実装を作り込みすぎないでください。

---

# migration生成

Drizzleで正式Migrationを生成してください。

例:

```bash
npm run db:generate
```

生成後、Migration SQLを確認してください。

確認項目:

* 全Tableが存在
* FKが正しい
* UNIQUEが存在
* CHECK/enum相当が存在
* Indexが存在
* 不要なCASCADE DELETEが存在しない
* 循環FKが安全
* JSONB型が正しい
* timestamptzが使用されている

Migration SQLを手作業で大幅改変する場合は理由を報告してください。

---

# DB Validation Test

Vitest等で、可能な範囲のSchemaテストを追加してください。

最低限以下を検証してください。

## DB-T01

```text
organization roleに不正値を設定できない
```

## DB-T02

```text
project roleに不正値を設定できない
```

## DB-T03

```text
meeting statusに不正値を設定できない
```

## DB-T04

```text
meeting_transcripts(meeting_id, sequence_no)がunique
```

## DB-T05

```text
meeting_minutes(meeting_id, version)がunique
```

## DB-T06

```text
ticket candidate confidence > 1 を拒否
```

## DB-T07

```text
ticket candidate confidence < 0 を拒否
```

## DB-T08

```text
ticket status/type/priority不正値を拒否
```

## DB-T09

```text
FK不整合を拒否
```

## DB-T10

```text
s3_key duplicateを拒否
```

実際のDBが必要でテスト環境上実行できない場合は、テストコード/fixtureを準備し、未実行理由を報告してください。

---

# Seed / Fixture

Production用Seedは作成しないでください。

Development/Test用として最低限以下のfixture設計を作成してください。

```text
Organization A
 ├─ Owner User
 ├─ Member User
 ├─ Viewer User
 └─ Project A

Organization B
 ├─ Owner User
 └─ Project B
```

目的:

* Tenant Isolation test
* Role test
* API integration test

Seed実装は以下のどちらかで構いません。

```text
scripts/seed-dev.ts
```

または

```text
tests/fixtures/db.ts
```

Productionで誤実行されないSafety Checkを入れてください。

---

# 型Export

後続API実装で利用できるよう、必要な型をexportしてください。

例:

```ts
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
```

同様に主要Entityについて型を利用できる構成にしてください。

ただし無闇にすべてexportせず、後続Phaseで使いやすい形に整理してください。

---

# Naming Convention

TypeScript:

```text
camelCase
```

DB:

```text
snake_case
```

例:

```text
createdAt
↓
created_at
```

Drizzle Schema上でも一貫性を保ってください。

---

# マルチテナント設計

OrganizationがTenant境界です。

以下を後続APIで安全に判定できるSchemaにしてください。

```text
User
↓
organization_members
↓
Organization
↓
Project
↓
Ticket / Meeting
```

TicketやMeetingへorganization_idを重複保持するかどうかは、現設計ではProject経由とします。

勝手に全Tableへorganization_idを追加しないでください。

ただし性能や安全性上必要と判断する場合は変更理由を報告してください。

---

# Phase 1で実装しないもの

以下はまだ実装しないでください。

* Login/Auth本実装
* Permission関数本実装
* Organization CRUD API
* Project CRUD API
* Ticket CRUD API
* Meeting CRUD API
* AI議事録生成
* AI Ticket Candidate生成
* Bedrock実処理
* S3 Upload
* LiveKit Room
* UI本実装
* Production Migration
* Production Seed
* Production DB接続作業

---

# セキュリティルール

以下を厳守してください。

* Production DATABASE_URLを使用しない
* Production Migrationを実行しない
* ProductionデータをSeedしない
* Secretをコードへ書かない
* SQL文字列結合を使わない
* 不要なCascade Deleteを設定しない
* Tenant構造を壊さない
* AI raw outputを正式Ticketへ直接紐づける設計にしない

---

# 実装ルール

1. まず既存Phase 0コードを確認する。
2. 既存の命名・構成を尊重する。
3. DB設計書との差異がある場合、合理的な方を採用し差分を報告する。
4. Migrationを生成してSQL内容を確認する。
5. TypeScriptのanyを安易に使用しない。
6. DB enum/check制約をApplication validationだけに任せない。
7. FKとRelationを混同しない。
8. 循環FKを無理に作らない。
9. Production DBへ接続しない。
10. Phase 2以降のAPI実装へ進まない。

---

# 完了時に実行するコマンド

最低限以下を実行してください。

```bash
npm run lint
npm run typecheck
npm run test:run
npm run db:generate
npm run build
```

利用可能なDev/Test DBが安全に設定されている場合のみ:

```bash
npm run db:migrate
```

Production DBへのMigrationは絶対に実行しないでください。

---

# Migration確認結果

作業終了時に、生成されたMigrationについて以下を確認してください。

```text
Tables: 14
Primary Keys
Foreign Keys
Unique Constraints
Check/Enum Constraints
Indexes
JSONB
TIMESTAMPTZ
Circular FK
Delete Rules
```

想定と異なる場合は必ず報告してください。

---

# Phase 1 Definition of Done

以下をすべて満たした場合のみPhase 1完了としてください。

* 14テーブルがDrizzle Schemaとして定義されている
* Primary Keyが定義されている
* 必要なForeign Keyが定義されている
* role/status/type/priority等の不正値を防止できる
* 必要なUnique Constraintが存在する
* 必要なIndexが存在する
* Drizzle Relationsが定義されている
* Migrationファイルが生成されている
* Migration SQL内容を確認済み
* JSONB Fieldが正しく定義されている
* timestamptzが正しく使われている
* Tenant構造が維持されている
* Development/Test fixtureが用意されている
* Productionへの変更を行っていない
* lint成功
* typecheck成功
* test成功
* build成功

---

# 作業終了時の報告形式

以下の形式で必ず報告してください。

```text
## Phase 1 実装結果

### 1. 実装したSchema
- users
- organizations
- ...

### 2. 作成・変更ファイル
- ...

### 3. Migration
- Migration file:
- Table数:
- FK:
- Unique:
- Check/Enum:
- Index:

### 4. DB設計書との差分
- なし
または
- ...

### 5. 循環Foreign Key対応
- ...

### 6. テスト結果
- lint:
- typecheck:
- unit test:
- db test:
- build:

### 7. Seed / Fixture
- ...

### 8. セキュリティ確認
- Production DB接続:
- Production Migration:
- Secret混入:
- 不要Cascade:

### 9. 未実施・未解決事項
- ...

### 10. Phase 2への引継ぎ
- ...
```

不明点があっても、既存コード・DB設計書・本指示から合理的に判断できるものは質問せず実装してください。

ただし、Production DATABASE_URLしか存在しない場合や、破壊的なDB操作が必要な場合は実行せず、その理由を報告してください。
