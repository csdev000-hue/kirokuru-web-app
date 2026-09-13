あなたはAWS、Amazon S3、Next.js、バックエンド、セキュリティに精通したシニアフルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 9を実装してください。

# Phase 9の目的

Phase 9では、Meetingに紐づく録音ファイルをAmazon S3へ安全に保存し、`meeting_recordings`で管理します。

完成フローは以下です。

```text
Meeting
↓
Upload Request
↓
Authentication / Authorization
↓
Recording metadata作成
↓
S3 Presigned PUT URL発行
↓
Browser → S3直接Upload
↓
Upload Complete API
↓
S3 Object存在確認
↓
Recording status更新
↓
Download Request
↓
Permission確認
↓
Presigned GET URL発行
```

重要:

```text
S3 Bucket
=
Private
```

としてください。

録音データをPublic URLで公開してはいけません。

---

# 最重要原則

以下を必ず守ってください。

```text
Browser
↓
Vercel API
↓
Authentication
↓
Meeting Authorization
↓
短期Presigned URL発行
↓
Browser
↓
S3
```

禁止:

```text
Public S3 Bucket
```

```text
S3 permanent public URL
```

```text
BrowserへAWS Secret Access Keyを渡す
```

```text
Clientが任意S3 Keyを指定する
```

---

# 前提

Phase 0〜8が完了している前提です。

最低限以下が存在します。

```text
lib/
├── s3/
│   └── client.ts
├── auth/
├── permissions/
├── security/
├── db/
└── services/
    ├── meeting-service.ts
    └── meeting-transcript-service.ts
```

DB:

```text
meetings
meeting_recordings
projects
project_members
audit_logs
```

が存在します。

---

# meeting_recordings

Phase 1で以下のSchemaが存在しています。

```text
id
meeting_id
s3_key
content_type
file_size
duration_seconds
status
created_at
```

status:

```text
uploading
uploaded
processing
completed
failed
```

必要に応じて`updated_at`等を追加する場合はMigration理由を報告してください。

---

# Phase 9実装範囲

以下を実装してください。

```text
1. S3 Client正式実装
2. Private Bucket前提
3. Recording Upload URL発行
4. 安全なS3 Object Key生成
5. Content-Type Validation
6. File Size制限
7. Presigned PUT
8. Upload Complete処理
9. S3 HEAD確認
10. Recording status管理
11. Recording一覧
12. Recording詳細
13. Presigned GET
14. Recording削除
15. S3/DB整合性
16. Orphan対策
17. Retry / Error handling
18. Authorization
19. Tenant Isolation
20. Audit Log
21. Security Test
22. Integration Test
23. UI
24. E2E
```

---

# 1. S3 Client

Phase 0で作成した:

```text
lib/s3/client.ts
```

を正式実装してください。

AWS SDK v3を使用してください。

想定:

```ts
import { S3Client } from "@aws-sdk/client-s3"
```

設定値:

```env
AWS_REGION=
S3_BUCKET_NAME=
```

必要なCredentialはServer-sideのみで参照してください。

---

# 2. AWS Credential

