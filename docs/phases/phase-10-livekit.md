あなたはWebRTC、LiveKit、Next.js、認証・認可、リアルタイム通信、セキュリティに精通したシニアフルスタックエンジニアとして、「AIプロジェクトマネージャー」のPhase 10を実装してください。

# Phase 10の目的

Phase 10では、Phase 5で構築したMeeting管理機能とLiveKitを接続し、ブラウザ上でオンライン会議を実施できる基盤を実装します。

完成フローは以下です。

```text
Project
↓
Meeting
↓
オンライン会議を開始
↓
LiveKit Token API
↓
Authentication
↓
Meeting / Project Authorization
↓
Server-side Token生成
↓
Browser
↓
LiveKit Room
↓
WebRTC
├─ Microphone
├─ Camera
├─ Screen Share
└─ Remote Participants
↓
Leave
↓
Meeting状態更新
```

本Phaseでは以下を実現してください。

```text
Meeting
+
LiveKit Room
+
Access Token
+
WebRTC
+
Participant
+
Meeting lifecycle
```

Phase 9で構築したS3 Recording基盤と後から接続できる構造にしますが、LiveKit Egress録画やSpeech-to-Textはまだ実装しません。

---

# 最重要原則

以下を必ず守ってください。

```text
Browser
↓
Next.js API
↓
Authentication
↓
Meeting Authorization
↓
LiveKit Access Token生成
↓
Browser
↓
LiveKit
```

絶対に以下の構成にしないでください。

```text
Browser
↓
LIVEKIT_API_SECRET
```

LiveKit API SecretはServer-sideのみで利用してください。

Browserへ渡すものは短期Access Tokenだけです。

---

# 前提

Phase 0〜9が完了している前提です。

最低限以下が存在します。

```text
lib/
├── livekit/
│   └── client.ts
├── auth/
├── permissions/
├── security/
├── services/
│   ├── meeting-service.ts
│   ├── meeting-participant-service.ts
│   └── meeting-recording-service.ts
└── validators/
```

DB:

```text
meetings
meeting_participants
projects
project_members
users
audit_logs
```

が存在します。

---

# 使用ライブラリ

既存Dependencyを確認した上で、必要に応じて以下を利用してください。

```text
livekit-client
livekit-server-sdk
@livekit/components-react
@livekit/components-styles
```

既存Versionとの互換性を確認してください。

Versionを理由なく変更しないでください。

---

# 現行API優先

LiveKit SDKは更新される可能性があります。

実装開始時にInstalled Versionと公式Documentationを確認し、

```text
現在利用中VersionのAPI
```

を優先してください。

古いBlog記事やDeprecated APIを無条件にコピーしないでください。

---

# Phase 10実装範囲

以下を実装してください。

```text
1. LiveKit Server Client
2. LiveKit Access Token発行
3. Room Name生成
4. Participant Identity生成
5. Room権限
6. Publish / Subscribe権限
7. Meeting Room UI
8. WebRTC接続
9. Microphone
10. Camera
11. Screen Share
12. Participant一覧
13. Join / Leave
14. Connection状態
15. Device Permission
16. Reconnect
17. Meeting status連携
18. Participant joined_at / left_at
19. Room lifecycle
20. Server-side Room管理
21. Audit Log
22. Rate Limit
23. Tenant Isolation
24. Security Test
25. Unit / Integration Test
26. E2E
```

---

# 1. LiveKit Server設定

環境変数:

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

必要に応じてClient接続URL用の公開設定を分離してください。

例:

```env
NEXT_PUBLIC_LIVEKIT_URL=
```

ただし公開してよいのはLiveKit Server URLのみです。

絶対に:

```text
NEXT_PUBLIC_LIVEKIT_API_SECRET
```

を作成しないでください。

---

# 2. Server-only設定

以下はServer-onlyです。

```text
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

Client Componentからimportできない構造にしてください。

必要なら:

```ts
import "server-only"
```

を利用してください。

---

# 3. LiveKit Server Client

推奨構成:

```text
lib/livekit/
├── config.ts
├── client.ts
├── token.ts
├── room.ts
├── permissions.ts
├── errors.ts
└── types.ts
```

責務を分離してください。

---

# 4. Token発行

LiveKit Server SDKのAccessTokenを利用してください。

概念:

```ts
createMeetingAccessToken({
  meetingId,
  userId,
  role
})
```

Token生成は必ずServer-sideです。

---

# 5. Join Token API

以下を実装してください。

```text
POST /api/meetings/:meetingId/token
```

Request Bodyは原則不要です。

現在ログイン中UserとMeeting IDからServer側で必要情報を取得してください。

---

# 6. Token Permission

Token APIへアクセス可能:

```text
Project owner
Project member
Project viewer
```

ただしviewerの会議参加方針は既存要件に合わせてください。

MVP推奨:

```text
owner
member
viewer

