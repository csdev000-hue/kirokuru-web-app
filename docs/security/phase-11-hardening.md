# Phase 11 Security Hardening 実装補足

対象は Phase 0–10 の横断的保護。新しい業務機能、デプロイ、Production 設定変更は含めない。

## Request / Error / Logging

- 保護 API は `withCurrentUser` で毎回認証し、サーバーが UUID を採番する。外部 `X-Request-Id` は採用しない。
- JSON 成功応答は `{ data, requestId }`、一覧の既存 `meta` を保持する。エラーは `{ error: { code, message }, requestId }`。すべて `Cache-Control: no-store`、`X-Request-Id` を付与する。
- HTTP 204 は本文を持てないため requestId はヘッダーのみ。Auth.js の Session/CSRF JSON・OAuth redirect は認証プロトコル互換性のためラップせず、ヘッダーとログで追跡する。未設定・制限・内部障害のアプリ側エラーは共通 envelope。
- Health は外部接続せず `{ data: { status: 'ok' }, requestId }`。フレームワーク生成の未定義パス404／未対応メソッド405は業務API envelope の対象外。
- `ApplicationError` を BusinessError / AccessError が継承。構造不正400、業務検証422、越境404、権限不足403、競合409、サイズ413、制限429を維持する。未知例外は500。DB unique/FK/check/serialization/deadlock は安全な409、既知接続障害は503へ変換する。
- Bedrock/S3/LiveKit は既存 Provider 境界で例外を変換し、502/504等の固定メッセージを返す。SQL、スタック、Provider応答、SDKエラー本文は返さない。成功した署名URL／参加Token APIのみ、認可された本人へ必要な資格情報を返す。
- AsyncLocalStorage により API・監査・AI・Provider操作ログの requestId を統一。構造化ログは timestamp / level を追加し、許可した追跡・メトリクス項目のみ JSON 1行に出力する。自由文エラー・body・header・URLを受け付けない。共通 redaction は機密キー、URL、JWT等を伏せる。
- UI は429に待ち時間、500系に安全な文言と requestId を表示する。

## Audit

`AUDIT_ACTIONS` が共通定義。組織・プロジェクト・Ticket/Comment・Meeting/Participant/Transcript・AI/レビュー・候補登録・録音・オンライン会議の既存監査を維持する。
metadata は strict allowlist、本文・署名URL・Token を保存しない。requestId は metadata に追加するため audit_logs の Migration は不要。

重要更新と監査は同一 Transaction。候補の正式登録で監査失敗時は Ticket/候補更新をロールバックする。録音URL発行も既存の fail-closed 方針を維持し、監査できないURLはクライアントへ渡さない。一般ユーザー向けの監査編集・削除 API はない。DB 管理者からの改ざんに対する外部WORM保管は今回の実装範囲ではない。

## Rate Limit

`rate_limits` テーブルの原子的 UPSERT。DB時刻の60秒 fixed window、SHA-256化した key、hits、expires_at のみ保存する。プロセス内メモリや新規課金サービスに依存しない。カウンターは業務 Transaction の外で確定し、処理失敗・rollbackでも消費が残る。ストレージ障害時は fail closed。

| 設定 | 既定値/分 | 対象 |
| --- | ---: | --- |
| RATE_LIMIT_AUTH_PER_MINUTE | 300 | OAuth RouteとログインServer Actionの共通上限 |
| RATE_LIMIT_API_PER_MINUTE | 600 | その他の認証済みAPI、user単位 |
| RATE_LIMIT_AI_PER_MINUTE | 10 | AI Minutes/Candidate共通、user単位 |
| RATE_LIMIT_AI_PROJECT_PER_MINUTE | 30 | DB認可済みproject単位 |
| RATE_LIMIT_AI_RESOURCE_PER_MINUTE | 5 | DB認可済みmeeting単位、Minutes/Candidateを合算 |
| RATE_LIMIT_PRESIGNED_URL_PER_MINUTE | 30 | Upload/再Upload/Download、user単位 |
| RATE_LIMIT_TOKEN_PER_MINUTE | 30 | Token/Start/End/Join/接続イベント、user単位 |
| RATE_LIMIT_REGISTRATION_PER_MINUTE | 30 | 単独/一括正式登録、user単位 |

AI の meeting 制限は同会議の全 minutes も合算する保守的な上限。user全体のToken上限は同一user/meetingの大量発行も制限する。URLのパーセントエンコードで分類を迂回しない。既存の録音/LiveKitの監査履歴に基づくサービス内制限も共通化して維持する。直接サービス呼び出しの補助防御であり、失敗も数えるAPIカウンターの代替ではない。

