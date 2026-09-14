# Phase 2 認証・認可 実装補足

仕様: `docs/phases/phase-02-auth.md`。Phase 3以降のCRUD・AI・外部サービス業務処理は実装しません。

## Authentication

Auth.jsのNext.js App Router向け構成を採用し、`next-auth@5.0.0-beta.32`を固定しています。公式v5導入手順に従うbeta版のため、更新時は認証回帰テストを実行してください。
ProviderはGoogle OAuth/OIDCひとつです。パスワード認証、Credentials Provider、テストログイン用APIは実装していません。Auth.js標準のOAuth検証、PKCE、CSRF、Cookie処理を維持しています。

`lib/auth/config.ts`がAuth.jsを設定し、`session.ts`がProvider依存のSession取得を包み、`current-user.ts`が既存usersテーブル上のUUIDを解決します。Permission層はAuth.jsを参照しません。

設定に必要なのは`AUTH_SECRET`（ランダムな32文字以上）、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`、`AUTH_URL`、`AUTH_TRUST_HOST`です。`DATABASE_URL`には開発用Neonのみを設定してください。OAuth callbackは`<AUTH_URL>/api/auth/callback/google`です。
`AUTH_URL`は信頼できるアプリのOriginです。localhost等のloopback以外はHTTPSを要求し、userinfo、query、fragment、ルート以外のpathを拒否します。信頼するホストを設定した環境で`AUTH_TRUST_HOST=true`を使用してください。文字列`false`をtruthyと解釈しません。

設定は実行時に読みます。SecretやProvider設定未指定でもビルド・トップページ・Health Checkは動作します。設定不備時はLoginに一般的な案内を表示し、Auth APIは安全な503を返します。Googleから戻るエラー文字列をそのまま画面に表示しません。

## User同期とSession

Googleの検証済みprofile（`email_verified=true`）だけを受け入れ、emailは小文字へ正規化します。未検証email、メール欠落、不正profileはログインを拒否します。以後追加するUser作成経路も同じ正規化を使用してください。既存の大文字emailを持つデータがある場合は、導入前に衝突を確認して正規化する必要があります。Phase 1のcase-sensitive UNIQUE自体は変更していません。

emailのUNIQUEを対象とするupsertで、同時初回ログインの重複Userを防ぎます。Googleが返したname/avatarを同期し、返さなかった値は既存値を保持します。新規Userでnameがない場合はDBのNOT NULL制約に合わせてログインを拒否し、架空の名前を補完しません。
ProviderのsubjectやTokenをApplication IDには使いません。

SessionはAuth.jsの暗号化JWTです。各Tokenの有効期限は発行/更新から1時間で、Auth.js標準のSession更新時には延長されます。アプリ固有のpayloadは`appUserId`だけで、Auth.jsが有効期限等を付加します。Provider Token、email/name、roleはJWTへ保存しません。`getCurrentUser()`はSessionのUUIDでDBを引き直し、削除済みUserは未認証として扱います。APIのCurrentUser出力はid/email/nameのみです。Session updateでClientが送信したUser ID・roleは無視します。

LogoutはAuth.js標準のPOST Server ActionでSession Cookieを削除し、`/login`へ遷移します。CookieのSecure/HttpOnly/SameSite設定は上書きしていません。HTTPSではSecure、ローカルHTTPでは開発用Cookieになります。
JWT方式のため、Cookie削除前に複製されたTokenを全端末で即座に失効させるDBセッション機構はありません。複製Tokenは有効期限内に再使用・更新できるため、サーバー側の一括失効機能が必要な運用ではDB Session等を追加してください。今回の対象には含めていません。Auth SecretをログやClientへ出してはいけません。
Login/Logoutのredirectは同一Originの`/dashboard`と`/login`だけを許可し、query/fragmentを引き継ぎません。

## Authorization

Permission helperの`userId`は必ず`requireCurrentUser()`の戻り値から渡します。Request Body、ヘッダー、Query、Session roleを認可情報として使ってはいけません。`minimumRole`はサーバー側の処理要件で固定し、Requestから受け取らないでください。

- Organization: membershipがなければ404、memberの管理操作は403。
- Project: ProjectMemberとProject所属OrganizationのOrganizationMemberをJOINして確認します。組織ownerもProject非所属なら自動昇格しません。
- Role: owner > member > viewer。閲覧はviewer以上、Ticket/Meeting更新・AI生成はmember以上、Project設定・Member管理はownerのみ。
- Resource: Ticket/Meeting/Minutes/Candidate IDからDB上のProjectを辿ります。Client指定projectIdは使いません。
- 論理削除Ticket、候補とMeeting/Minutesの所属不整合は404。
- 非所属と存在しない対象は同じ`RESOURCE_NOT_FOUND`・一般メッセージに統一し、相手Tenantの名称・本文を返しません。

Role定数はDBから型を導出し、値がDB Schemaと一致することを単体テストしています。取得結果・roleはリクエストを越えてキャッシュしないため、DBの所属削除・降格が次回判定へ反映されます。

## Protected Route/API

`app/(protected)/`へDashboard・Organizations・Projects・Tickets・Meetingsを配置しています。共通レイアウトに加え各ページでもサーバー側認証を確認します。Next.jsのレイアウト再利用だけに認証を依存させません。業務画面は仮表示のみです。
Middleware/ProxyにDB認可を載せず、Page/Route Handler内で確認する構成です。

`GET /api/me`はPhase 2の保護APIです。`withCurrentUser`で認証を共通化し、未認証401・権限不足403・不明Resource404・予期しない例外500を安全なJSONへ変換します。requestIdはサーバー採番し、Cache-Control: no-storeを設定します。
後続の動的RouteではRouteのPath/Body検証を行い、認証済みUserとサーバーで固定した操作権限だけをPermission層へ渡してください。認証済みという理由だけでリソースへアクセスさせないでください。

## Audit・Logging

`writeAuditLog`は既存audit_logsへ追記します。トランザクションのinsertインターフェースも渡せます。まだ業務APIへ一律適用していません。
呼び出し前に認可を行い、organizationId/userId等はサーバーが決定します。監査関数自体を認可チェックの代わりに使用してはいけません。
metadataはchangedFields/count/reasonCodeの許可した構造だけを受け入れ、任意本文・Token・未知キーは拒否します。用途が増える際は明示的に許可項目を追加してください。

`logSecurityEvent`はrequestId/userId/resourceType/resourceId/action/resultに限定します。未知キー、任意の自由文、Secretは受け付けません。Auth.js loggerは生例外・Provider応答を破棄し、固定の認証失敗イベントだけを記録します。

## DB Migration

追加Migrationはありません。既存usersとmembershipを再利用し、JWT方式のためAuth.js Adapter用accounts/sessionsテーブルを増やしていません。

## Testsと外部接続

- Unit: Role Matrix、エラー変換、Session/User解決、設定不備、redirect、callback、ログの項目制限。
- Integration: 隔離PostgreSQLでUser同期・既存値保持・複数接続競合を検証。Phase 1のDBテストも継続。
- Security: AUTHZ-T01〜08、SEC-TENANT-01〜03、Minutes/Candidate越境、偽造role、所属不整合、監査を検証。
- E2E: ローカルの本番形式ビルドを使用。Login表示→テストSession Mock→Dashboard→標準Logout、未認証画面/API、偽造Cookie・CSRFを検証。

E2E runnerだけが一時Auth Secretと署名済みMock Sessionを生成します。アプリにテスト分岐・テストProvider・テストログインAPIはありません。
一時PostgreSQLのループバックTCP接続に専用TLS証明書を発行し、子プロセスのNODE_EXTRA_CA_CERTSでのみ信頼させます。アプリのTLS検証は無効化しません。通常のDBテストは従来どおりUnix socketのみです。
既存DATABASE_URLは使わず、終了後に一時DBと証明書を削除します。テストTokenは短命ですが失敗時のtrace等に含まれ得るため、test-results/playwright-reportはGit管理しません。
E2EにはPostgreSQLツール、OpenSSL、Playwright Chromiumが必要です。

実Google OAuthの同意・callback・実Credentialでの疎通は未実施です。開発用Google OAuth設定とNeonを用意した後、READMEの手順で手動確認してください。ProductionのSecret登録、ユーザー作成、DB接続、Migration、Deployは行っていません。