以下をBrowserへ渡してはいけません。

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
```

Productionでは可能であれば長期Access KeyではなくIAM Role/OIDC等へ移行できる構造としてください。

Phase 9でProduction Credentialを新規作成しないでください。

---

# 3. S3 Bucket

前提:

```text
Block Public Access = ON
```

としてください。

録音ファイルへ以下でアクセスする設計は禁止です。

```text
https://bucket.s3.amazonaws.com/meeting.mp4
```

常に認可後のPresigned URLを利用してください。

---

# 4. Server-side専用

S3 ClientをClient Componentからimportできない構造を維持してください。

必要に応じて:

```ts
import "server-only"
```

等を利用してください。

---

# 5. Object Key設計

S3 Object KeyはServer側で生成してください。

推奨:

```text
organizations/{organizationId}/
projects/{projectId}/
meetings/{meetingId}/
recordings/{recordingId}.{extension}
```

例:

```text
organizations/xxx/projects/yyy/meetings/zzz/recordings/abc.webm
```

---

# 6. Object Keyに使用しないもの

以下をそのままKeyへ使用しないでください。

```text
Meeting title
User name
Original filename
Email
```

個人情報漏えい、Path操作、特殊文字問題を避けるためです。

---

# 7. recordingId

最初にApplication側で:

```text
recordingId
```

を発行し、そのIDからS3 Keyを作成してください。

Clientが任意のrecordingIdやs3_keyを自由に指定できないようにしてください。

---

# 8. Upload URL API

以下を実装してください。

推奨:

```text
POST /api/meetings/:meetingId/recordings/upload-url
```

Request例:

```json
{
  "contentType": "audio/webm",
  "fileSize": 15728640
}
```

必要なら:

```text
fileExtension
```

を受けても構いませんが、Content-Typeとの対応をServerで検証してください。

---

# 9. Upload Permission

Upload URL発行:

```text
Project owner
Project member
```

のみ。

viewer:

```text
403
```

必ず:

```text
meetingId
↓
meeting.project_id
↓
requireProjectMember
```

で認可してください。

ClientからprojectId / organizationIdを受け取って認可してはいけません。

---

# 10. Meeting存在確認

Upload URL発行前に:

```text
Meeting exists
Project exists
Project permission
```

を確認してください。

別Tenant Meetingの場合:

```text
403 / 404
```

として情報漏えいを防止してください。

---

# 11. Content-Type Allowlist

許可する録音形式を明示してください。

MVP例:

```text
audio/webm
audio/mp4
audio/mpeg
audio/wav
video/webm
video/mp4
```

実際の録音方式に合わせて必要最小限にしてください。

以下は禁止:

```text
任意Content-Type
```

Client指定値を無条件に信用しないでください。

---

# 12. Extension Mapping

Content-TypeからServer側でExtensionを決定してください。

例:

```text
audio/webm → webm
audio/mp4  → m4a
audio/mpeg → mp3
audio/wav  → wav
video/webm → webm
video/mp4  → mp4
```

Clientのfilename extensionを信用しないでください。

---

# 13. File Size制限

無制限Uploadを禁止してください。

MVPの上限を環境変数または設定値として定義してください。

例:

```text
MAX_RECORDING_FILE_SIZE_BYTES
```

例示値:

```text
500 MB
```

ただし実際のMVP要件・Vercel/S3/録音時間を考慮して合理的な値を選択してください。

---

# 14. fileSize

Clientから事前申告された:

```text
fileSize
```

をValidationしてください。

最低:

```text
> 0
```

最大:

```text
<= MAX_RECORDING_FILE_SIZE_BYTES
```

---

# 15. Client fileSizeを最終的な正にしない

Client申告値はUpload URL発行時の早期Validation用です。

Upload完了時:

```text
S3 HeadObject
```

で実際の:

```text
ContentLength
ContentType
```

を再確認してください。

---

# 16. Presigned PUT

AWS SDK:

```text
PutObjectCommand
```

+

```text
getSignedUrl()
```

等を利用してください。

TTL:

```text
短時間
```

としてください。

例:

```text
5〜15分
```

程度。

コード内に無意味に長い有効期限を固定しないでください。

---

# 17. Presigned PUT条件

可能な範囲で以下を固定してください。

```text
Bucket
Key
Content-Type
```

必要に応じてServer-side encryption等も指定してください。

---

# 18. Encryption

S3 Server Side Encryptionを利用してください。

Bucket Default Encryptionでも構いません。

可能なら:

```text
SSE-S3
```

または企業要件に応じて:

```text
SSE-KMS
```

へ拡張可能な構造としてください。

MVPで不要なKMS複雑化は避けて構いません。

---

# 19. Upload URL発行前DB登録

Upload URL発行時に:

```text
meeting_recordings
```

へRecordを作成してください。

例:

```text
status = uploading
```

保存:

```text
id
meeting_id
s3_key
content_type
file_size = client declared size または NULL
status = uploading
```

---

# 20. Upload URL Response

例:

```json
{
  "data": {
    "recordingId": "uuid",
    "uploadUrl": "https://...",
    "expiresIn": 600
  },
  "requestId": "..."
}
```

以下を返さないでください。

```text
AWS Secret
Bucket Credential
Internal IAM情報
```

`s3Key`もClientで不要なら返さないことを推奨します。

---

# 21. Browser Upload

Browserは取得したPresigned URLへ直接Uploadします。

```text
Browser
↓
PUT
↓
S3
```

Next.js/Vercel Serverを録音バイナリの中継に使わないでください。

---

# 22. Vercel経由Upload禁止

禁止:

```text
Browser
↓
巨大録音ファイル
↓
Next.js Route Handler
↓
S3
```

Presigned Uploadを利用し、Vercel FunctionのBody Size/Execution/帯域負荷を回避してください。

---

# 23. Upload Complete API

以下を実装してください。

```text
POST /api/recordings/:recordingId/complete
```

または:

```text
POST /api/meetings/:meetingId/recordings/:recordingId/complete
```

既存API詳細設計に合わせてください。

Request Bodyは原則不要です。

---

# 24. Complete Permission

必ずRecordingからMeeting/ProjectをDBで辿って認可してください。

```text
recordingId
↓
meeting_id
↓
meeting.project_id
↓
requireProjectMember
```

Clientが送ったmeetingId/projectIdだけを信用しないでください。

---

# 25. Complete時HeadObject

S3へ:

```text
HeadObject
```

を実行してください。

確認:

```text
Object exists
ContentLength
ContentType
```

Objectがない場合:

```text
RECORDING_OBJECT_NOT_FOUND
```

等で失敗させてください。

---

# 26. Content-Type再検証

HeadObjectで得たContent-Typeが許可形式か確認してください。

Upload URL発行時のrecording.content_typeとの不一致も検知してください。

不一致:

```text
RECORDING_CONTENT_TYPE_MISMATCH
```

---

# 27. Size再検証

実File Size:

```text
ContentLength
```

が上限を超えている場合は完了扱いにしないでください。

必要ならS3 Object削除のCompensationを実施してください。

---

# 28. Complete成功

検証成功後:

```text
status = uploaded
```

へ変更してください。

DB:

```text
file_size = actual ContentLength
content_type = verified ContentType
```

へ正規化してください。

---

# 29. status state machine

Phase 9では以下を明確化してください。

```text
uploading
↓
uploaded
↓
processing
↓
completed
```

異常:

```text
uploading
uploaded
processing
↓
failed
```

---

# 30. Phase 9でのstatus用途

Phase 9では最低限:

```text
uploading
uploaded
failed
```

を実処理で利用します。

```text
processing
completed
```

はPhase 10以降の録音処理・音声認識等で利用できるよう維持してください。

---

# 31. 不正status transition

例えば:

```text
completed → uploading
```

等を通常APIから自由に変更できないようにしてください。

statusは専用Service経由で変更してください。

---

# 32. status Service

例:

```ts
markRecordingUploaded(...)
markRecordingProcessing(...)
markRecordingCompleted(...)
markRecordingFailed(...)
```

または:

```ts
transitionRecordingStatus(...)
```

を実装してください。

---

# 33. Recording一覧API

以下を実装してください。

```text
GET /api/meetings/:meetingId/recordings
```

Permission:

```text
Project viewer以上
```

Response例:

```json
{
  "data": [
    {
      "id": "...",
      "meetingId": "...",
      "contentType": "audio/webm",
      "fileSize": 15728640,
      "durationSeconds": 1800,
      "status": "uploaded",
      "createdAt": "..."
    }
  ]
}
```

`s3_key`を通常Responseへ出す必要はありません。

---

# 34. Recording詳細

必要なら:

```text
GET /api/recordings/:id
```

を実装してください。

viewer以上。

S3 Key等の内部Storage情報は必要最小限にしてください。

---

# 35. Download URL API

以下を実装してください。

```text
POST /api/recordings/:recordingId/download-url
```

または:

```text
GET /api/recordings/:recordingId/download-url
```

既存API規約に合わせてください。

副作用はURL発行だけなのでGETでも可能ですが、監査・Rate Limitを考慮してPOSTでも構いません。

---

# 36. Download Permission

最低権限:

```text
Project viewer
```

です。

必ず:

```text
recording
↓
meeting
↓
project
↓
permission
```

を確認してください。

---

# 37. Download Presigned URL

S3:

```text
GetObjectCommand
```

を利用してください。

TTL:

```text
短時間
```

例:

```text
5〜15分
```

---

# 38. Download URLを永続保存しない

Presigned URLは:

```text
DB保存禁止
```

です。

必要なときに都度発行してください。

---

# 39. Recording UI

Meeting詳細画面へ:

```text
Recording
```

Sectionを実装してください。

最低限:

```text
File type
File size
Duration
Status
Uploaded at
```

---

# 40. Upload UI

owner/member:

```text
録音ファイルをアップロード
```

を利用可能。

viewer:

```text
Read Only
```

---

# 41. Upload UIフロー

```text
File選択
↓
Client事前Validation
↓
Upload URL API
↓
Presigned PUT
↓
Progress表示
↓
Complete API
↓
Recording一覧更新
```

---

# 42. Client事前Validation

UX向上のため:

```text
content type
file size
```

をClientでも確認してください。

ただしSecurity境界はServerです。

Client Validationだけに依存しないでください。

---

# 43. Upload Progress

可能なら:

```text
0〜100%
```

を表示してください。

Fetchで困難ならXHR等の最小構成を検討してください。

不要な巨大Upload libraryを安易に追加しないでください。

---

# 44. Upload Error

Upload失敗:

```text
アップロードに失敗しました
```

Retry可能なUIにしてください。

失敗時にDB Recordが永遠に`uploading`のままになることを考慮してください。

---

# 45. Upload Retry

同じRecording RecordへPresigned URLを再発行するか、新しいRecordingを作るか方針を明確にしてください。

MVP推奨:

```text
uploading + Objectなし
→ 同recordingId用URL再発行可能
```

ただし一定時間を超えた古いrecordingはfailed化できる設計にしてください。

---

# 46. Upload URL再発行API

必要なら:

```text
POST /api/recordings/:id/upload-url
```

を実装できます。

条件:

```text
status = uploading
```

のみ。

completed/failed等に無制限再発行しないでください。

---

# 47. Presigned URL漏えい

Presigned URL自体は期限内にObjectへアクセスできるBearer URL相当です。

以下へ出さないでください。

```text
Audit Log
Application Log
Analytics
Error tracking
```

URL全文のLogは禁止です。

---

# 48. CORS

S3 Bucket CORSは必要最小限としてください。

例:

```text
AllowedOrigins:
- Local
- Staging
- Production app domain

