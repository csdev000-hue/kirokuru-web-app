あなたはWeb Application Security、Next.js、PostgreSQL、AWS、AI Security、Observabilityに精通したシニアセキュリティ/フルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 11を実装してください。

# Phase 11の目的

Phase 11では、Phase 0〜10までに実装したApplication全体に対して、横断的なSecurity Hardeningを実施します。

対象:

```text
Authentication
Authorization
Organization
Project
Ticket
Comment
Kanban
Meeting
Participant
Transcript
AI Minutes
AI Ticket Candidate
Candidate → Ticket
S3 Recording
LiveKit Online Meeting
```

完成イメージ:

```text
Request
↓
Request ID
↓
Authentication
↓
Rate Limit
↓
Input Validation
↓
Authorization
↓
Business Logic
↓
Database / External Provider
↓
Audit / Structured Log
↓
Safe API Response
```

本Phaseでは新しい業務機能を増やすのではなく、

```text
Security
Consistency
Observability
Abuse Prevention
Auditability
```

を完成させてください。

---

# 最重要原則

以下を必ず守ってください。

```text
Client Input
=
Untrusted
```

```text
AI Output
=
Untrusted
```

```text
External Provider Response
=
Untrusted
```

```text
URL Resource ID
=
Authorization必須
```

```text
Application Log
≠
機密情報保存場所
```

---

# 前提

Phase 0〜10が完了しています。

最低限以下が存在する前提です。

```text
lib/
├── auth/
├── permissions/
├── security/
├── services/
├── validators/
├── ai/
├── bedrock/
├── s3/
└── livekit/
```

DB:

```text
users
organizations
organization_members
projects
project_members
tickets
ticket_comments
meetings
meeting_participants
meeting_transcripts
meeting_recordings
meeting_minutes
ticket_candidates
audit_logs
```

が存在します。

---

# Phase 11実装範囲

以下を実装・レビューしてください。

```text
1. Request ID
2. API Response統一
3. 共通Application Error
4. Provider Error変換
5. Safe Error Response
6. Audit Log統一
7. Structured Logging
8. Sensitive Data Redaction
9. Rate Limit
10. AI Abuse Prevention
11. Presigned URL Abuse Prevention
12. LiveKit Token Abuse Prevention
13. IDOR再レビュー
14. Tenant Isolation再レビュー
15. Mass Assignment対策
16. CSRF
17. CORS
18. Cookie Security
19. Security Headers
20. CSP
21. XSS
22. Injection
23. Secret漏えい防止
24. Environment Variable検査
25. Dependency Security
26. Supply Chain Security
27. GitHub Actions Security
28. Audit Integrity
29. Security Logging
30. Security Tests
31. Failure / Degradation Test
32. Production Readiness Check
```

---

# 1. Request ID

全API Requestへ一意なRequest IDを付与してください。

例:

```text
UUID
```

または安全なランダムID。

Request Headerに既存Request IDが来る場合も、外部値をそのまま無条件信用する必要はありません。

必要ならServer側で新規生成してください。

---

# 2. Request ID利用箇所

最低限以下で共通利用してください。

```text
API Response
Application Log
Audit Log
Provider Error Log
AI Log
Security Log
```

これにより:

```text
Client Error
↓
requestId
↓
Server Log
↓
Audit
```

を追跡可能にしてください。

---

# 3. API Success形式

既存仕様:

```ts
export type ApiSuccess<T> = {
  data: T
  requestId: string
}
```

を全APIで統一してください。

---

# 4. API Error形式

既存仕様:

```ts
export type ApiError = {
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
}
```

を利用してください。

---

# 5. Error Response統一

APIごとに以下のような独自形式を作らないでください。

```json
{
  "message": "error"
}
```

```json
{
  "status": false
}
```

```json
{
  "errors": []
}
```

既存Envelopeへ統一してください。

---

# 6. Application Error

共通型を実装してください。

推奨:

```text
lib/errors/
├── application-error.ts
├── error-codes.ts
├── error-response.ts
├── provider-errors.ts
└── index.ts
```

例:

```ts
class ApplicationError extends Error {
  code: string
  statusCode: number
  details?: unknown
  expose: boolean
}
```

既存Error実装がある場合は統合してください。

---

# 7. expose

Internal ErrorとUser-facing Errorを区別してください。

例:

```text
Validation Error
→ expose可能

Permission Error
→ safe message

DB Internal Error
→ expose不可

AWS Raw Error
→ expose不可

LiveKit Raw Error
→ expose不可
```

---

# 8. Clientへ返してはいけない情報

絶対に以下を返さないでください。

```text
Stack Trace
SQL Query
Database URL
Database Driver Error全文

AWS Request Signature
AWS Credential
S3 Internal Key（不要な場合）

LiveKit API Secret
LiveKit Token

Auth Session Token
Cookie内容

System Prompt全文
Bedrock Raw Error
Bedrock Raw Response全文

Environment Variables
Internal File Path
```

---

# 9. HTTP Status統一

最低限:

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthenticated
403 Forbidden
404 Not Found
409 Conflict
413 Payload Too Large
422 Validation Error
429 Too Many Requests