Auth は識別子を持たない OAuth 開始も含むため共通全体予算とし、偽造可能な X-Forwarded-For を信用しない。企業NAT単位の制限はしない。全体予算が他ユーザーのログインにも影響するトレードオフがある。公開前に利用規模に応じた値、認証Provider/WAFの保護、信頼できるエッジによるIP別制限を運用側で検討する。既存 Session の保護API認証はこのOAuth全体予算を消費しない。

429は `RATE_LIMIT_EXCEEDED` と Retry-After 秒。Provider由来の Bedrock 429 は `AI_RATE_LIMITED` と区別する。Idempotency/生成lease/DB lock は別途維持する。固定窓境界では短時間に最大2窓分の要求が通り得る。認証済みuser/認可済みresourceのみkeyを増やし、同じkeyは窓を跨いで再利用する。不要keyの削除は保持期間を決めてexpires_at indexで運用可能。本PhaseではProductionの削除ジョブを設定しない。

## Web / Authentication

- CookieはAuth.js標準の HttpOnly / SameSite=Lax、HTTPSではSecure。暗号化JWTと既存1時間Session更新を維持。独自パスワード・Session固定・role claim認可は導入しない。
- 書き込みは認証後に AUTH_URL のOriginと Sec-Fetch-Site を検査する。Auth.js のCSRF/PKCEは上書きしない。redirect は既存の同一Origin許可パスに限定する。
- アプリは同一Origin、CORSワイルドカードなし。S3の限定CORSは既存infra例を使用する。
- Proxyで新しいnonceを生成してCSPをNextのリクエスト/応答双方へ設定。ルートLayoutはrequest-time rendering。scriptの unsafe-inline / production unsafe-eval を許可しない。styleの unsafe-inline はReact/LiveKitの動的styleに必要な例外。
- `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`。connect先は同一Originと設定済みLiveKit HTTP(S)/WS(S)、S3 bucket endpointのみ。ローカルMock endpointはloopback HTTPのみ可。外部平文・userinfo・query付きprovider URLを拒否する。mediaはS3とself/blob。
- nosniff / no-referrer、camera/microphone/display-captureは会議ページのselfのみ。他ページは不可。
- HSTSは NODE_ENV=production かつ AUTH_URL がHTTPSのとき max-age=31536000。includeSubDomains/preload はドメイン運用を確認せず追加しない。ローカルHTTPビルドには適用しない。
- React escapeを維持。raw HTML、任意sort SQL、S3 keyのクライアント指定なし。

Nonceとdynamic renderingの根拠: [Next.js公式 CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)。strict-dynamicでは信頼済みスクリプトが作るスクリプトにも信頼が伝播するため、E2EはHTMLパーサーで処理されるnonceなしscript/event handlerを注入して拒否を確認する。

## 機能別 Security Review Matrix

全行でサーバー認証・DBによるresource所属照合を前提とする。非所属/不明resourceは同じ404。認証・認可をClient role/projectIdだけで判断しない。

| Feature | Authorization | Validation | Rate | Audit | Tenant isolation | Secret / Provider |
| --- | --- | --- | --- | --- | --- | --- |
| Organization | DB membership / owner | strict、name等whitelist | user CRUD | create/update/delete | organization条件 | なし |
| Project | org＋project membership | strict、更新列指定 | user CRUD | create/update/archive/delete | JOINで限定 | なし |
| Ticket / Comment / Kanban | DB Ticket→Project、viewer書込不可 | strict、sort enum、本文上限 | user CRUD | create/update/delete/comment | 論理削除を除外 | React escape |
| Meeting / Participant / Transcript | Meeting→Project、member write | strict、speaker照合、bulk上限 | user CRUD | 更新・参加者・発言 | 親子resource照合 | 本文をログしない |
| AI Minutes | member＋会議参照 | schema/evidence/入力byte上限 | user/project/meeting | generate/failure/review | 会議内根拠 | Bedrock、raw非保存 |
| AI Candidate | member＋承認済Minutes | schema/ID/evidence/priority | user/project/meeting | generate/review/failure | Minutes/Meeting一致 | Bedrock、AIの直接Ticket作成なし |
| Registration | 候補→Project、member | 承認・根拠・担当者再照合 | user registration | Ticket＋候補と同一Tx | 同一Project、一括全件検証 | Idempotency＋行lock |
| Recording | Recording→Meeting→Project | MIME allowlist/size/HEAD/server key | user URL＋監査履歴 | 発行/完了/失敗/削除 | private object＋DB認可 | S3短期URL、ログしない |
| Live Meeting | Meeting→Project、DB role | strict、server room/identity | user live＋監査履歴 | start/token/join/leave/end/failure | room grant限定 | LiveKit短期JWT、ログしない |