AllowedMethods:
- PUT
- GET

AllowedHeaders:
- 必要なもののみ
```

本番で:

```text
AllowedOrigins: *
```

を安易に利用しないでください。

---

# 49. DELETE Recording API

以下を実装してください。

```text
DELETE /api/recordings/:id
```

権限:

```text
Project owner/member
```

viewerは禁止。

---

# 50. 録音削除の基本方針

RecordingはMeeting Evidenceの元データとなり得ます。

そのため削除時は依存関係を確認してください。

Phase 9では少なくとも:

```text
Transcript / Minutes / AI処理への利用前
```

のみ自由削除可能とする等、安全側を選択してください。

---

# 51. S3とDBはTransactionできない

重要:

```text
PostgreSQL Transaction
≠
S3 Transaction
```

です。

S3 DeleteとDB Deleteを完全な単一Transactionとして扱わないでください。

---

# 52. Recording削除順序

推奨例:

```text
1. DBでRecording/Permission/Dependency確認
2. DeleteObject実行
3. Delete成功確認
4. DB Recordを削除またはfailed/deleted相当へ更新
5. Audit
```

ただし各ステップの失敗時挙動を定義してください。

---

# 53. DB Schemaにdeleted_atがない場合

Phase 9では以下のどちらかを選択してください。

A:

```text
物理削除
```

ただし依存なしRecordingのみ。

B:

```text
deleted_at追加
```

録音監査/復旧要件が強い場合。

既存DB設計を優先し、不必要なSchema変更をしないでください。

変更した場合は理由を報告してください。

---

# 54. S3 Delete失敗

S3 Delete失敗時にDBだけ削除するとOrphan Objectが残る可能性があります。

安全側の挙動を選択してください。

例:

```text
S3 delete失敗
→ DB削除しない
→ retry可能
```

---

# 55. DB Update失敗

S3 Object削除成功後、DB更新が失敗する可能性があります。

これは完全にはAtomicにできません。

補償処理またはReconciliation可能な状態を設計してください。

---

# 56. Orphan Object

以下が起こり得ます。

```text
S3 Objectあり
DB Recordなし
```

または:

```text
DB Recordあり
S3 Objectなし
```

これを検出できる運用方針を用意してください。

---

# 57. Orphan Cleanup

Phase 9では自動Batch実装まで必須ではありません。

最低限:

```text
scripts/
└── check-recording-consistency.ts
```

等で確認可能な構造を検討してください。

ただしProductionへ勝手に削除処理を実行しないでください。

---

# 58. stale uploading

Upload URL発行後にユーザーが画面を閉じると:

```text
status = uploading
```

のDB Recordだけ残ります。

一定時間以上経過したRecordを:

```text
failed
```

へ変更可能なCleanup設計を用意してください。

Phase 9ではScript/Serviceの骨組みでも構いません。

---

# 59. Object Key Collision

`s3_key`はDBでUNIQUEです。

さらにUUID recordingIdを利用して衝突を防止してください。

同一original filenameによる衝突は起こさない設計としてください。

---

# 60. Existing Object上書き防止

新規Recordingで既存s3_keyを再利用してはいけません。

UUID Keyにより防止してください。

---

# 61. Metadata信頼境界

DB:

```text
meeting_id
s3_key
```

を正としてください。

Clientから:

```text
s3Key
bucket
meetingId
projectId
```

を送信してDownload/Delete対象を決定してはいけません。

---

# 62. S3 Key Injection

Clientから以下を指定させないでください。

```text
../../other-user/file
```

```text
organizations/other-tenant/...
```

Object Keyは100% Server生成してください。

---

# 63. Tenant Isolation

最重要です。

Organization A Userが:

```text
Organization B
Project B
Meeting B
Recording B
```

へアクセスできないこと。

以下すべて:

```text
List
Detail
Upload URL
Complete
Download URL
Delete
Retry Upload
```

で確認してください。

---

# 64. Cross Tenant S3

User AがRecording BのIDを知っていても:

```text
Presigned GET
Presigned PUT
Delete
```

できないこと。

---

# 65. IDOR

以下:

```text
/api/recordings/{otherTenantRecordingId}/download-url
```

を防止してください。

BucketがPrivateでもApplication Authorizationが弱ければPresigned URLを発行できてしまいます。

必ずDB Permissionを確認してください。

---

# 66. Rate Limit

最低限以下へRate Limitを検討してください。

```text
Upload URL発行
Download URL発行
Complete API
```

特にPresigned URLの大量発行を防止してください。

既存`lib/security/rate-limit.ts`がある場合は再利用してください。

---

# 67. Idempotency

Complete APIは再送される可能性があります。

既に:

```text
status = uploaded
```

かつS3 Objectが正常なら、再度成功扱いにできるIdempotent設計を推奨します。

新しいRecordingを作らないでください。

---

# 68. Complete同時実行

2並列でCompleteが呼ばれても状態破損しないこと。

条件付きUPDATE等を利用してください。

---

# 69. Delete同時実行

2回Deleteされた場合も安全に処理してください。

存在しないObjectをS3 DeleteObjectしても成功扱いとなるAWS挙動を踏まえ、DB状態との一貫した挙動を定義してください。

---

# 70. Duration

`duration_seconds`はPhase 9ではClient申告値を無条件に信用しないでください。

安全なServer-side metadata取得機構がない場合:

```text
NULL
```

のままで構いません。

Phase 10/音声処理Phaseで設定できます。

---

# 71. Recording processing

Phase 9では音声認識処理を開始しないでください。

```text
uploaded
```

までが主な完了点です。

---

# 72. S3 Lifecycle

録音ファイル保持期間に応じてS3 Lifecycleを利用できる構造にしてください。

例:

```text
一定日数後に削除
```

ただし保持期間は運用設計と一致させてください。

Phase 9でProduction Lifecycle Ruleを勝手に設定しないでください。

---

# 73. Environment separation

以下のBucketを混同しないでください。

```text
Development
Staging
Production
```

例:

```env
S3_BUCKET_NAME=
```

を環境ごとに分離してください。

---

# 74. Production Bucket禁止

Local/TestからProduction Bucketを利用しないでください。

Integration Testでは:

```text
Test Bucket
Mock S3
LocalStack相当
```

等を利用してください。

---

# 75. AWS IAM最小権限

Applicationに必要なActionは概念上:

```text
s3:PutObject
s3:GetObject
s3:HeadObject
s3:DeleteObject
```

対象:

```text
対象Recording Bucket/Prefix
```

に限定してください。

不要な:

```text
s3:*
```

は禁止を推奨します。

---

# 76. Bucket管理権限不要

Application Runtimeに以下は不要です。

```text
CreateBucket
DeleteBucket
PutBucketPolicy
```

Runtime Roleへ付与しないでください。

---

# 77. Audit Log

最低限以下を記録してください。

```text
recording.upload_url.issue
recording.upload.complete
recording.upload.failed
recording.download_url.issue
recording.delete
```

必要に応じてretryも記録してください。

---

# 78. Audit metadata

例:

```json
{
  "meetingId": "...",
  "recordingId": "...",
  "contentType": "audio/webm",
  "fileSize": 15728640
}
```

保存禁止:

```text
Presigned URL
S3 credential
Transcript内容
AWS signature
```

---

# 79. Application Log

最低限:

```text
requestId
recordingId
meetingId
projectId
operation
result
durationMs
```

を記録可能にしてください。

---

# 80. S3 Error

以下を共通Errorへ変換してください。

```text
AccessDenied
NoSuchKey
Timeout
5xx
Network Error
```

AWS SDK raw errorをClientへ返さないでください。

---

# 81. Error Code

最低限:

```text
RECORDING_NOT_FOUND
RECORDING_INVALID_STATUS
RECORDING_CONTENT_TYPE_NOT_ALLOWED
RECORDING_FILE_TOO_LARGE
RECORDING_OBJECT_NOT_FOUND
RECORDING_CONTENT_TYPE_MISMATCH
RECORDING_SIZE_MISMATCH
RECORDING_UPLOAD_FAILED
RECORDING_DOWNLOAD_FAILED
RECORDING_DELETE_FAILED
RECORDING_DEPENDENCY_EXISTS
S3_PROVIDER_ERROR
```

---

# 82. HTTP Status例

```text
RECORDING_NOT_FOUND
→ 404