500 Internal Server Error
502 Upstream Provider Error
504 Provider Timeout
```

APIごとに同じ状況で異なるStatusを返さないよう整理してください。

---

# 10. Authentication Error

```text
UNAUTHENTICATED
→ 401
```

としてください。

---

# 11. Authorization Error

原則:

```text
FORBIDDEN
→ 403
```

ただしCross Tenant Resourceの存在を隠す必要がある場合:

```text
404
```

を利用して構いません。

Application全体で方針を統一してください。

---

# 12. Validation Error

Zod Validation失敗:

```text
VALIDATION_ERROR
→ 422
```

または既存方針が400なら統一してください。

ClientへZod Internal Object全文を返さないでください。

安全なField Errorへ変換してください。

---

# 13. Provider Error

以下を共通Application Errorへ変換してください。

```text
Amazon Bedrock
Amazon S3
LiveKit
Neon/PostgreSQL
```

---

# 14. Bedrock Error Mapping

例:

```text
429
→ AI_RATE_LIMITED

timeout
→ AI_TIMEOUT

5xx
→ AI_PROVIDER_ERROR

invalid structured response
→ AI_SCHEMA_INVALID
```

AWS SDK Error全文をClientへ返さないでください。

---

# 15. S3 Error Mapping

例:

```text
AccessDenied
→ S3_PROVIDER_ERROR

NoSuchKey
→ RECORDING_OBJECT_NOT_FOUND

timeout
→ S3_TIMEOUT
```

---

# 16. LiveKit Error Mapping

例:

```text
Provider unavailable
→ LIVEKIT_PROVIDER_ERROR

Token generation failure
→ LIVEKIT_TOKEN_FAILED

Room operation failure
→ LIVEKIT_ROOM_OPERATION_FAILED
```

---

# 17. PostgreSQL Error Mapping

最低限以下を安全に変換してください。

```text
Unique violation
Foreign key violation
Constraint violation
Connection failure
Transaction conflict
```

PostgreSQL Error全文をClientへ返さないでください。

---

# 18. Unique Violation

例:

```text
Duplicate membership
Duplicate transcript sequence
Duplicate source_candidate_id
```

等を適切な:

```text
409 Conflict
```

へ変換してください。

---

# 19. Structured Logging

`console.log()`の無秩序な利用を整理してください。

推奨構造:

```text
lib/logging/
├── logger.ts
├── redaction.ts
├── context.ts
└── types.ts
```

---

# 20. Log形式

最低限:

```text
timestamp
level
requestId

userId
organizationId
projectId

operation
resourceType
resourceId

result
durationMs
```

必要なものだけ記録してください。

---

# 21. Log禁止情報

絶対に以下をLogへ記録しないでください。

```text
password
session token
cookie
Authorization Header

AUTH_SECRET

AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY

LIVEKIT_API_SECRET
LiveKit Access Token

Presigned PUT URL
Presigned GET URL

DATABASE_URL

Meeting Transcript全文

Recording内容

AI System Prompt全文

AI Raw Output全文
```

---

# 22. Redaction

共通Redaction処理を実装してください。

対象Key例:

```text
password
token
authorization
cookie
secret
apiKey
apiSecret
accessKey
presignedUrl
```

Case-insensitive等も考慮してください。

---

# 23. Error Logging

Internal ErrorはServer Logへ:

```text
requestId
error type
operation
provider
```

等を記録可能にしてください。

ただしSensitive payloadをdumpしないでください。

---

# 24. Audit Logの目的

Application Log:

```text
障害解析
```

Audit Log:

```text
誰が
いつ
何を
どのResourceへ
実行したか
```

です。

両者を混同しないでください。

---

# 25. Audit共通Service

既存Audit helperを統一してください。

推奨:

```text
lib/security/
└── audit.ts
```

または:

```text
lib/audit/
├── service.ts
├── actions.ts
└── types.ts
```

---

# 26. Audit形式

例:

```ts
writeAuditLog({
  organizationId,
  userId,
  action,
  resourceType,
  resourceId,
  metadata
})
```

可能なら:

```text
requestId
```

も追跡可能にしてください。

DB Schema追加が必要なら理由を報告してください。

既存metadataへrequestIdを格納しても構いません。

---

# 27. Audit Action定数化

文字列を各Serviceへ散在させないでください。

例:

```text
organization.create
organization.update

project.create
project.update

ticket.create
ticket.update
ticket.delete

meeting.create
meeting.update

ai.minutes.generate
minutes.approve

ai.ticket_candidate.generate
ticket_candidate.approve
ticket_candidate.reject

ticket.register_from_candidate

recording.upload.complete
recording.delete

meeting.live.start
meeting.live.join
meeting.live.end
```

を共通定義してください。

---

# 28. Audit metadata

metadataには必要最小限だけ保存してください。

良い例:

```json
{
  "changedFields": [
    "status",
    "assigneeId"
  ]
}
```

悪い例:

```text
Ticket全文
Transcript全文
Minutes全文
Recording URL
```

---

# 29. Audit改ざん防止

一般ユーザー向けAPIから:

```text
audit_logs
```

をUPDATE/DELETEできないようにしてください。

Audit LogはApplication内部Write専用としてください。

---

# 30. Audit Failure

Audit書込み失敗時に業務Transactionを止めるか既存方針を確認してください。

特に:

```text
Candidate → Ticket
```

等の高重要操作ではAuditをTransactionへ含めることを検討してください。

一方:

```text
read-only download URL発行
```

等ではAudit失敗による全面障害を避ける方針も可能です。

重要度別方針を整理して報告してください。

---

# 31. Rate Limit

以下のAPIへRate Limitを実装してください。

最低限:

```text
Auth関連
AI Minutes生成
AI Candidate生成