全員Join可能
```

としつつ、publish権限をRole別に制御可能な構造にしてください。

---

# 7. Viewer権限

MVPでviewerを閲覧専用参加者とする場合:

```text
roomJoin = true
canSubscribe = true
canPublish = false
```

としてください。

既存要件上viewerも会話参加可能ならpublishを許可して構いません。

どちらを選択したか報告してください。

---

# 8. Owner / Member

通常:

```text
roomJoin = true
canSubscribe = true
canPublish = true
```

としてください。

不要なRoom Admin権限を一般Participant Tokenへ付与しないでください。

---

# 9. Token TTL

Access Tokenは短命にしてください。

例:

```text
15分〜1時間
```

程度。

ただし会議接続中のToken更新方式を考慮してください。

LiveKit SDK/Cloud側の現在のToken refresh仕様に合わせて実装してください。

無意味に数日間有効なTokenを発行しないでください。

---

# 10. Room Name

Room Nameへ以下を使用しないでください。

```text
Meeting title
User email
Organization name
実名
```

PIIを含めないでください。

推奨:

```text
meeting_<meetingUUID>
```

または非PIIのランダム識別子。

---

# 11. Participant Identity

Participant identityにも以下を使用しないでください。

```text
email
実名
phone number
```

推奨:

```text
user_<applicationUserUUID>
```

Application User IDがUUIDで非PIIの場合、それを基にした安定IDを使用してください。

---

# 12. Participant display name

LiveKit identityと表示名を分離してください。

概念:

```text
identity
=
user_<uuid>

display name
=
田中
```

表示名はUI用Metadata/Participant name等、利用中SDKで安全な方法を使用してください。

---

# 13. External Participant

Phase 5ではExternal Participantを許可しています。

Phase 10 MVPでは、Application Loginしていない匿名外部ユーザーへLiveKit Tokenを自由発行しないでください。

まずは:

```text
Authenticated Application User
```

のみオンラインRoom参加対象とすることを推奨します。

External Guest招待は将来Phaseへ分離してください。

---

# 14. Room NameをClientから受け取らない

禁止:

```json
{
  "roomName": "arbitrary-room"
}
```

Client指定RoomへToken発行する構造。

必ず:

```text
meetingId
↓
DB Meeting
↓
Server generated roomName
```

としてください。

---

# 15. Token生成前認可

必ず:

```text
meetingId
↓
Meeting取得
↓
meeting.project_id
↓
Project Permission
↓
Token発行
```

としてください。

Clientから:

```text
projectId
organizationId
role
```

を受け取ってToken権限を決めてはいけません。

---

# 16. Roleの正

Token grantの権限は:

```text
DB project_members.role
```

を正としてください。

Session内の古いroleやClient入力を信用しないでください。

---

# 17. Room作成

LiveKitでは最初のParticipant JoinによりRoomが作成される方式も利用できますが、ApplicationとしてRoom lifecycleを明示したい場合はServer APIで作成して構いません。

MVPでは以下のどちらかを選択してください。

A:

```text
First JoinでRoom自動作成
```

B:

```text
Start Meeting時にRoom作成
```

本サービスではMeeting状態との整合性を考慮し、Bを推奨します。

---

# 18. Start Meeting API

必要なら以下を実装してください。

```text
POST /api/meetings/:meetingId/start
```

権限:

```text
Project owner
Project member
```

viewerは禁止。

処理:

```text
Meeting取得
↓
Permission確認
↓
Status確認
↓
LiveKit Room準備
↓
meeting.status = recording
または active相当
↓
Audit
```

---

# 19. Meeting status

既存DB:

```text
scheduled
recording
processing
completed
failed
```

があります。

オンライン会議中の状態として現Schemaでは:

```text
recording
```

を利用できます。

ただし録音していない会議でも`recording`という名称になる問題があります。

既存設計を尊重しつつ、必要性が高い場合のみ:

```text
active
```

status追加を検討してください。

Schema Migrationを追加した場合は理由を報告してください。

MVPでは不要なMigrationを避けても構いません。

---

# 20. Status Transition

基本:

```text
scheduled
↓
recording
↓
processing / completed
```

Phase 10で録音/AI処理を自動開始しない場合:

```text
scheduled
↓
recording
↓
completed
```

を許可して構いません。

Phase 5のstatus transition Serviceを再利用してください。

---

# 21. Token発行条件

最低限:

```text
Meeting exists
User authenticated
Project access exists
Meeting not failed
Meeting not completed
```

を確認してください。

completed Meetingへ新規Tokenを無制限発行しないでください。

---

# 22. Scheduled Meeting Join

Meeting開始前でもToken発行可能にするか決定してください。

MVP推奨:

```text
owner/memberがStart Meeting
↓
room参加可能
```

としてください。

参加者が勝手にScheduled Meetingを開始しない構造を優先してください。

---

# 23. Join API / Token API

Start後:

```text
POST /api/meetings/:meetingId/token
```

でTokenを取得。

Response例:

```json
{
  "data": {
    "token": "...",
    "serverUrl": "wss://...",
    "meetingId": "...",
    "expiresIn": 1800
  },
  "requestId": "..."
}
```

---

# 24. API Secret非公開

Responseへ絶対に以下を含めないでください。

```text
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

ClientにはTokenとServer URLだけです。

---

# 25. TokenをDB保存しない

LiveKit Access TokenをDBへ永続保存しないでください。

必要時に都度生成してください。

---

# 26. TokenをLog保存しない

Access TokenはBearer Credential相当です。

以下へToken全文を出さないでください。

```text
console.log
Audit Log
Structured Log
Error tracking
Analytics
```

---

# 27. TokenをlocalStorage保存しない

Browser側でも:

```text
localStorage
sessionStorage
IndexedDB
```

等へ永続保存しないでください。

React component state / memory内で必要時間だけ保持してください。

---

# 28. オンラインMeeting画面

画面:

```text
/meetings/:meetingId/live
```

または既存画面詳細設計:

```text
/meetings/:meetingId
```

内にオンライン会議UIを構築してください。

---

# 29. Join Flow

UI:

```text
Meeting Detail
↓
会議に参加
↓
Device Preview
↓
Join
↓
Token取得
↓
LiveKit connect
```

いきなりCamera/MicをONにしないで、可能ならDevice Previewを設けてください。

---

# 30. Device Preview