INVALID STATUS
→ 409

CONTENT TYPE
→ 422

FILE TOO LARGE
→ 413 または 422

OBJECT NOT FOUND
→ 409/422

FORBIDDEN
→ 403

S3 PROVIDER ERROR
→ 502

TIMEOUT
→ 504
```

既存API Error方針を優先してください。

---

# 83. API Response envelope

Phase 0以降の形式を維持してください。

成功:

```json
{
  "data": {},
  "requestId": "..."
}
```

Error:

```json
{
  "error": {
    "code": "...",
    "message": "..."
  },
  "requestId": "..."
}
```

---

# 84. Validators

推奨:

```text
lib/validators/
└── recording.ts
```

最低限:

```text
createRecordingUploadSchema
recordingIdSchema
recordingListQuerySchema
```

---

# 85. S3 Service

推奨:

```text
lib/s3/
├── client.ts
├── presigned-url.ts
├── recording-storage.ts
├── config.ts
└── errors.ts
```

---

# 86. Recording Service

推奨:

```text
lib/services/
└── meeting-recording-service.ts
```

最低限:

```ts
createRecordingUpload(...)
completeRecordingUpload(...)
listRecordings(...)
getRecording(...)
createRecordingDownloadUrl(...)
deleteRecording(...)
retryRecordingUpload(...)
```

---

# 87. Storage abstraction

可能であればApplication ServiceからAWS SDKを直接大量に呼ばず:

```ts
interface RecordingStorage {
  createUploadUrl(...)
  headObject(...)
  createDownloadUrl(...)
  deleteObject(...)
}
```

等の薄いAdapterを設けてください。

TestでMockしやすくしてください。

---

# 88. Upload Service責務

```text
Authentication
↓
Meeting Authorization
↓
Request Validation
↓
recordingId生成
↓
s3Key生成
↓
DB recording INSERT(uploading)
↓
Presigned PUT発行
↓
Response
```

---

# 89. Presigned URL発行失敗

DB Recordを先に作った後でURL発行に失敗した場合:

```text
recording.status = failed
```

等へ変更するCompensationを検討してください。

`uploading`のまま放置しないでください。

---

# 90. DB Insert失敗

DB Recording作成失敗時はPresigned URLを発行しないでください。

---

# 91. Complete Service責務

```text
recording取得
↓
Authorization
↓
Status確認
↓
S3 HeadObject
↓
Content-Type確認
↓
File Size確認
↓
DB status = uploaded
↓
Audit
```

---

# 92. Download Service責務

```text
recording取得
↓
Meeting/Project Permission
↓
status確認
↓
S3 Object存在確認（必要に応じて）
↓
短期Presigned GET
↓
Audit
```

---

# 93. Download可能Status

原則:

```text
uploaded
processing
completed
```

を許可。

```text
uploading
failed
```

ではDownload URLを発行しないでください。

---

# 94. UIファイルサイズ表示

例:

```text
15.2 MB
```

等へフォーマットしてください。

ただしDBの正はbyteです。

---

# 95. UI Status

例:

```text
Uploading
Uploaded
Processing
Completed
Failed
```

を表示してください。

色だけではなくテキストも利用してください。

---

# 96. Download UI

viewer以上:

```text
録音を再生 / ダウンロード
```

を利用可能。

クリック時に初めてPresigned GET URLを取得してください。

画面ロード時に大量URLを一括発行しないでください。

---

# 97. Audio/Video Playback

ブラウザの:

```html
<audio>
<video>
```

等を利用して再生して構いません。

ただしPresigned URLを永続state/localStorageへ保存しないでください。

---

# 98. Presigned URL期限切れ

Playback中/再開時に期限切れとなった場合、新しいDownload URLを取得できる構造にしてください。

---

# 99. localStorage禁止

以下を保存しないでください。

```text
Presigned GET URL
Presigned PUT URL
AWS Credential
```

localStorage/sessionStorageへの永続保存は禁止です。

---

# 100. XSS

Recording metadataにOriginal filenameを表示する場合もReact escapeを利用してください。

ただしMVPではOriginal filenameをDBへ保存しなくても構いません。

`dangerouslySetInnerHTML`は禁止です。

---

# 101. API Test

最低限以下を実装してください。

## REC-T01

memberがUpload URL取得。

期待:

```text
201/200
recording.status = uploading
Presigned URLあり
```

## REC-T02

viewerがUpload URL取得。

```text
403
```

## REC-T03

別Tenant Meeting。

```text
403/404
```

## REC-T04

不正Content-Type。

```text
422
```

## REC-T05

File Size超過。

```text
413/422
```

---

# 102. Upload Complete Test

## REC-T06

S3 Objectあり、正常。

期待:

```text
status = uploaded
actual file_size保存
```

## REC-T07

S3 Objectなし。

期待:

```text
失敗
uploadedにならない
```

## REC-T08

Content-Type不一致。

期待:

```text
RECORDING_CONTENT_TYPE_MISMATCH
```

## REC-T09

Size超過。

期待:

```text
uploadedにならない
```

## REC-T10

Complete再送。

期待:

```text
Idempotent
duplicate Recordingなし
```

---

# 103. Download Test

## REC-T11

viewer Download URL。

成功。

## REC-T12

別Tenant Recording。

拒否。

## REC-T13

uploading Recording。

Download拒否。

## REC-T14

failed Recording。

Download拒否。

---

# 104. Delete Test

## REC-T15

memberが依存なしRecording削除。

成功。

## REC-T16

viewer削除。

```text
403
```

## REC-T17

別Tenant Recording削除。

拒否。

## REC-T18

S3 Delete失敗。

期待:

```text
DB状態が不整合にならない
```

---

# 105. Security Test

最低限:

```text
SEC-S3-01
S3 public access不可