S3 Upload URL
S3 Download URL

LiveKit Token発行

Meeting Start / End

Candidate Register
Bulk Register
```

---

# 32. Rate Limit共通化

推奨:

```text
lib/security/
└── rate-limit.ts
```

既存実装がある場合は統合してください。

---

# 33. Rate Limit Key

用途に応じて:

```text
userId
IP
organizationId
projectId
resourceId
```

等を組み合わせてください。

単純にIPだけを利用すると企業NAT環境で問題になる可能性があります。

Authenticated APIでは:

```text
userId
```

を主軸にしてください。

---

# 34. AI Rate Limit

AIはCostとAbuseへの影響が大きいため、特に制限してください。

例:

```text
AI Minutes Generate
per user
per project
per meeting

AI Candidate Generate
per user
per minutes
```

具体値はConfig化してください。

---

# 35. Rate Limit Config

例:

```env
RATE_LIMIT_AI_PER_MINUTE=
RATE_LIMIT_TOKEN_PER_MINUTE=
RATE_LIMIT_PRESIGNED_URL_PER_MINUTE=
```

またはApplication Configとして定義してください。

実値は環境ごとに変更可能にしてください。

---

# 36. 429 Response

上限超過:

```text
429 Too Many Requests
```

Error:

```text
RATE_LIMIT_EXCEEDED
```

としてください。

可能なら:

```text
Retry-After
```

も設定してください。

---

# 37. Rate Limit Storage

単一Process Memoryだけに依存するとServerless環境では正確性が低下します。

MVPでは既存環境に合わせて合理的な方式を選択してください。

候補:

```text
DB
Redis系
Provider
In-memory（Local/Testのみ）
```

Production向けにIn-memoryのみを最終解としないでください。

外部Redis導入を勝手に課金設定しないでください。

必要ならAdapter Interface + Memory Test実装までとしてください。

---

# 38. RateLimiter Interface

推奨:

```ts
interface RateLimiter {
  check(input: {
    key: string
    limit: number
    windowSeconds: number
  }): Promise<{
    allowed: boolean
    remaining: number
    retryAfterSeconds?: number
  }>
}
```

---

# 39. AI二重実行

Rate Limitだけでなく:

```text
Minutes生成
Candidate生成
```

の同一Resource同時実行防止を維持してください。

Rate LimitとIdempotency/Lockは別問題です。

---

# 40. LiveKit Token Abuse

同一User/Meetingから大量Tokenを発行できないようにしてください。

Cross Tenant Token発行防止も再テストしてください。

---

# 41. Presigned URL Abuse

以下へRate Limitしてください。

```text
Recording Upload URL
Recording Download URL
```

Presigned URLを大量発行できないこと。

---

# 42. IDOR全体レビュー

以下のResource APIについて、URL IDを書き換えて越境できないか確認してください。

```text
organizationId
projectId
ticketId
commentId
meetingId
participantId
transcriptId
minutesId
candidateId
recordingId
```

---

# 43. Resource認可原則

必ず:

```text
resourceId
↓
DB Resource
↓
projectId / organizationId
↓
Membership
```

で認可してください。

禁止:

```text
Client projectId
+
resourceId
```

だけでPermission判断。

---

# 44. Cross Tenant情報漏えい

他Tenant Resourceについて以下を返してはいけません。

```text
Resource name
Owner
Member
Project name
Meeting title
Existence detail
```

403/404方針を統一してください。

---

# 45. Tenant Isolation再テスト

Organization A UserからOrganization Bへ:

```text
Project
Ticket
Comment
Meeting
Transcript
Minutes
Candidate
Recording
LiveKit Room Token
```

すべてアクセス不可であること。

---

# 46. Mass Assignment全体レビュー

各PATCH/POST Schemaを確認してください。

Clientから変更禁止:

```text
id
organizationId
projectId

createdBy
createdAt

role

sourceMeetingId
sourceCandidateId

meetingId
minutesId

confidence

aiModel
promptVersion
schemaVersion

registeredTicketId