Ticket/Meeting/Transcript/Recording一覧は既存ページングを維持。その他の組織/メンバー/会議内履歴等には既存の非ページング取得が残るため、利用規模増大時にAPI互換性を考慮したページングを検討する。全Tenant取得後のClientフィルタにはしない。

## Provider / Degradation

Bedrock: 全体Abort timeout既定30秒、SDK attempt 1、transient transport retry最大1、schema repair最大1。403/通常400はretryしない。
S3: HEAD/Delete timeout10秒、SDK maxAttempts 2。型/サイズ/オブジェクト存在を検証。
LiveKit: SDK requestTimeout10秒、failover無効。Room操作失敗時は固定メッセージ、開始/終了の回復状態を維持。

AI_ENABLED / RECORDING_ENABLED は実行時kill switch（既存互換のため未設定時true）。LIVE_MEETING_ENABLEDは既存の明示trueのみ。停止時にも録音削除・会議終了/退出を可能とする。Providerは遅延初期化され、AI/S3/LiveKit障害はProject/Ticket機能にProvider依存を追加しない。共通DB自体の障害は別であり、全機能を保証しない。

## Secret / Supply Chain / CI

- `.env*` はignore、`.env.example` は値のないSecret項目と非秘密設定のみ。Server SDK/DBはserver-only境界。
- `security:secrets`: Git管理・未追跡対象の作業ツリー、禁止公開env、既知Secretパターン、危険なコードprimitiveを検査。検出時はファイル/ルール名のみ出し値を出さない。Git全履歴や外部ログの完全検査ではない。既知パターン検出だけで任意のSecret不在を証明するものではない。
- `security:client`: buildの `.next/static` に設定Secret実値、既知パターン、代表的なServer SDK識別子がないことを検査。buildがなければ失敗。CIでは非秘密canaryを使う。Nextのserver-only build検証も維持する。
- `security:readiness`: envとOrigin/flagをオフライン検査。接続・Migration・IAM変更をしない。実Credential有効性・DB権限・環境分離の証明ではない。
- npm auditでHigh/CriticalをCI失敗とし、Moderate/Lowも報告して評価する。lockfile、npm ciを維持。新規依存追加なし。既存依存はSDK・UI・ORM・認証・検証・テスト/開発用途で使用。
- CI/security.yml は contents:read、checkout credential非永続化、actions/checkoutとsetup-nodeを確認済みv4 commitへ固定。Production secret参照・デプロイ・外部Migrationなし。DBはテストhelperが作成した一時ローカルDB。Fork/PRにもProduction権限を渡さない。

## Migration / 運用引継ぎ・既知の境界

`0007_dry_kinsey_walden.sql`: rate_limits（key PK/hits/expires_at）＋期限indexのみ。隔離テストDBで新規作成/再適用を検証。Productionへ適用していない。通常アプリ用credentialとMigration/管理credentialを分離し、アプリにDDL権限を与えない。DB TLS verify-full、Drizzle parameterized queryを維持する。実DBロール付与は運用環境で確認する。

- Google OAuth実Provider、実S3/IAM、実LiveKit WebRTC、Productionのセキュリティ設定は未検証。既存Mock/fixtureとローカルブラウザーで回帰確認する。
- Auth JWTの複製を即座に全端末失効させるDB Session機構はない。既存の更新可能Sessionを単に1時間で必ず失効すると説明しない。
- 発行済みLiveKit JWTは会議終了/DB権限変更だけでは即失効しない。再接続・Room再作成、SDKによるToken更新の境界はPhase10補足どおり。実運用要件が即時失効を必要とする場合、Provider側の遮断/参加者削除・Webhook再検証等を別途設計する。短い初期TTLだけで解決済みとしない。
- 発行済みS3 PUTはDB削除後も期限まで有効で、再作成があり得る。既存tombstone/consistency checkで照合する。MIME/HEADはマルウェア検査ではなくAV/実内容検査は未導入。
- ログ保存先の閲覧権限/保持期間、Auth全体予算、実Provider障害時の復旧、DB least privilege、Preview/Production分離はPhase12受入で確認する。Production操作を自動実行しない。