Join前に最低限:

```text
Microphone
Camera
```

のON/OFFをユーザーが選択可能にしてください。

Cameraなしでも参加可能にしてください。

---

# 31. Browser Permission

以下の拒否を安全に処理してください。

```text
Microphone permission denied
Camera permission denied
Device unavailable
Device in use
```

会議画面全体をCrashさせないでください。

---

# 32. Audio-only

Camera permissionがなくても:

```text
Audio only
```

で参加可能な構造にしてください。

Microphoneも拒否された場合:

```text
Listen only
```

がPermission上許可されていれば参加可能としてください。

---

# 33. LiveKit Room lifecycle

現在のSDK構成を確認した上で、Room instance lifecycleを明示的に管理してください。

推奨概念:

```text
Room作成
↓
connect
↓
RoomContext
↓
UI Components
↓
disconnect
↓
cleanup
```

Component再renderで無意味にRoomを再生成しないでください。

---

# 34. RoomContext

現行LiveKit React Componentsで適切なら:

```text
RoomContext.Provider
```

を利用してRoom lifecycleをApplication側で明示管理してください。

既存Versionで`LiveKitRoom`がより適切な場合はそちらでも構いません。

選択理由を報告してください。

---

# 35. LiveKit components

可能な範囲でLiveKit公式Component / hookを利用してください。

例:

```text
ParticipantTile
GridLayout
RoomAudioRenderer
TrackToggle
VideoTrack
ConnectionQualityIndicator
```

低レベルWebRTC処理を不要に再実装しないでください。

---

# 36. Audio Rendering

Remote ParticipantのAudioを正しく再生してください。

LiveKit React Componentsを利用する場合:

```text
RoomAudioRenderer
```

等を利用してください。

Videoしか表示されずRemote Audioが聞こえない実装にしないでください。

---

# 37. Video Grid

最低限:

```text
Local Participant
Remote Participants
```

をGrid表示してください。

各Tile:

```text
display name
mic state
camera state
connection quality
```

等を表示可能にしてください。

---

# 38. Microphone Toggle

ボタン:

```text
Mic ON/OFF
```

を実装してください。

可能ならLiveKit公式TrackToggle等を利用してください。

---

# 39. Camera Toggle

```text
Camera ON/OFF
```

を実装してください。

Camera Deviceがない場合も安全に処理してください。

---

# 40. Screen Share

owner/memberには:

```text
画面共有
```

を実装してください。

Browserのscreen capture APIとLiveKit SDKの機能を利用してください。

---

# 41. Screen Share終了

UserがBrowser標準UIから共有停止した場合もApplication UI stateが正しく同期すること。

---

# 42. Viewer Publish制限

viewerをRead-only Participantとする設計の場合:

```text
canPublish = false
```

をToken Grant側で制御してください。

UIでMicボタンを隠すだけでは不十分です。

---

# 43. Participant一覧

Meeting画面に:

```text
Participants
```

Panelを表示してください。

最低限:

```text
displayName
local/remote
mic
camera
connection state
```

を表示可能にしてください。

---

# 44. Application Participantとの同期

LiveKit participant identityと:

```text
users.id
```

を安全に対応付けてください。

identity format例:

```text
user_<uuid>
```

Prefixを除去する場合は厳格にparseしてください。

任意identityをApplication User IDとして信用しないでください。

---

# 45. meeting_participants

LiveKit Join時にApplication DBの:

```text
meeting_participants
```

と同期してください。

最低限:

```text
joined_at
```

を記録。

Leave時:

```text
left_at
```

を記録してください。

---

# 46. Participant Syncの正

Clientが:

```text
joinedAt
leftAt
```

を自由に送って更新する設計にしないでください。

Server APIまたは信頼できるApplication Event経由で記録してください。

---

# 47. Join notification API

必要なら:

```text
POST /api/meetings/:meetingId/join
```

を実装してください。

処理:

```text
Authentication
Permission
Participant lookup
joined_at = now
```

Token発行と同時にJoin記録する方式でも構いません。

ただしToken取得だけして実際に接続しなかった場合との差を考慮してください。

---

# 48. Connection成功後Join記録

より正確には:

```text
LiveKit connected
↓
Application Join API
```

とすることを推奨します。

ただしClient Eventを完全に信用せず、User/Meeting authorizationをServerで再確認してください。

---

# 49. Leave API

必要なら:

```text
POST /api/meetings/:meetingId/leave
```

処理:

```text
Authentication
Authorization
Participant lookup
left_at = now
```

---

# 50. Abrupt disconnect

Browser Crash / Network lossの場合:

```text
leave API
```

が呼ばれない可能性があります。

そのため`left_at`だけを「絶対的なLiveKit接続状態」として利用しないでください。

LiveKit Room stateをRealtimeの正としてください。

DB Participantは履歴用途です。

---

# 51. Participant Webhook

LiveKit Webhookを利用できる場合は将来:

```text
participant_joined
participant_left
```

等からDB同期する方式へ拡張可能にしてください。

Phase 10ではWebhookが必要なら実装して構いませんが、Scopeが大きくなる場合はTODOとして明示してください。

---

# 52. Webhook Security

Webhookを実装する場合はLiveKitの署名/認証方式を現行Documentationに従って検証してください。

Webhook bodyを認証なしで信用しないでください。

---

# 53. Room Service

Server-side Room操作を行う場合:

```text
RoomServiceClient
```

等、利用中SDKの現行APIを使ってください。

推奨Service:

```text
lib/livekit/room.ts
```

---

# 54. Room作成

Application上のMeeting 1件につき:

```text
LiveKit Room 1件
```