audit fields
```

---

# 47. strict Validation

Zod Schemaでは可能な範囲で:

```ts
.strict()
```

を利用し、想定外Fieldを拒否してください。

既存API互換性を壊す場合は慎重に適用してください。

---

# 48. Role Escalation

以下を全APIで再検査してください。

```json
{
  "role": "owner"
}
```

をClientから送信して権限昇格できないこと。

---

# 49. CSRF

Auth.js Cookie Sessionを利用するState-changing APIについて既存CSRF対策を確認してください。

対象:

```text
POST
PATCH
DELETE
```

---

# 50. CSRF方針

Auth.js標準Security機構を壊さないでください。

独自APIについて必要なら:

```text
Origin検証
SameSite Cookie
CSRF Token
```

等を検討してください。

---

# 51. Origin Validation

特に重要操作:

```text
AI generate
Candidate approve/reject
Candidate register
Recording URL
LiveKit start/end
```

についてCross-site Requestが容易に成立しない構造を確認してください。

---

# 52. CORS

同一Origin Applicationを基本としてください。

不要な:

```text
Access-Control-Allow-Origin: *
```

は禁止。

Public APIとして必要なEndpointがない限り、Originを限定してください。

---

# 53. Cookie Security

Production想定で以下を確認してください。

```text
Secure
HttpOnly
SameSite
```

Auth.js標準設定を不用意に弱めないでください。

---

# 54. Session Fixation

Auth.js標準Session lifecycleを尊重してください。

Login前後で独自Session IDを固定するような処理を追加しないでください。

---

# 55. Open Redirect

以下を再テストしてください。

```text
callbackUrl
returnTo
redirect
```

等。

任意外部URL:

```text
https://evil.example
```

へRedirectできないこと。

---

# 56. Security Headers

最低限以下を検討・設定してください。

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

Frame制御は:

```text
frame-ancestors
```

等をCSPで設定してください。

---

# 57. CSP

本Applicationで必要なOriginだけ許可してください。

対象を考慮:

```text
Vercel
LiveKit WebSocket
S3 Presigned requests
Auth Provider
```

ただし:

```text
default-src *
connect-src *
script-src *
```

等の全面開放は禁止です。

---

# 58. LiveKit CSP

LiveKit WebSocket/HTTPS endpointを:

```text
connect-src
```

へ必要最小限追加してください。

---

# 59. S3 CSP

Browser → S3 Presigned PUT/GETがCSPで阻害されないよう確認してください。

Bucket endpointを必要範囲で許可してください。

---

# 60. Permissions-Policy

最低限:

```text
camera
microphone
```

をオンライン会議ページで利用可能な方針にしてください。

不要なFeatureは許可しないでください。

---

# 61. HSTS

Production HTTPS前提でHSTSを検討してください。

Development環境へ誤適用しないよう環境差分に注意してください。

---

# 62. X-Content-Type-Options

```text
nosniff
```

を設定してください。

---

# 63. Referrer Policy

Presigned URL等のSensitive Queryが意図せずReferrerへ流出しにくいPolicyを選択してください。

---

# 64. XSSレビュー

以下はすべてUntrusted Contentです。

```text
Organization name
Project name
Ticket title
Ticket description
Comment
Meeting title
Participant display name
Transcript
Minutes
AI Candidate
source quote
```

React標準escapeを利用してください。

---

# 65. dangerouslySetInnerHTML

Application全体を検索してください。

原則:

```text
dangerouslySetInnerHTML
```

を使用しないでください。

必要箇所が存在する場合、理由とSanitization方法を報告してください。

---

# 66. Markdown

将来Markdown表示がある場合、raw HTMLを無条件許可しないでください。

Phase 11でMarkdown Parserを新規導入する必要はありません。

---

# 67. SQL Injection

Application全体を確認してください。

Drizzle Parameterized Queryを利用してください。

禁止:

```text
SQL string concatenation
```

User input:

```text
search
sort
filter
```

をSQL文字列へ直接結合しないでください。

---

# 68. Sort Injection

Ticket / Meeting一覧等の:

```text
sort
order
```

はWhitelistしてください。

任意Column名をSQLへ流さないでください。

---

# 69. Command Injection

Node child_process等を使用している場合、User InputをCommandへ直接渡していないことを確認してください。

通常Applicationでは不要です。

---

# 70. Path Traversal

S3 Object Key、File関連処理について:

```text
../
```

等をClientから注入できないことを確認してください。

S3 KeyはServer生成方針を維持してください。

---

# 71. AI Prompt Injection再レビュー

Phase 6/7の以下を再テストしてください。

```text
System instruction override
Secret extraction
Fake user
Fake transcript
Cross meeting evidence
Different output format
Automatic ticket registration
```

---

# 72. AI Output Trust Boundary

以下のPipelineを維持してください。

```text
AI
↓
JSON parse
↓
Zod
↓
Business validation
↓
Evidence validation
↓
DB
```

ショートカットが追加されていないか確認してください。

---

# 73. Secret管理

以下をRepository全体で検索してください。

```text
DATABASE_URL
AUTH_SECRET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
LIVEKIT_API_SECRET
```

実値がCommitされていないこと。

---

# 74. NEXT_PUBLIC検査

以下が存在しないこと。

```text
NEXT_PUBLIC_DATABASE_URL
NEXT_PUBLIC_AUTH_SECRET
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY
NEXT_PUBLIC_LIVEKIT_API_SECRET
```

---

# 75. Environment Validation

`lib/env.ts`等でEnvironment VariableをZod Validationしてください。

Server-onlyとPublicを明確に分離してください。

---

# 76. `.env.example`

実Secretを書かず、必要Keyだけ記載してください。

---

# 77. `.gitignore`

最低限:

```text
.env
.env.local
.env.*.local
```

等のSecret FileがCommit対象外であることを確認してください。

ただし`.env.example`は管理してください。

---

# 78. Client Bundle Secret検査

Build outputやSource dependency graphからServer-only moduleがClientへBundleされていないことを確認してください。

特に:

```text
AWS
LiveKit server SDK
DB
Auth secret config
```

を確認してください。

---

# 79. server-only

必要なModuleへ:

```ts
import "server-only"
```

等を追加してください。

候補:

```text
lib/db
lib/bedrock
lib/s3
lib/livekit/server
lib/auth/server
```

---

# 80. Dependency Security

利用Dependencyを確認してください。

最低限:

```text
npm audit
```

または既存Package Manager相当を実行してください。

---

# 81. Vulnerability対応

Critical / High vulnerabilityがある場合:

```text
直接依存
推移依存
production dependency
dev dependency
```

を確認し、影響を評価してください。

理由なくMajor Versionへ一括Upgradeしないでください。

---

# 82. Dependency最小化

不要Dependencyを削除してください。

特に:

```text
未使用UI library
未使用AWS client
古いsecurity package
重複utility
```

等を確認してください。

---

# 83. Lockfile

Package LockをGit管理してください。

```text
package-lock.json
```

等。

CIでは:

```text
npm ci
```

を使用してください。

---

# 84. GitHub Actions

`.github/workflows/`をSecurity Reviewしてください。

---

# 85. PRへのProduction Secret

Fork PR等へProduction Secretを渡さないでください。

CI WorkflowのSecret利用条件を確認してください。

---

# 86. Production DB

Preview/PR TestからProduction DATABASE_URLへ接続できないこと。

---

# 87. Production AWS

PR CIからProduction AWS Credentialを利用しないこと。

---

# 88. GitHub Actions Permission

Workflowの:

```yaml
permissions:
```

を必要最小限にしてください。

不要な:

```text
write-all
```

を避けてください。

---

# 89. Third-party Actions

利用するGitHub ActionsについてVersion固定を確認してください。

可能ならCommit SHA pin等を検討してください。

Phase 11で無理に全面変更しなくても構いませんがリスクを報告してください。

---

# 90. Secret Scan

RepositoryのSecret Scanを実行可能にしてください。

GitHub Secret Scanningが利用できる場合は設定方針を記載してください。

Local/CIでSecret検出Scriptを追加しても構いません。

---

# 91. Security Check Script

推奨:

```text
scripts/
├── security-check.ts
└── verify-client-secrets.ts
```

またはShell script等。

最低限:

```text
禁止Env Key
Secret pattern
NEXT_PUBLIC secret
```

等を確認可能にしてください。

---

# 92. File Upload Security

Phase 9 Recordingについて再確認してください。

```text
Content-Type Allowlist
File Size
Private Bucket
HeadObject verification
S3 key server generation
```

---

# 93. Content-Typeだけを信用しない

Phase 9では実ファイルContent Sniffingまでは必須でない場合があります。

ただし:

```text
Content-Typeは完全なMalware防御ではない
```

ことを設計上明記してください。

将来AV Scan等を追加可能な境界を残してください。

---

# 94. Payload Size

API Request Bodyにも合理的な上限を設定してください。

特に:

```text
Transcript bulk
Comments
Minutes edits
Candidate edits
```

無制限巨大JSONを受け付けないでください。

---

# 95. Bulk上限

既存:

```text
Transcript bulk
Candidate bulk registration
```

等の件数上限を再確認してください。

---

# 96. DoS対策

最低限:

```text
AI input size
Bulk array size
Upload size
Rate limit
Provider timeout
DB query pagination
```

で防御してください。

---

# 97. Provider Timeout

外部Provider呼び出しへ明示的なTimeoutを設定してください。

対象:

```text
Bedrock
S3
LiveKit
```

無期限待機を避けてください。

---

# 98. Retry Policy

Retryは一時障害だけにしてください。

禁止:

```text
403 retry
validation retry
business rule retry
```

Transport ErrorとBusiness Errorを分離してください。

---

# 99. Retry上限

無限Retryを禁止してください。

---

# 100. LoggingとRetry

RetryごとにSecret/Raw PayloadをLogしないでください。

回数だけ記録してください。

---

# 101. Database Security

最低限以下を確認してください。

```text
TLS
Parameterized queries
Least privilege DB credential
Migration credential separation
```

Production Credential変更は行わないでください。

---

# 102. DB Tenant Query

一覧Queryで:

```text
全TenantをSELECT
↓
Application側filter
```

を行っていないか再確認してください。

DB Query段階で対象Tenant/Userへ限定してください。

---

# 103. Soft Delete

Ticket等の論理削除済Resourceが通常APIから取得できないことを再確認してください。

---

# 104. Audit Log API

Audit一覧をユーザー向けにまだ提供しない場合、Phase 11で無理にUIを作る必要はありません。

ただし将来管理者向けAudit Viewerを実装可能なSchema/Serviceにしてください。

---

# 105. Security Event

以下をSecurity Eventとして記録可能にしてください。

```text
Repeated authorization failure
Rate limit exceeded
Cross tenant access attempt
Invalid role escalation attempt
Repeated AI abuse
```

通常AuditとSecurity Logのどちらへ保存するか整理してください。

---

# 106. Security Logの注意

攻撃者入力をそのままLogに埋め込み、Log Injectionを起こさないようにしてください。

構造化Loggerを利用してください。

---

# 107. Newline Log Injection

User inputに:

```text
\n
\r
```

があってもログフォーマットが壊れない構造にしてください。

JSON Structured Logを推奨します。

---

# 108. Sensitive Query Parameter

URL QueryへSecretを入れないでください。

Presigned URLは外部S3 URLとしてのみ利用し、Application Routeの通常Logへ全文を保存しないでください。

---

# 109. Error Page

Application UIで:

```text
401
403
404
429
500
```

を安全に表示してください。

---

# 110. 500 UI

例:

```text
処理中にエラーが発生しました。
再度お試しください。
Request ID: xxx
```

程度。

内部Exception内容を表示しないでください。

---

# 111. 429 UI

```text
短時間に操作が集中しています。
少し時間をおいて再度お試しください。
```

等を表示。

可能ならRetry-Afterを利用してください。

---

# 112. Graceful Degradation

外部Provider障害時:

Bedrock障害:

```text
AI機能のみ停止
Ticket/Meetingは利用可能
```

S3障害:

```text
Recordingのみ停止
```

LiveKit障害:

```text
オンライン会議のみ停止
```

を維持してください。

---

# 113. Feature Flag

既存:

```text
AI feature
Recording feature
Live Meeting feature
```

等をFeature Flagで停止可能な構造にしてください。

---

# 114. Security Headers Test

最低限:

```text
SEC-HDR-01
CSP