SEC-S3-02
Cross Tenant download URL

SEC-S3-03
Cross Tenant upload URL

SEC-S3-04
Cross Tenant delete

SEC-S3-05
Arbitrary s3Key injection

SEC-S3-06
Content-Type spoof

SEC-S3-07
File size bypass

SEC-S3-08
Presigned URLがLogに出ない

SEC-S3-09
AWS SecretがClient Bundleにない

SEC-S3-10
viewer upload
```

---

# 106. Unit Test

AWSを直接呼ばないUnit Testでは:

```text
RecordingStorage Mock
```

を利用してください。

以下を検証:

```text
key generation
content type validation
size validation
state transition
permission
error mapping
```

---

# 107. Integration Test

安全なTest BucketまたはS3 Emulatorが利用可能な場合のみ実施してください。

確認:

```text
Presigned PUT
PUT upload
HeadObject
Presigned GET
GET
DeleteObject
```

Production Bucketは使用しないでください。

---

# 108. E2E

最低限:

```text
Login
↓
Project
↓
Meeting
↓
Recording選択
↓
Upload URL取得
↓
Upload
↓
Complete
↓
Recording一覧
↓
Download URL
↓
再生/取得
```

可能なら:

```text
Delete
```

まで確認してください。

---

# 109. E2E用Storage

実S3が利用できないCIでは:

```text
Mock Storage Adapter
```

等を利用してE2Eフローを確認してください。

Test Storage機構をProductionへ露出させないでください。

---

# 110. Recording/Meeting Traceability

最低限:

```text
Recording
↓
Meeting
↓
Project
↓
Organization
```

をDBから安全に追跡可能としてください。

---

# 111. AIへの引継ぎ

Phase 9終了時点で以下を安全に取得可能にしてください。

```ts
getRecordingForProcessing(recordingId)
```

概念:

```ts
{
  recordingId,
  meetingId,
  projectId,
  s3Key,
  contentType,
  fileSize,
  status
}
```

これはServer internalのみです。

---

# 112. Internal Processing Access

将来Speech-to-TextやLambda等がRecordingを処理するために、S3 KeyをServer内部Serviceから取得可能にしてください。

通常Client APIからs3Keyを露出させる必要はありません。

---

# 113. Phase 10への境界

Phase 10ではLiveKit/WebRTCを接続します。

Phase 9では以下を実装しません。

```text
LiveKit Room
WebRTC
Browser MediaRecorder自動録音
LiveKit Egress
Server-side conference recording
Speech-to-Text
Transcription
AI Minutes自動起動
```

Phase 9はStorage/Recording Managementに限定してください。

---

# 114. Async処理

Phase 9では:

```text
uploaded
↓
SQS
↓
Lambda
```

等の本格非同期処理をまだ作らないでください。

ただし後続Phaseで接続可能なService境界を維持してください。

---

# 115. Recommended Directory

以下に近い構成を推奨します。

```text
lib/
├── s3/
│   ├── client.ts
│   ├── config.ts
│   ├── errors.ts
│   ├── presigned-url.ts
│   └── recording-storage.ts
│
├── services/
│   └── meeting-recording-service.ts
│
└── validators/
    └── recording.ts