を基本としてください。

同Meetingで毎回ランダムRoomを作らないでください。

---

# 55. Room metadata

LiveKit Room metadataへApplicationのSensitive Dataを大量保存しないでください。

必要なら:

```text
meetingId
```

程度の非機密識別子に限定してください。

---

# 56. Room deletion

Meeting終了時にRoomを即Deleteするかは慎重に設計してください。

MVPでは:

```text
End Meeting
↓
Participant Disconnect
↓
Room Delete
```

を実行して構いません。

ただしRoom削除失敗でもApplication Meeting履歴を失わないでください。

---

# 57. End Meeting API

実装:

```text
POST /api/meetings/:meetingId/end
```

権限:

```text
owner
member
```

viewerは禁止。

---

# 58. End Meeting処理

推奨:

```text
Meeting取得
↓
Permission確認
↓
Current status確認
↓
LiveKit Room終了
↓
meeting.status = completed
↓
Audit
```

ただしLiveKit APIとDBはAtomic Transactionではありません。

障害時のCompensationを考慮してください。

---

# 59. LiveKit / DB非Atomic

重要:

```text
LiveKit
≠
PostgreSQL Transaction
```

です。

例えば:

```text
Room delete成功
DB更新失敗
```

が起こり得ます。

再実行可能なIdempotent Serviceにしてください。

---

# 60. End Meeting Idempotency

既に:

```text
meeting.status = completed
```

の場合、再度End APIが来ても安全に処理してください。

新しいRoomを作る等の副作用を起こさないでください。

---

# 61. Start Meeting Idempotency

Startボタン二重押下でも:

```text
同じMeeting
同じRoom
```

を利用してください。

Roomを複数作成しないでください。

---

# 62. Room nameのDeterministic生成

例えば:

```ts
getLiveKitRoomName(meetingId)
```

で常に同じ値を返してください。

---

# 63. Meeting終了権限

Meetingを終了できるUser:

```text
Project owner
Project member
```

をMVPとします。

将来:

```text
Meeting hostのみ
```

へ変更可能なPermission構造にしてください。

---

# 64. Kick Participant

MVPで必要ならhost/owner用に:

```text
Participant Remove
```

を実装して構いません。

ただし一般memberが任意ParticipantをKickできないようPermissionを検討してください。

Phase 10必須ではありません。

---

# 65. Moderation

将来拡張:

```text
mute participant
remove participant
update participant permission
```

に対応できるService境界を用意できますが、過剰実装しないでください。

---

# 66. Connection State

UIで最低限以下を扱ってください。

```text
connecting
connected
reconnecting
disconnected
failed
```

---

# 67. Reconnecting UI

Network断時:

```text
再接続しています...
```

と表示してください。

一時的なNetwork断で即Meetingから追い出さないでください。

---

# 68. Permanent disconnect

再接続不能時:

```text
会議への接続が切断されました
```

を表示し、再Join可能にしてください。

---

# 69. Token expiry

Token期限切れ/refresh failureを安全に処理してください。

利用中LiveKit SDKのToken refresh機能を確認し、必要ならServerから再Token取得できる設計にしてください。

---

# 70. Token refresh API

必要な場合:

```text
POST /api/meetings/:meetingId/token
```

を再利用してください。

別の長期Tokenを事前発行しないでください。

---

# 71. Device selection

可能なら:

```text
Microphone selector
Camera selector
Speaker selector
```

を実装してください。

ただしBrowser対応差を考慮してください。

MVP必須:

```text
Mic
Camera
```

で構いません。

---

# 72. Device変更

会議参加中にMicrophone/Camera変更できる構造を推奨します。

---

# 73. Browser compatibility

最低限:

```text
Chrome
Edge
Safari
```

の現行主要VersionでWebRTC基本動作を意識してください。

ブラウザ固有機能を無条件に前提にしないでください。

---

# 74. Mobile browser

MVPでMobile Web対応する場合、Camera/Mic Permissionと画面サイズを確認してください。

ネイティブアプリ実装はPhase 10対象外です。

---

# 75. HTTPS

ProductionでWebRTC Media Deviceを利用するため、ApplicationはHTTPS前提としてください。

Localhost DevelopmentはBrowserの例外仕様に従ってください。

---

# 76. Security Boundary

LiveKit Tokenは:

```text
Meeting
+
User
+
Permission
```

に限定してください。

以下のようなTokenは禁止です。

```text
任意Room Join
任意Publish
Room Admin
```

を全Userへ付与。

---

# 77. Room Grant

Tokenに最低限:

```text
roomJoin
room
canPublish
canSubscribe
```

等の必要権限のみ付与してください。

現行SDKのGrant名に従ってください。

---

# 78. Publish sources

SDKが対応する場合、必要以上のTrack Publish権限を与えない設計を検討してください。

ただしMVPで複雑化しすぎないでください。

---

# 79. Identity Spoofing

Clientから:

```json
{
  "identity": "user_admin"
}
```

を受け取ってToken生成してはいけません。

Identityは:

```text
currentUser.id
```

からServer生成してください。

---

# 80. Role Escalation

Clientから:

```json
{
  "role": "owner",
  "canPublish": true
}
```

を受け取ってはいけません。

Role/GrantはDB Permissionから決定してください。

---

# 81. Cross Tenant Room

Organization A UserへOrganization B Meeting用Tokenを絶対に発行しないでください。

Meeting IDを知っていても:

```text
403 / 404
```

です。

---

# 82. Room Name Enumeration

Room nameが推測できてもTokenなしではJoinできないことを前提にしてください。