SEC-HDR-02
X-Content-Type-Options

SEC-HDR-03
Referrer-Policy

SEC-HDR-04
Permissions-Policy

SEC-HDR-05
HSTS production
```

を確認してください。

---

# 115. Auth Security Test

最低限:

```text
SEC-AUTH-01
unauthenticated protected API

SEC-AUTH-02
open redirect

SEC-AUTH-03
cookie attributes

SEC-AUTH-04
client role escalation
```

---

# 116. Tenant Security Test

最低限:

```text
SEC-TENANT-01
Organization

SEC-TENANT-02
Project

SEC-TENANT-03
Ticket

SEC-TENANT-04
Meeting

SEC-TENANT-05
Minutes

SEC-TENANT-06
Candidate

SEC-TENANT-07
Recording

SEC-TENANT-08
LiveKit Token
```

---

# 117. Injection Security Test

```text
SEC-INJ-01
SQL injection in search

SEC-INJ-02
Sort injection

SEC-INJ-03
Stored XSS Ticket

SEC-INJ-04
Stored XSS Comment

SEC-INJ-05
Stored XSS Transcript

SEC-INJ-06
Stored XSS AI output
```

---

# 118. Mass Assignment Test

```text
SEC-MASS-01
createdBy

SEC-MASS-02
projectId

