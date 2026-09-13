# kirokuru-web-app

会議からAI議事録・AIチケット候補を作り、人が確認して正式チケットへつなげる「AIプロジェクトマネージャー」です。
現在はPhase 1までの開発基盤・14テーブルのDBスキーマ・Relation・Migrationを実装しています。認証、CRUD API、AI生成、録画、会議機能は後続Phaseで実装します。

## 技術スタック

- Next.js 16 / App Router / React / TypeScript strict
- Node.js 24 / npm、Vercelを想定
- Neon PostgreSQL / Drizzle ORM / postgres.js
- Zod / AWS SDK（Bedrock・S3）/ LiveKit Server SDK
- ESLint / Vitest / Testing Library / Playwright / GitHub Actions

## セットアップ

Node.js 24系を用意してください（`.nvmrc`参照）。nvm利用時は`nvm install`と`nvm use`で切り替えます。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

初回の依存追加には`npm install`、lockfileからの再現には`npm ci`を使用します。
開発サーバーは http://localhost:3000 です。トップページと`GET /api/health`はSecret未設定で動作します。
Health Checkは`{"status":"ok"}`を返す生存確認で、外部サービスの稼働状況は検査しません。

### 環境変数

`.env.local`には開発環境専用の値を設定してください。`.env.example`にはキー名のみを記載しています。

| 用途 | 設定 |
| --- | --- |
| DB | `DATABASE_URL`（TLS対応のNeon接続文字列） |
| 認証（後続Phase） | `AUTH_SECRET`（32文字以上）、`AUTH_TRUST_HOST`（`true` / `false`） |
| AWS | `AWS_REGION`、必要なら`AWS_ACCESS_KEY_ID`と`AWS_SECRET_ACCESS_KEY`の両方 |
| Bedrock | `BEDROCK_MODEL_ID` |
| S3 | `S3_BUCKET_NAME` |
| LiveKit | `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` |
| 公開URL | `NEXT_PUBLIC_APP_URL` |

`lib/env.ts`はサーバー専用です。各クライアントの取得時にサービス別の必須値をZodで検証し、未設定・不正設定は本番実行時にも拒否します。値の検証は外部サービスへの接続・資格情報の有効性確認を行いません。
全設定の検証には`getServerEnv()`を使用できます。Phase 0では起動時の一括検証を強制せず、ビルド・トップページ・Health CheckにはSecretを要求しません。
AWS SDKは標準Credential Provider Chainを使用します。IAM Role等を使用する場合、静的キー2項目は空欄にしてください。片側だけの設定は拒否します。
認証方式と本番起動時の全設定検証の組み込みは、機能を追加するPhaseで確定します。

## テスト・ビルド

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run test`はVitestのwatchモードです。unit testは環境変数検証、共通エラー、Health Check、初期画面を検証します。
E2Eはビルド済みアプリを`127.0.0.1:3100`で起動し、トップページとHealth Checkを検証します。先に`npm run build`を実行し、このポートを空けてください。既存サーバーを再利用せず、実行後は自動停止します。
外部サービスには接続しません。`test:integration`はインストール済みPostgreSQL 14以上の`initdb`/`pg_ctl`で一時クラスタを作成し、Migration・DB制約・Relation・Fixtureを検証します。`PG_BIN`でバイナリディレクトリを指定できます。DATABASE_URLは使用せず、テスト後に一時DBを停止・削除します。security専用スクリプトは未定義です。

依存関係はlockfileで固定しています。Next.jsのESLintプラグインとの互換性のためESLint 9系を使用しています（npmのサポート終了警告あり）。プラグイン対応後に更新してください。
Drizzle Kitの間接依存`@esbuild-kit/core-utils`に限り、既知の開発サーバー脆弱性を修正した`esbuild` 0.25系へoverrideしています。Drizzle Kit更新時にoverrideの要否を再確認してください。

```bash
npm run build
npm run start
```

上記はローカルでの本番形式のビルド・起動であり、Productionへのデプロイ操作ではありません。
Pull RequestのCIでは`npm ci`、lint、typecheck、unit test、隔離DB integration test、Migration再生成差分チェック、build、E2Eを実行します。Migrationの適用先はテスト専用一時DBのみです。デプロイは実行しません。

## DB Migration

14テーブルの初期Migrationは`drizzle/migrations/0000_phase_01_database.sql`です。スキーマとRelation・型は`lib/db/schema/index.ts`からexportしています。DBクライアントはTLS証明書検証を有効にし、接続数を制限して再利用します。Neonの接続プール用URLの利用を想定しています。
以下は今後、安全な開発DBを設定したうえで実行する手順です。

```bash
# .env.local の DATABASE_URL が開発DBを指すことを確認する
npm run db:generate
# drizzle/migrations/ の生成SQLをレビューする
npm run db:migrate
```

`db:generate`は接続情報不要で、環境変数ファイルを読み込みません。`db:migrate`等の接続が必要なコマンドのみNext.js方式で環境変数を読み込み、`DATABASE_URL`未設定・不正時は停止します。
今回の実装では`db:migrate`による既存DBへの適用は行っていません。生成SQLは隔離テストDBへDrizzle Migratorで適用して検証しています。
設計差分、FK・Index一覧、更新日時方式、Fixture安全性は[DB実装補足](docs/design/database-implementation.md)を参照してください。
MigrationをGit管理し、Productionへの適用は別途承認済みの運用手順に従ってください。

## ディレクトリ構成

```text
app/                   App Router、仮トップページ、api/health
  login/ dashboard/ organizations/ projects/ tickets/ meetings/
components/            ui/、layout/（後続Phase用）
lib/
  env.ts               サーバー環境変数検証
  errors.ts            API共通エラー型・安全な内部エラー応答
  db/                  接続基盤、schema/（14テーブル・Relation・型）
  auth/ permissions/   後続Phase用
  ai/                  prompts/、schemas/、validators/、services/
  bedrock/ s3/ livekit/ サーバー専用クライアント
  security/ utils/     セキュリティ・共通処理
drizzle/migrations/    Migration出力先
tests/                 unit/、integration/、security/、fixtures/、helpers/
e2e/                   Playwright Smoke Test
docs/                  要件・設計・Phase仕様書
scripts/ ops/ infra/   スクリプト・運用・インフラ用
.github/workflows/     Pull Request CI
```

空ディレクトリは`.gitkeep`で管理します。後続Phase用ディレクトリには公開ページや業務APIをまだ設置していません。

## セキュリティと実装境界

- Secret、`.env.local`、Production CredentialをGitにコミットしないでください。`NEXT_PUBLIC_`には公開可能な値のみを設定します。
- DB・環境変数・Bedrock・S3・LiveKitクライアントは`server-only`でClient Componentからのimportを禁止しています。
- ブラウザはNext.jsのAPIを経由します。AWSキー、DB接続文字列、LiveKit API SecretをpropsやAPI応答へ渡しません。
- 設定エラーはキー名のみを表示します。未知の内部例外は共通エラー応答に変換し、Stack TraceやSQL・Secretを返しません。
- Bedrockの`generateStructured<T>`は未実装エラーを返す骨組みです。AI呼び出し・署名付きURL発行・Token発行は後続Phaseで実装します。
- Production環境への接続・Migration・DeployはPhase 0/1の対象外です。

作業前に`AGENTS.md`、作業するPhaseの`docs/phases/`仕様書、関連設計書を確認してください。