Room Name秘匿だけをSecurity境界にしないでください。

---

# 83. Rate Limit

最低限:

```text
Token発行
Start Meeting
End Meeting
```

へRate Limitを適用してください。

特にToken発行連打を防止してください。

---

# 84. Token発行回数

同User/Meetingで短時間に大量Token発行されないようRate Limitしてください。

既存:

```text
lib/security/rate-limit.ts
```

があれば再利用してください。

---

# 85. CSRF

Cookie Session + State-changing API:

```text
/start
/end
/join
/leave
```

について既存CSRF方針を維持してください。

---

# 86. CORS

LiveKit Application API自体へ無制限CORSを設定しないでください。

既存Next.js同一Origin構成を基本にしてください。

---

# 87. CSP

LiveKit WebSocket/Media接続に必要な:

```text
connect-src
```

等が既存CSPでBlockされないよう確認してください。

ただし:

```text
connect-src *
```

へ雑に緩和しないでください。

LiveKit endpointのみ許可してください。

---

# 88. Permissions-Policy

既存Security Header:

```text
Permissions-Policy
```

でCamera/Microphoneが全面禁止されていないか確認してください。

必要Originに限定して:

```text
camera
microphone
```

を許可してください。

---

# 89. XSS

Participant displayName、Meeting title等はUser Generated Contentです。

React標準escapeを利用してください。

禁止:

```text
dangerouslySetInnerHTML
```

---

# 90. Audit Log

最低限以下を記録してください。

```text
meeting.live.start
meeting.live.token.issue
meeting.live.join
meeting.live.leave
meeting.live.end
meeting.live.failed
```

---

# 91. AuditにTokenを書かない

Audit metadataへAccess Tokenを絶対に保存しないでください。

---

# 92. Audit metadata

例:

```json
{
  "meetingId": "...",
  "projectId": "...",
  "participantUserId": "...",
  "role": "member"
}
```

PIIを不要に保存しないでください。

---

# 93. Application Log

最低限:

```text
requestId
meetingId
projectId
userId
operation
result
durationMs
```

を追跡可能にしてください。

---

# 94. LiveKit Error mapping

最低限以下を共通Application Errorへ変換してください。

```text
connection failure
authentication failure
room not found
participant not found
provider timeout
provider unavailable
```

Raw LiveKit SDK ErrorをClientへそのまま返さないでください。

---

# 95. Error Code

最低限:

```text
LIVEKIT_PROVIDER_ERROR
LIVEKIT_TOKEN_FAILED
LIVEKIT_ROOM_CREATE_FAILED
LIVEKIT_ROOM_END_FAILED

MEETING_NOT_STARTED
MEETING_ALREADY_STARTED
MEETING_ALREADY_ENDED

MEETING_JOIN_FORBIDDEN
MEETING_INVALID_STATUS
```

---

# 96. HTTP Status例

```text
MEETING_NOT_FOUND
→ 404

JOIN_FORBIDDEN
→ 403

INVALID STATUS
→ 409

LIVEKIT_PROVIDER_ERROR
→ 502

PROVIDER TIMEOUT
→ 504
```

既存API共通仕様を優先してください。

---

# 97. Provider障害

LiveKit障害時でも:

```text
Project
Ticket
Meeting History
AI Minutes History
```

等のApplication本体を利用可能にしてください。

オンライン会議機能だけ縮退停止する構造にしてください。

---

# 98. Feature Flag

既存インフラ設計に従い:

```text
LIVE_MEETING_ENABLED
```

等のFeature Flagを利用可能にしてください。

例:

```env
LIVE_MEETING_ENABLED=false
```

LiveKit障害時にオンライン会議機能だけ停止できる構造を推奨します。

---

# 99. Meeting UI構成

最低限以下を実装してください。

```text
┌─────────────────────────────┐
│ Meeting Title               │
│ Status / Duration           │
├─────────────────────────────┤
│                             │
│      Video Grid             │
│                             │
├─────────────────────────────┤
│ Mic Camera Share Participants│
│        Leave                │
└─────────────────────────────┘
```

---

# 100. Controls

最低限:

```text
Mic
Camera
Screen Share
Participants
Leave
```

host権限がある場合:

```text
End Meeting
```

を追加してください。

---

# 101. LeaveとEndを区別

重要:

```text
Leave
=
自分だけ退出
```

```text
End Meeting
=
Meetingそのものを終了
```

です。

UI/Serviceを混同しないでください。

---

# 102. Leave時

Leave:

```text
LiveKit disconnect
↓
left_at記録
↓
Meeting detailへ戻る
```

Meeting自体は継続します。

---

# 103. End時

End:

```text
確認Dialog
↓
End API
↓
Room終了
↓
Meeting completed
↓
Meeting detail
```

---

# 104. End確認

例:

```text
会議を終了しますか？
参加者全員が退出します。
```

確認を表示してください。

---

# 105. Duration

Meeting開始時間・終了時間用DB Fieldが現Schemaにない場合、Phase 10では無理にDurationを正式保存しなくても構いません。

UIではLiveKit接続時間を一時表示できます。

正式なMeeting duration要件が必要ならSchema追加理由を報告してください。

---

# 106. Online participant count

Meeting一覧/詳細で必要ならLiveKit Room Serviceから現在参加人数を取得できます。

ただし一覧画面でMeetingごとに大量LiveKit API Callを行うN+1構造は避けてください。

MVPではLive画面のみRealtime Participant数表示で構いません。

---

# 107. Recordingとの境界

Phase 9 Recording Serviceは存在しますが、Phase 10では自動録音を開始しないでください。

将来:

```text
LiveKit Egress
↓
S3
↓
meeting_recordings
```

へ接続可能な設計にしてください。

---

# 108. MediaRecorderとの境界

Browser MediaRecorderでローカル録音を自動開始する実装もPhase 10では不要です。

録音方式は後続要件として比較可能な状態にしてください。

---

# 109. Speech-to-Textとの境界

絶対にまだ以下を自動実行しないでください。

```text
LiveKit Audio
↓
Speech-to-Text
↓
Transcript
↓
AI Minutes
```

Phase 10は会議通信基盤までです。

---

# 110. Online Meeting Service

推奨:

```text
lib/services/
└── live-meeting-service.ts
```

最低限:

```ts
startLiveMeeting(...)
createMeetingToken(...)
joinLiveMeeting(...)
leaveLiveMeeting(...)
endLiveMeeting(...)
```

を検討してください。

---

# 111. LiveKit Adapter

推奨:

```ts
interface LiveMeetingProvider {
  ensureRoom(...)
  createParticipantToken(...)
  endRoom(...)
  getRoom(...)
}
```

Application ServiceがLiveKit SDKへ強く密結合しすぎないようにしてください。

将来Provider変更/Test Mockを容易にしてください。

---

# 112. Token Service

例:

```ts
createParticipantToken({
  roomName,
  identity,
  displayName,
  canPublish,
  canSubscribe,
  ttl
})
```

Server-onlyとしてください。

---

# 113. API構成

推奨:

```text
POST /api/meetings/:meetingId/start

POST /api/meetings/:meetingId/token

POST /api/meetings/:meetingId/join

POST /api/meetings/:meetingId/leave

POST /api/meetings/:meetingId/end
```

不要なEndpointは統合して構いません。

既存API設計との整合を優先してください。

---

# 114. Recommended Directory

以下に近い構成にしてください。

```text
lib/
├── livekit/
│   ├── config.ts
│   ├── client.ts
│   ├── token.ts
│   ├── room.ts
│   ├── permissions.ts
│   ├── errors.ts
│   └── types.ts
│
├── services/
│   └── live-meeting-service.ts
│
└── validators/
    └── live-meeting.ts

app/
├── meetings/
│   └── [meetingId]/
│       └── live/
│           └── page.tsx
│
└── api/
    └── meetings/
        └── [meetingId]/
            ├── start/
            │   └── route.ts
            ├── token/
            │   └── route.ts
            ├── join/
            │   └── route.ts
            ├── leave/
            │   └── route.ts
            └── end/
                └── route.ts

components/
└── meetings/
    └── live/
        ├── meeting-room.tsx
        ├── device-preview.tsx
        ├── video-grid.tsx
        ├── participant-tile.tsx
        ├── participant-list.tsx
        ├── meeting-controls.tsx
        └── connection-status.tsx
```

既存Phase 0〜9構成との整合を優先してください。

---

# 115. Unit Test

LiveKit ProviderをMock可能にしてください。

最低限:

```text
LK-U01
Room name generation

LK-U02
Identity generation

LK-U03
owner grants

LK-U04
member grants

LK-U05
viewer grants

LK-U06
Token TTL

LK-U07
PIIをRoom nameへ使用しない

LK-U08
Client roleを信用しない
```

---

# 116. API Test

## LK-T01

owner Start Meeting。

期待:

```text
成功
Meeting status更新
Room準備
```

## LK-T02

member Start Meeting。

既存権限方針に従い成功。

## LK-T03

viewer Start Meeting。

```text
403
```

## LK-T04

member Token取得。

成功。

## LK-T05

別Tenant Meeting Token。

```text
403/404
```

## LK-T06

completed Meeting Token。

拒否。

## LK-T07

Token ResponseにAPI Secretなし。

成功。

---

# 117. Join / Leave Test

## LK-T08

User Join。

期待:

```text
LiveKit connect
joined_at更新
```

## LK-T09

Leave。

```text
LiveKit disconnect
left_at更新
```

## LK-T10

再Join。

安全に再接続可能。

---

# 118. End Test

## LK-T11

owner/member End Meeting。

期待:

```text
Room終了
Meeting completed
```

## LK-T12

viewer End。

```text
403
```

## LK-T13

End再送。

Idempotent。

---

# 119. Permission Test

最低限:

```text
LK-PERM-01
Owner publish/subscribe

LK-PERM-02
Member publish/subscribe

LK-PERM-03
Viewer grant

LK-PERM-04
Cross Tenant

LK-PERM-05
Client role escalation
```

---

# 120. Security Test

最低限:

```text
SEC-LK-01
LIVEKIT_API_SECRET Client Bundleに存在しない

SEC-LK-02
API Secret Response漏えいなし

SEC-LK-03
Token Logなし

SEC-LK-04
Cross Tenant Token

SEC-LK-05
Arbitrary Room Name指定

SEC-LK-06
Identity spoof

SEC-LK-07
Role escalation

SEC-LK-08
viewer publish制限

SEC-LK-09
Token大量発行Rate Limit

SEC-LK-10
completed Meeting Join

SEC-LK-11
XSS displayName

SEC-LK-12
Token localStorage保存なし
```

---

# 121. Connection Test

可能な範囲で:

```text
CONNECT-T01
Room connect

CONNECT-T02
2 Participants

CONNECT-T03
Audio publish/subscribe

CONNECT-T04
Video publish/subscribe

CONNECT-T05
Mic toggle

CONNECT-T06
Camera toggle

CONNECT-T07
Screen share

CONNECT-T08
Network reconnect

CONNECT-T09
Leave
```

を確認してください。

---

# 122. E2E