SEC-MASS-03
organizationId

SEC-MASS-04
role

SEC-MASS-05
sourceCandidateId

SEC-MASS-06
registeredTicketId

SEC-MASS-07
aiModel
```

---

# 119. AI Security Test

Phase 6/7のTestを再利用してください。

```text
SEC-AI-01
Prompt injection

SEC-AI-02
Secret extraction

SEC-AI-03
Fake user

SEC-AI-04
Fake transcript

SEC-AI-05
Cross meeting evidence

SEC-AI-06
Automatic ticket creation attempt
```

---

# 120. Rate Limit Test

```text
SEC-RATE-01
AI Minutes limit

SEC-RATE-02
AI Candidate limit

SEC-RATE-03
LiveKit Token limit

SEC-RATE-04
S3 Upload URL limit

SEC-RATE-05
S3 Download URL limit
```

期待:

```text
429
Retry-After
```

---

# 121. Secret Test

```text
SEC-SECRET-01
Git tracked secretなし

SEC-SECRET-02
NEXT_PUBLIC secretなし

SEC-SECRET-03
Client bundle secretなし

SEC-SECRET-04
Log secretなし

SEC-SECRET-05
Error response secretなし
```

---

# 122. Audit Test

```text
AUD-T01
Ticket create audit

AUD-T02
Minutes generate audit

AUD-T03
Candidate approve audit

AUD-T04
Candidate → Ticket audit

AUD-T05
Recording audit

AUD-T06
Live Meeting audit
```

---

# 123. Request ID Test

```text
REQ-T01
Success responseにrequestId

REQ-T02
Validation errorにrequestId

REQ-T03
500 errorにrequestId

REQ-T04
Logとresponse requestId一致
```

---

# 124. Error Test

最低限:

```text
ERR-T01
Zod error

ERR-T02
Unauthorized

ERR-T03
Forbidden

ERR-T04
Not Found

ERR-T05
Conflict

ERR-T06
DB failure

ERR-T07
Bedrock failure

ERR-T08
S3 failure

ERR-T09
LiveKit failure
```

ClientへInternal detailが漏れないこと。

---

# 125. E2E Security Smoke

最低限以下をE2EまたはIntegrationで確認してください。

```text
Login
↓
Project A
↓
Project B ID改ざん
↓
Access denied

Ticket ID改ざん
↓
Access denied

Meeting ID改ざん
↓
Access denied

Candidate ID改ざん
↓
Access denied

Recording ID改ざん
↓
Access denied
```

---

# 126. Security Test Directory

推奨:

```text
tests/
└── security/
    ├── authentication.test.ts
    ├── authorization.test.ts
    ├── tenant-isolation.test.ts
    ├── rate-limit.test.ts
    ├── xss.test.ts
    ├── injection.test.ts
    ├── mass-assignment.test.ts
    ├── ai-security.test.ts
    ├── secret-leak.test.ts
    ├── security-headers.test.ts
    └── audit.test.ts
