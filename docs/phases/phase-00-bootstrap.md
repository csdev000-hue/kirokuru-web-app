あなたはシニアフルスタックエンジニアとして「AIプロジェクトマネージャー」のMVPを実装してください。

## 目的

Phase 0では、今後のDB・認証・API・AI・画面実装を安全に進めるためのNext.jsプロジェクト基盤を構築します。

このPhaseでは業務機能を実装しすぎず、以下を満たす「開発可能な初期状態」を完成させてください。

## 技術スタック

- Next.js
- App Router
- TypeScript
- Node.js
- npm
- Vercel
- PostgreSQL: Neon
- ORM: Drizzle ORM
- AI: Amazon Bedrock
- Storage: Amazon S3
- Online Meeting: LiveKit
- GitHub / GitHub Actions
- Validation: Zod
- Test: Vitest
- E2E: Playwright

ブラウザからNeon、Bedrock、S3等へ直接接続してはいけません。

必ず以下の構成とします。

Browser
→ Next.js
→ Route Handler / Service
→ Neon / Bedrock / S3 / LiveKit

## Phase 0 実装範囲

### 1. Next.jsプロジェクト初期化

Next.js App Router + TypeScriptでプロジェクトを構築してください。

最低限以下を有効化してください。

- TypeScript strict
- ESLint
- App Router
- srcを使わずroot直下のapp構成
- import alias `@/*`

既存プロジェクトが存在する場合は再初期化せず、現在の構成を確認して不足部分だけ追加してください。

## 2. 初期ディレクトリ構成

以下を作成してください。

```text
/
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── organizations/
│   ├── projects/
│   ├── tickets/
│   ├── meetings/
│   └── api/
├── components/
│   ├── ui/
│   └── layout/
├── lib/
│   ├── db/
│   │   └── schema/
│   ├── auth/
│   ├── permissions/
│   ├── ai/
│   │   ├── prompts/
│   │   ├── schemas/
│   │   ├── validators/
│   │   └── services/
│   ├── bedrock/
│   ├── s3/
│   ├── livekit/
│   ├── security/
│   └── utils/
├── drizzle/
│   └── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── fixtures/
├── e2e/
├── scripts/
├── ops/
├── infra/
├── .github/
│   └── workflows/
├── .env.example
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── README.md
```

空ディレクトリがGit管理できない場合は、必要に応じて`.gitkeep`またはREADMEを配置してください。

## 3. 必要パッケージ

Phase 0で必要な基盤パッケージを導入してください。

最低限以下を想定します。

- drizzle-orm
- drizzle-kit
- postgres またはNeonに適したPostgreSQL driver
- zod
- @aws-sdk/client-bedrock-runtime
- @aws-sdk/client-s3
- @aws-sdk/s3-request-presigner
- livekit-server-sdk
- vitest
- @testing-library/react
- @testing-library/jest-dom
- playwright

認証ライブラリはPhase 1以降で確定実装するため、Phase 0では過剰な認証処理を作らないでください。

必要性のないUI Frameworkや状態管理ライブラリを勝手に追加しないでください。

## 4. 環境変数

`.env.example`を作成してください。

実値やSecretは絶対に記載しないでください。

最低限以下を定義してください。

```env
DATABASE_URL=

AUTH_SECRET=
AUTH_TRUST_HOST=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

BEDROCK_MODEL_ID=

S3_BUCKET_NAME=

LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

NEXT_PUBLIC_APP_URL=
```

Secretを`NEXT_PUBLIC_`へ設定してはいけません。

## 5. 環境変数Validation

`lib/env.ts`等を作成し、Zodを利用してServer環境変数を検証できる構成にしてください。

ただし、Phase 0の`npm run build`がローカルSecret未設定によって不必要に失敗しない構成を検討してください。

本番実行時には必須設定漏れを検知できるようにしてください。

## 6. DB接続基盤

以下だけ作成してください。

```text
lib/db/
├── client.ts
└── schema/
    └── index.ts
```

DrizzleからNeon PostgreSQLへ接続できる基本構成を準備してください。

Phase 0では業務テーブルをまだ実装しません。

実際のusers / organizations / projects / tickets等は次Phaseで実装します。

DB ConnectionをBrowser側へ公開してはいけません。

## 7. drizzle.config.ts

以下を満たしてください。

- schemaの参照先を定義
- migration出力先を`drizzle/migrations`
- PostgreSQLを対象
- DATABASE_URLは環境変数から取得

Secretのハードコードは禁止です。

## 8. AI Adapterの骨組み

Phase 0ではBedrock実処理を完成させる必要はありません。

以下の責務だけ分離してください。

```text
lib/bedrock/
├── client.ts
└── types.ts
```

将来的に以下のような呼び出しができる構造を想定してください。

```ts
generateStructured<T>({
  systemPrompt,
  userPrompt,
  schema,
})
```

ただしPhase 0ではダミー実装やTODOでも構いません。

BrowserからBedrock Runtimeを直接呼び出すコードは禁止です。

## 9. S3 / LiveKit基盤

以下の骨組みを作成してください。

```text
lib/s3/
└── client.ts

lib/livekit/
└── client.ts
```