app/
└── api/
    ├── meetings/
    │   └── [meetingId]/
    │       └── recordings/
    │           ├── route.ts
    │           └── upload-url/
    │               └── route.ts
    │
    └── recordings/
        └── [recordingId]/
            ├── route.ts
            ├── complete/
            │   └── route.ts
            ├── upload-url/
            │   └── route.ts
            └── download-url/
                └── route.ts

components/
└── meetings/
    ├── recording-uploader.tsx
    ├── recording-list.tsx
    └── recording-player.tsx
```

既存Phase 0〜8構成との整合を優先してください。

---

# 116. Infrastructure設定ファイル

必要に応じて以下を追加してください。

```text
infra/aws/
├── s3-cors.json
├── s3-lifecycle.json
└── iam-recording-policy.json
```

ただし実SecretやProduction固有IDを入れないでください。

---

# 117. S3 CORS例

設定例は作成して構いませんが、Productionへ自動適用しないでください。

Originは環境ごとに設定可能としてください。

---

# 118. `.env.example`

必要に応じて以下を追加してください。

```env
S3_BUCKET_NAME=
RECORDING_UPLOAD_URL_TTL_SECONDS=
RECORDING_DOWNLOAD_URL_TTL_SECONDS=
MAX_RECORDING_FILE_SIZE_BYTES=
```

Secretの実値は禁止です。

---

# 119. Monitoring

最低限以下を追跡可能にしてください。

```text
uploadUrl issued
upload complete success
upload complete failed