```

---

# 127. Dependency Test

CIで可能なら:

```bash
npm audit
```

を実行してください。

ただしLow severityだけでCIを無意味に停止する等は避け、Critical/Highの扱いを明確化してください。

---

# 128. CI Security Workflow

推奨:

```text
.github/workflows/
└── security.yml
```

実行例:

```text
dependency audit
secret check
security unit test
build
```

---

# 129. CIで行わないこと

Security Workflowから:

```text
Production DB変更
Production S3変更
Production LiveKit変更
```

を行わないでください。

---

# 130. Lint / Type Safety

Security処理だからといって:

```text
eslint-disable
@ts-ignore
any
```

を大量追加しないでください。

---

# 131. Feature-specific Security Review

以下を1つずつ確認してください。

```text
Organization
Project
Ticket
Meeting
AI Minutes
AI Candidate
Registration
Recording
Live Meeting
```

---

# 132. Security Review Matrix

最低限以下を整理してください。

```text
Feature
Authentication
Authorization
Validation
Rate Limit
Audit
Tenant Isolation
Secret Risk
External Provider
```

READMEまたはSecurity documentとして残して構いません。

---

# 133. Security Checklist

例:

```text
SEC-CHECK-01
全protected API Authentication

SEC-CHECK-02
全resource API Authorization

SEC-CHECK-03
全input Zod validation

SEC-CHECK-04
Mass Assignment防止

SEC-CHECK-05
Tenant isolation

SEC-CHECK-06
Rate limit

SEC-CHECK-07
Audit

SEC-CHECK-08
Sensitive logなし

SEC-CHECK-09
Secret client露出なし

SEC-CHECK-10
Security headers

SEC-CHECK-11
Provider timeout

SEC-CHECK-12
Safe error
```

---

# 134. Production Readiness Script

必要なら:

```text
scripts/production-readiness.ts
```

等を作成してください。

確認:

```text
Required env keys
Forbidden NEXT_PUBLIC secrets
Feature flags
Security headers
Production build
```

ただしProductionへ接続・変更してはいけません。

---

# 135. Security Hardeningで変更しないもの

このPhaseで新しい業務要件を勝手に追加しないでください。

例:

```text
Billing
Notifications
External Jira integration
New AI features
Guest meeting invite
Speech-to-Text
```

は対象外です。

---

# 136. Phase 11で実装しないもの

以下はPhase 12以降です。

```text
Full Production E2E
Load Test本番実行
Production Migration
Production Deploy
Production Data Migration
Production SLO Alert本設定
Production Secret登録
Production Domain変更
```

---

# 137. セキュリティ禁止事項

絶対に以下をしないでください。

```text
Stack TraceをClient返却

Raw DB ErrorをClient返却

AWS Raw ErrorをClient返却

LiveKit Raw ErrorをClient返却

SecretをLog出力

TokenをLog出力

CookieをLog出力

Presigned URLをLog出力

AI Raw Outputを通常Log出力

Client roleを信用

Client projectIdだけで認可

Client organizationIdだけで認可

一覧取得後Client側Tenant Filter

Mass Assignment

SQL文字列連結

dangerouslySetInnerHTML

Access-Control-Allow-Origin *

NEXT_PUBLIC Secret

In-memory Rate LimitをProduction唯一の防御とする

Rate LimitなしAI Endpoint

Rate LimitなしToken発行

無限Retry

Critical vulnerabilityを無視

PRへProduction Secretを渡す

PreviewからProduction DBへ接続

Production環境変更
```

---

# 138. 実装ルール

1. Phase 0〜10コードを最初に確認する。
2. 新機能追加ではなく横断的Hardeningを優先する。
3. 共通Error処理を再利用する。
4. 全API Responseを統一する。
5. Request IDを全Requestへ付与する。
6. Audit actionを共通化する。
7. Structured Loggingを利用する。
8. Sensitive Data Redactionを実装する。
9. Critical EndpointへRate Limitを適用する。
10. Tenant Isolationを全Resourceで再検査する。
11. Mass Assignmentを再検査する。
12. Zod strict Validationを検討する。
13. CSRF/CORS/Cookieを確認する。
14. Security Headersを設定する。
15. XSS/InjectionをTestする。
16. Secret Client Exposureを検査する。
17. Dependency Securityを検査する。
18. CI Security Workflowを整備する。
19. Provider Timeout/Retryを統一する。
20. Phase 12へ先回りしない。
21. Production環境を変更しない。

---

# 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

安全なTest DBが存在する場合:

```bash
npm run test:integration
```

Security Test scriptを追加した場合:

```bash
npm run test:security
```

Dependency:

```bash
npm audit
```

E2E設定済みの場合:

```bash
npm run test:e2e
```

Secret検査Scriptがある場合:

```bash
npm run security:secrets
```

Production Environmentへ接続しないでください。

---

# Phase 11 Definition of Done

以下をすべて満たした場合のみPhase 11完了としてください。

- 全APIにrequestIdがある
- Success/Error Response形式が統一されている
- 共通Application Errorがある
- Raw Provider ErrorをClientへ返していない
- Stack TraceをClientへ返していない
- DB Errorを安全に変換している
- Structured Loggingがある
- Sensitive Data Redactionがある
- Secret/Token/Presigned URLをLogしていない
- Audit Actionが共通化されている
- 重要操作がAudit対象になっている
- Auditを一般APIから改ざんできない
- AI EndpointにRate Limitがある
- S3 Presigned URL APIにRate Limitがある
- LiveKit Token APIにRate Limitがある
- 429/Retry-Afterを処理できる
- Production向けRate LimitがProcess Memoryだけに依存しない設計
- 全ResourceのIDORを再確認済み
- Tenant Isolation Testが全主要Resourceにある
- Client roleを信用していない
- Mass Assignment対策がある
- CSRF方針が確認されている
- CORSが必要最小限
- Production CookieがSecure/HttpOnly/SameSite
- Open Redirectを防止している
- CSPがある
- X-Content-Type-Optionsがある
- Referrer-Policyがある
- Permissions-Policyがある
- Production HSTS方針がある
- LiveKit/S3を考慮したCSPになっている
- dangerouslySetInnerHTMLを原則使用していない
- SQL文字列連結を使用していない
- Sort/Filter Injectionを防止している
- S3 Key Injectionを防止している
- AI Prompt Injection Testがある
- AI Output Validationを迂回していない
- SecretがGitへ含まれていない
- SecretがNEXT_PUBLICへ含まれていない
- Server-only moduleがClientへ露出していない
- npm audit等でDependency確認済み
- Lockfileが管理されている
- GitHub Actions Permissionが最小化されている
- PRへProduction Secretを渡していない
- PreviewからProduction DBへ接続しない
- Security Test Suiteがある
- Graceful Degradationが維持されている
- lint成功
- typecheck成功
- unit test成功
- security test成功
- build成功
- Production環境を変更していない

---

# 作業終了時報告形式

以下の形式で必ず報告してください。

```text
## Phase 11 Security Hardening 実装結果