最低限:

```text
User A Login
↓
Project
↓
Meeting
↓
Start Meeting
↓
Device Preview
↓
Join
↓
Mic/Camera
↓
User B Join
↓
Participants確認
↓
Screen Share
↓
User B Leave
↓
User A End Meeting
↓
Meeting completed
```

---

# 123. E2E 2ブラウザ

Playwright等で可能なら:

```text
Browser Context A
Browser Context B
```

を使い2 Participant参加をテストしてください。

実LiveKit Test Environmentがない場合はProvider MockでUI/E2Eを実装し、実WebRTC Test未実施理由を報告してください。

---

# 124. Test Environment

Production LiveKit ProjectをTestに利用しないでください。

利用可能なら:

```text
Development LiveKit
Test LiveKit
Local LiveKit Server
Provider Mock
```

を利用してください。

---

# 125. LiveKit Integration Test

安全なDev/Test LiveKitが存在する場合のみ:

```text
Room create
Token generate
Join
Room list
Participant
Room delete
```

等を実行してください。

Productionへの接続は禁止です。

---

# 126. Performance

Video GridでParticipant増加時に不要なReact再renderを大量発生させないでください。

LiveKit hooks/componentsを適切に利用してください。

---

# 127. Adaptive Stream

利用中LiveKit SDKが対応し、導入が容易な場合:

```text
adaptiveStream
dynacast
```

等の最適化を検討してください。

ただし現行SDK仕様を確認した上で設定してください。

MVPでは過剰最適化しないでください。

---

# 128. Participant上限

MVP想定の最大Participant数を設定/文書化してください。

例:

```text
10〜20名
```

ただしコードへ根拠なくハード固定しないでください。

---

# 129. Browser Resource

多数Video Trackを同時表示する場合のCPU/Network負荷を考慮してください。

MVPでは標準Gridで構いません。

---

# 130. Observability

最低限以下を追跡可能にしてください。

```text
room start count
token issue count
join success
join failure
leave count
meeting end count
LiveKit provider error
connection failure
reconnect count
```

---

# 131. Metrics

個人情報を含まない形で:

```text
meetingId
projectId
participant count
duration
connection result
```

等を計測可能にしてください。

---

# 132. Privacy

映像・音声は高い機密性を持つデータとして扱ってください。

Phase 10ではApplication ServerへMedia payloadを転送しないでください。

Media:

```text
Browser
↔
LiveKit SFU
```

です。

---

# 133. SFU

Application ServerはMedia Routingを行いません。

LiveKit SFUに任せてください。

Next.js/VercelでVideo/Audioを中継しないでください。

---

# 134. Vercel Function

Vercelが担当するのは:

```text
Authentication
Authorization
Token generation
Meeting state
Application API
```

です。

Media Transportではありません。

---

# 135. Feature degradation

LiveKit障害時:

```text
オンライン会議
→ 利用不可
```

でも:

```text
Meeting CRUD
Transcript手動入力
AI Minutes
Ticket
Kanban
```

は利用可能な構造を維持してください。

---

# 136. Recordingとの将来接続

Phase 10終了時に以下のService境界を残してください。

```text
Meeting
↓
LiveKit Room
↓
Future Egress
↓
S3
↓
meeting_recordings
```

ただしEgress実処理はまだ行わないでください。

---

# 137. Phase 10で実装しないもの

以下をまだ実装しないでください。

```text
LiveKit Egress Recording

自動S3録画

Speech-to-Text

Amazon Transcribe

Deepgram
Whisper

LiveKit Agent

Real-time transcription

Transcript自動保存

録音 → AI Minutes自動生成

SQS
Lambda Worker

Notification

Billing

Production Deployment
```

---

# 138. セキュリティ禁止事項

絶対に以下をしないでください。

```text
LIVEKIT_API_SECRETをClientへ渡す

LIVEKIT_API_SECRETをNEXT_PUBLIC_へ設定

API SecretをLogへ出す

Access TokenをLogへ出す

Access TokenをDB保存

Access TokenをlocalStorage保存

Client指定Room Nameを信用

Client指定Identityを信用

Client指定Roleを信用

Client指定canPublishを信用

Cross Tenant MeetingへToken発行

全UserへRoom Admin権限付与

Room NameにEmailを使用

Participant IdentityにEmail/実名を使用

Application ServerでMediaを中継

UI非表示だけでPublish権限制御

completed Meetingへ無制限Token発行

Rate LimitなしToken大量発行

Production LiveKitをTest利用

Production Secret変更

Production DB変更

Production Deploy
```

---

# 139. 実装ルール

1. Phase 0〜9のコードを最初に確認する。
2. Installed LiveKit SDK Versionを確認する。
3. 現行公式Documentationに合うAPIを使用する。
4. Phase 2 Permission helperを再利用する。
5. Phase 5 Meeting Service/Participant Serviceを再利用する。
6. LiveKit API SecretはServer-onlyとする。
7. TokenはServer-sideで生成する。
8. Room NameはServer生成する。
9. Participant IdentityはServer生成する。
10. PIIをRoom Name/Identityへ含めない。
11. GrantはDB Permissionから決定する。
12. Tokenは短命にする。
13. Tokenを永続保存しない。
14. MediaはBrowser↔LiveKitとする。
15. LiveKit公式Components/hooksを可能な範囲で利用する。
16. Remote Audio Rendererを忘れない。
17. Room lifecycleを明示的に管理する。
18. Start/EndをIdempotentにする。
19. LiveKit/DB非Atomic性を考慮する。
20. Connection/Reconnect/Error Stateを実装する。
21. Tenant Isolation Testを必須とする。
22. Audit Logを記録する。
23. Phase 11以降へ先回りしない。
24. Production環境を変更しない。