downloadUrl issued

delete success
delete failed

stale uploading count

S3 error count
```

---

# 120. Cost

S3 Cost増加要因:

```text
Storage
PUT
GET
Data Transfer
```

録音ファイル容量が主因となるため、以下を計測可能にしてください。

```text
Recording count
Total bytes
Average file size
```

Phase 9で課金Dashboardまでは不要です。

---

# 121. Retention

Recordingの保持期間はリリース・運用設計と整合してください。

削除方針をコードへ無根拠に固定しないでください。

---

# 122. Privacy

録音ファイルは会議内容を含む機密データとして扱ってください。

ログへ以下を出さないでください。

```text
録音本体
Presigned URL
S3 signature
Participant音声内容
```

---

# 123. Phase 9で実装しないもの

絶対にまだ以下を実装しないでください。

```text
LiveKit Room
LiveKit Token発行
WebRTC
Browser自動録音
LiveKit Egress

Speech-to-Text
Transcribe Service

録音 → Transcript自動生成
Transcript → AI Minutes自動生成

SQS
Lambda Worker

Notification
Billing
Production Deployment
```

---

# 124. セキュリティ禁止事項

絶対に以下をしないでください。

```text
S3 Bucket Public化

Public ACL設定

AWS SecretをBrowserへ送信

AWS SecretをNEXT_PUBLIC_へ設定

Client指定s3Keyを信用

Client指定Bucketを信用

Client projectIdだけで認可

Client meetingIdだけでRecording認可

別Tenant RecordingへPresigned URL発行

Presigned URLをDB保存

Presigned URLをLog保存

無制限Upload

任意Content-Type Upload

Complete時HeadObject確認なし

Client申告File Sizeだけを信用

Vercel経由で巨大録音Fileを中継

S3とDBをAtomic Transactionだと仮定

S3失敗を無視してDBのみ更新

Production BucketをTest利用

Production IAM変更

Production DB変更