### 1. Request / API
- Request ID:
- Success envelope:
- Error envelope:
- Validation error:
- HTTP status:

### 2. Error Handling
- Application Error:
- DB error:
- Bedrock error:
- S3 error:
- LiveKit error:
- Stack trace exposure:

### 3. Logging
- Structured logger:
- Request context:
- Redaction:
- Secret logging:
- Token logging:
- Presigned URL logging:

### 4. Audit
- Common actions:
- Organization:
- Project:
- Ticket:
- Meeting:
- AI:
- Candidate:
- Recording:
- Live meeting:
- Tamper protection:

### 5. Rate Limit
- Implementation:
- Storage:
- AI Minutes:
- AI Candidate:
- S3 Upload URL:
- S3 Download URL:
- LiveKit Token:
- Retry-After:

### 6. Authentication Security
- Cookie:
- CSRF:
- Open redirect:
- Session:
- Origin validation:

### 7. Authorization / IDOR
- Organization:
- Project:
- Ticket:
- Meeting:
- Minutes:
- Candidate:
- Recording:
- LiveKit:
- Tenant isolation:

### 8. Input Security
- Zod:
- strict:
- Mass Assignment:
- SQL Injection:
- Sort Injection:
- Path/S3 Key Injection:
- Payload limit:

### 9. Web Security Headers
- CSP:
- HSTS:
- X-Content-Type-Options:
- Referrer-Policy:
- Permissions-Policy:
- frame-ancestors:

### 10. XSS
- Organization/Project:
- Ticket/Comment:
- Transcript:
- Minutes:
- Candidate:
- dangerouslySetInnerHTML:

### 11. AI Security
- Prompt Injection:
- Evidence:
- User ID:
- Raw output:
- Secret exposure:
- Direct Ticket creation:

### 12. Secret Management
- Git:
- .env:
- NEXT_PUBLIC:
- Client bundle:
- Server-only:

### 13. Dependency / Supply Chain
- npm audit:
- Critical:
- High:
- Unused dependencies:
- Lockfile:
- GitHub Actions:
- Third-party action pinning:

### 14. Provider Security
- Bedrock timeout/retry:
- S3 timeout/retry:
- LiveKit timeout/retry:
- Graceful degradation:

### 15. Security Tests
- SEC-AUTH:
- SEC-TENANT:
- SEC-INJ:
- SEC-MASS:
- SEC-AI:
- SEC-RATE:
- SEC-SECRET:
- SEC-HDR:
- AUD:
- ERR:
- REQ:

### 16. CI Security
- security.yml:
- dependency scan:
- secret scan:
- security tests:
- Production secret isolation:

### 17. Production Readiness
- Environment validation:
- Security check script:
- Feature flags:
- Remaining risks:

### 18. 実行結果
- lint:
- typecheck:
- unit:
- integration:
- security:
- dependency audit:
- e2e:
- build:

### 19. 作成・変更ファイル
- ...

### 20. DB Migration差分
- なし
または
- ...

### 21. 未実施・未解決事項
- ...

### 22. Phase 12への引継ぎ
- ...
```

既存コード、要件定義書、基本設計書、DB設計書、API詳細設計書、画面詳細設計書、AI Prompt/JSON Schema設計書、テスト詳細設計書、セキュリティ設計書、インフラ構築設計書、リリース・運用設計書を参照し、合理的に判断可能な事項は質問せず実装してください。

ただし以下は実行しないでください。

```text
Production DB Migration
Production DB変更

Production AWS/IAM変更
Production S3変更
Production LiveKit変更

Production Secret登録
Production Domain変更
Production Deploy

課金を伴う新規Production Resource作成
破壊的Production操作
```

Local / Test / Staging相当の安全な環境、Mock、Fixtureを利用し、Phase 11として完成可能な範囲まで実装してください。