---

# 完了時実行コマンド

最低限:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Test DBが安全に利用可能:

```bash
npm run test:integration
```

Dev/Test LiveKitが存在する場合のみ:

```bash
npm run test:livekit
```

設定済みの場合:

```bash
npm run test:e2e
```

Dev/Test LiveKit Credentialがない場合は:

```text
LiveMeetingProvider Mock
```

を利用してください。

Production LiveKitをTestへ利用してはいけません。

---

# Phase 10 Definition of Done

以下をすべて満たした場合のみPhase 10完了としてください。

- LiveKit SDKがServer/Clientで適切に分離されている
- API SecretがServer-sideのみ
- API SecretがClient Bundleにない
- Access TokenをServer側で生成している
- Token APIが存在する
- Meeting Permissionを検証している
- Cross Tenant Tokenを発行できない
- Room NameをServer生成している
- Room NameへPIIを入れていない
- Participant IdentityをServer生成している
- IdentityへPIIを入れていない
- Client roleを信用していない
- GrantをDB Permissionから生成する
- TokenがRoom単位に限定されている
- Tokenが短命
- TokenをDBへ保存していない
- TokenをLogへ出していない
- TokenをlocalStorageへ保存していない
- Start Meetingが実装されている
- Start処理が二重実行に耐えられる
- LiveKit RoomがMeetingと1:1で対応する
- Device Previewがある
- Microphone ON/OFFが可能
- Camera ON/OFFが可能
- Cameraなし参加が可能
- Screen Shareが可能
- Remote Participant Audioが再生される
- Video Gridが表示される
- Participant一覧が表示される
- Connection Stateが表示される
- Network Reconnectを処理する
- LeaveとEndが分離されている
- joined_at / left_atを記録可能
- End Meetingが実装されている
- End処理がIdempotent
- Meeting statusとRoom lifecycleが整合する
- LiveKit/DB非Atomic性を考慮している
- viewer等のPublish権限をServer Grantで制御できる
- Token APIにRate Limitがある
- Audit Logが記録される
- LiveKit障害時に他機能へ影響を広げない
- Unit Test成功
- Authorization Test成功
- Tenant Isolation Test成功
- Security Test成功
- lint成功
- typecheck成功
- build成功
- Integration/E2E成功または未実施理由が明確
- Production環境を変更していない

---

# 作業終了時報告形式

以下の形式で必ず報告してください。

```text
## Phase 10 LiveKit / Online Meeting 実装結果

### 1. LiveKit
- SDK Version:
- Server SDK:
- Client SDK:
- React Components:
- Server URL:
- Provider abstraction:

### 2. Security
- API Key:
- API Secret:
- Client exposure:
- Token storage:
- Token logging:
- PII in room name:
- PII in identity:

### 3. Room
- Room naming:
- Room creation:
- Meeting mapping:
- Start:
- End:
- Idempotency:

### 4. Token
- API:
- TTL:
- identity:
- room:
- roomJoin:
- canPublish:
- canSubscribe:
- role mapping:

### 5. Authorization
- owner:
- member:
- viewer:
- cross tenant:
- role escalation:

### 6. WebRTC
- Connect:
- Audio:
- Video:
- Remote audio:
- Screen share:
- Disconnect:
- Reconnect:

### 7. Device
- Preview:
- Microphone:
- Camera:
- Device denied:
- Audio only:
- Listen only:

### 8. Participants
- LiveKit identity:
- Application user mapping:
- joined_at:
- left_at:
- Participant list:

### 9. Meeting Status
- scheduled:
- recording/active:
- completed:
- failed:
- transition:

### 10. UI
- Live meeting page:
- Video grid:
- Controls:
- Participants:
- Connection state:
- Leave:
- End meeting:

### 11. LiveKit / DB Consistency
- Start failure:
- Room failure:
- DB failure:
- End failure:
- Retry:

### 12. Audit / Monitoring
- Start:
- Token:
- Join:
- Leave:
- End:
- Provider error:
- Reconnect:

### 13. Security Tests
- SEC-LK-01〜:
- Token:
- IDOR:
- PII:
- Role escalation:
- Rate limit:

### 14. Test
- LK-U01〜:
- LK-T01〜:
- CONNECT-T01〜:
- Integration:
- 2-user E2E:

### 15. Infrastructure
- Environment Variables:
- CSP:
- Permissions-Policy:
- Feature Flag:
- Dev/Test LiveKit:

### 16. Performance
- SFU:
- Vercel media proxy:
- Video rendering:
- Participant scale:

### 17. 実行結果
- lint:
- typecheck:
- unit:
- integration:
- livekit:
- security:
- e2e:
- build:

### 18. 作成・変更ファイル
- ...

### 19. DB Migration差分
- なし
または
- ...

### 20. 未実施・未解決事項
- ...

### 21. Phase 11への引継ぎ
- ...
```

既存コード、要件定義書、基本設計書、DB設計書、API詳細設計書、画面詳細設計書、テスト詳細設計書、セキュリティ設計書、インフラ構築設計書、リリース・運用設計書から合理的に判断できる事項は質問せず実装してください。

ただし以下は実行しないでください。

```text
Production LiveKit Project変更
Production LiveKit Secret登録
Production DB Migration
Production DB変更
Production Secret変更
Production Deploy
課金を伴うProduction Resource作成
破壊的Production操作
```

Dev/Test環境またはProvider Mockを使用し、Phase 10として完成可能な範囲まで実装してください。