Production Deploy
```

---

# 125. 実装ルール

1. Phase 0〜8のコードを最初に確認する。
2. Phase 2 Permission helperを再利用する。
3. Phase 5 Meeting Serviceを再利用する。
4. `meeting_recordings` Schemaを再利用する。
5. S3 BucketはPrivate前提とする。
6. BrowserへAWS Credentialを渡さない。
7. Object KeyはServerで生成する。
8. Content-TypeをAllowlist検証する。
9. File Size上限を設定する。
10. Presigned PUT/GETは短期TTLとする。
11. Upload Complete時にHeadObjectする。
12. Actual Size/Content-Typeを再検証する。
13. Presigned URLを保存・ログ出力しない。
14. S3/DB不整合を考慮する。
15. Orphan/Stale Uploadを検出可能にする。
16. Tenant Isolationを必須とする。
17. Audit Logを記録する。
18. LiveKit実装へ先回りしない。
19. Speech-to-Textへ先回りしない。
20. Production環境を変更しない。

---

# 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Test DBが利用可能:

```bash
npm run test:integration
```

Test S3環境が安全に利用可能:

```bash
npm run test:s3
```

scriptがない場合は必要に応じて追加してください。

E2E:

```bash
npm run test:e2e
```

AWS Credential/Test Bucketがない場合は:

```text
RecordingStorage Mock
```

を使用してTestを完成させてください。

Production S3へ接続してTestしてはいけません。

---

# Phase 9 Definition of Done

以下をすべて満たした場合のみPhase 9完了としてください。

- AWS SDK v3 S3 ClientがServer-sideで実装されている
- S3 BucketをPrivateとして扱っている
- BrowserへAWS Secretを渡していない
- Upload URL APIが存在する
- Meeting Permissionを検証している
- viewerはUploadできない
- Object KeyをServer生成している
- Object Keyに個人情報を使っていない
- Content-Type Allowlistがある
- File Size上限がある
- Presigned PUT URLが短期TTL
- Upload URL発行時にRecording Recordを作成する
- 初期statusがuploading
- BrowserからS3へ直接Uploadできる
- Vercelで巨大Fileを中継していない
- Complete APIが存在する
- Complete時にHeadObjectしている
- Actual Content-Typeを検証している
- Actual File Sizeを検証している
- 成功時statusがuploadedになる
- Complete APIが再送に耐えられる
- Recording一覧を取得できる
- Recording詳細を取得できる
- Download URLを認可後に発行できる
- viewerはDownload可能
- Presigned GET URLが短期TTL
- Presigned URLをDBへ保存していない
- Presigned URLをLogへ出していない
- Recordingを安全に削除できる
- S3/DBの非Atomic性を考慮している
- Orphan Object対策方針がある
- stale uploading対策方針がある
- Cross Tenant Recordingアクセスを防止している
- Arbitrary s3Key Injectionを防止している
- S3 Runtime IAMを最小権限化できる設計
- Audit Logが記録される
- Unit Test成功
- Integration Test成功またはMockで代替理由が明確
- Security Test成功
- lint成功
- typecheck成功
- build成功
- E2E成功または未実施理由が明確
- Production環境を変更していない

---

# 作業終了時報告形式

以下の形式で必ず報告してください。

```text
## Phase 9 S3 Recording 実装結果

### 1. S3
- Client:
- Bucket:
- Region:
- Private access:
- Encryption:
- IAM:

### 2. Object Key
- Format:
- Server generation:
- Collision prevention:
- Client override:

### 3. Upload
- Upload URL API:
- Permission:
- Content-Type:
- File size:
- TTL:
- DB status:
- Browser → S3:

### 4. Upload Complete
- API:
- HeadObject:
- Content-Type validation:
- Actual size:
- Idempotency:
- Final status:

### 5. Recording API
- List:
- Detail:
- Download URL:
- Delete:
- Retry upload:

### 6. State Transition
- uploading → uploaded:
- uploaded → processing:
- processing → completed:
- failed:
- Invalid transition:

### 7. S3 / DB Consistency
- Upload URL failure:
- Missing Object:
- Delete failure:
- DB failure:
- Orphan detection:
- stale uploading:

### 8. Authorization
- owner:
- member:
- viewer:
- cross tenant:

### 9. Security
- Public Bucket:
- AWS Secret exposure:
- Arbitrary s3Key:
- Content-Type spoof:
- File Size bypass:
- Presigned URL logging:
- IDOR:
- Production変更:

### 10. Audit / Monitoring
- Upload URL:
- Complete:
- Download URL:
- Delete:
- Failure:
- File size metrics:

### 11. UI
- Upload:
- Progress:
- Recording list:
- Status:
- Playback:
- Download:
- Delete:
- Error state:

### 12. Test
- REC-T01〜:
- SEC-S3-01〜:
- Integration:
- E2E:

### 13. Infrastructure
- S3 CORS:
- IAM policy:
- Lifecycle:
- Environment variables:

### 14. Performance / Cost
- Vercel binary proxy:
- Direct S3:
- Recording size:
- Storage metrics:

### 15. 実行結果
- lint:
- typecheck:
- unit:
- integration:
- s3:
- security:
- e2e:
- build:

### 16. 作成・変更ファイル
- ...

### 17. DB Migration差分
- なし
または
- ...

### 18. 未実施・未解決事項
- ...

### 19. Phase 10への引継ぎ
- ...
```

既存コード、要件定義、DB設計書、API詳細設計書、画面詳細設計書、テスト詳細設計書、セキュリティ設計書、インフラ構築設計書、リリース・運用設計書から合理的に判断できる事項は質問せず実装してください。

ただし以下は実行しないでください。

```text
Production S3 Bucket変更
Production IAM変更
Production AWS Credential登録
Production DB Migration
Production Secret変更
Production Deploy
課金を伴う新規Production Resource作成
破壊的Production操作
```

Local/Test環境およびMock Storageを利用し、Phase 9として完成可能な範囲まで実装してください。