SecretをClient Componentへ渡さない構成にしてください。

Presigned URL発行やLiveKit Token発行の業務実装は後続Phaseで行います。

## 10. 共通Error型

API実装で共通利用できる最低限のError設計を準備してください。

例:

```ts
type ApiErrorResponse = {
  error: {
    code: string
    message: string
    requestId?: string
    details?: unknown
  }
}
```

内部Stack TraceやSecretをClientへ返さない前提にしてください。

## 11. Health Check

以下を実装してください。

```text
GET /api/health
```

正常時:

```json
{
  "status": "ok"
}
```

Phase 0では外部サービスへの重い接続確認は不要です。

Health Check自体がDB・Bedrock障害によって落ちる構成にしないでください。

## 12. 初期画面

トップページまたはDashboardに、最低限以下が分かる仮画面を作成してください。

```text
AIプロジェクトマネージャー

Meeting
↓
AI Minutes
↓
AI Ticket Candidates
↓
Human Review
↓
Ticket
```

本格的なUI実装は行わず、アプリが正常起動していることを確認できる程度にしてください。

## 13. Test基盤

Vitestを設定してください。

最低限以下のTestを1件以上作成してください。

- utility unit test
- `/api/health`に関連するtest

Playwrightを設定し、最低限アプリのトップページが表示できるE2E Smoke Testを作成してください。

## 14. npm scripts

最低限以下を定義してください。

```json
{
  "dev": "...",
  "build": "...",
  "start": "...",
  "lint": "...",
  "typecheck": "...",
  "test": "...",
  "test:run": "...",
  "test:e2e": "...",
  "db:generate": "...",
  "db:migrate": "..."
}
```

実際のpackage.jsonに合わせて適切に設定してください。

## 15. GitHub Actions

`.github/workflows/ci.yml`を作成してください。

Pull Request時に最低限以下を実行します。

```text
npm ci
↓
lint
↓
typecheck
↓
unit test
↓
build
```

Production DeployはPhase 0では自動化しすぎないでください。

## 16. README

README.mdへ最低限以下を記載してください。

- サービス概要
- 技術スタック
- セットアップ方法
- `.env.example`のコピー方法
- 開発サーバー起動方法
- Test方法
- Build方法
- DB Migration方法
- Directory構成
- SecretをGitへCommitしない注意事項

## セキュリティルール

以下を厳守してください。

- Secretをコードへハードコードしない
- `.env.local`をCommitしない
- BrowserからDBへ直接アクセスしない
- BrowserからBedrockへ直接アクセスしない
- AWS SecretをClient Componentへ渡さない
- LiveKit API SecretをBrowserへ渡さない
- `dangerouslySetInnerHTML`を使用しない
- 不要なRaw SQLを使用しない
- Production Credentialを作成しない
- Production環境を変更しない

## Phase 0で実装しないもの

以下はまだ実装しないでください。

- usersテーブル
- organizationsテーブル
- projectsテーブル
- ticketsテーブル
- meetingsテーブル
- Auth本実装
- Organization CRUD
- Project CRUD
- Ticket CRUD
- Meeting CRUD
- AI議事録生成
- AIチケット生成
- S3 Recording Upload本実装
- LiveKit会議本実装
- Production Migration
- Production Deploy

先回りして大量実装しないでください。

## 実装ルール

1. 既存コードを最初に確認する。
2. 現状を壊す変更を避ける。
3. Phase 0の範囲だけ実装する。
4. TypeScriptの`any`を安易に使用しない。
5. 共通処理はlibへ分離する。
6. Server/Client境界を明確にする。
7. 必要最小限のdependencyだけ追加する。
8. コード変更後に必ずTest/Buildを実行する。
9. エラーが発生した場合は原因を修正してから完了扱いにする。
10. Productionへ接続・変更しない。

## 完了条件

以下がすべて成功した場合のみPhase 0完了としてください。

```bash
npm install
npm run lint
npm run typecheck
npm run test:run
npm run build
```

可能であれば以下も実行してください。

```bash
npm run test:e2e
```

また以下を確認してください。

- `/api/health`が正常応答
- トップページが表示される
- `.env.example`が存在する
- SecretがRepositoryへ含まれていない
- DB/Bedrock/S3/LiveKitのServer-side基盤が分離されている
- Phase 1以降の実装を開始できるディレクトリ構成になっている

## 作業終了時の報告形式

実装後、以下の形式で報告してください。

```text
## Phase 0 実装結果

### 1. 実装内容
- ...

### 2. 作成・変更ファイル
- ...

### 3. 追加dependency
- ...

### 4. 実行結果
- lint:
- typecheck:
- unit test:
- build:
- e2e:

### 5. 未実施・未解決事項
- ...

### 6. Phase 1への引継ぎ
- ...

### 7. セキュリティ確認
- Secret混入:
- ClientへのSecret露出:
- Production変更:
```

不明点があっても、設計書と既存コードから合理的に判断可能な事項は質問せず実装してください。

ただし、Production Credentialの入力、Production DB変更、外部サービスの課金・破壊的操作が必要な場合は実行せず、その理由を報告してください。