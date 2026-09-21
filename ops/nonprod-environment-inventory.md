# Nonproduction Environment Inventory

調査: 2026-09-22 JST。基点5c410fa、開始時Git clean。調査範囲はRepository/ローカル設定の存在と公開公式資料。リモート管理APIへのログイン・参照も実施していない。

MISSING=ローカル成果物/設定の不存在を確認。UNKNOWN=リモート実在/契約が未確認。BLOCKED=分離等の判定前提不足。クラウド未構築とは断定しない。台帳の記入は完了したが実環境の確認は未完了。

| Service | 項目 | 設定・証跡 | 実環境状態 |
| --- | --- | --- | --- |
| Vercel | Team / Project | .vercel/project.json MISSING | UNKNOWN |
| Vercel | Development / Preview | env scope/紐付け証跡 MISSING | UNKNOWN |
| Vercel | Deployment URL / 契約 | 管理画面証跡 MISSING | UNKNOWN |
| Neon | Project | 非機密ID MISSING | UNKNOWN |
| Neon | Dev / Test / Preview Branch | branch IDと親/データ由来証跡 MISSING | UNKNOWN |
| Neon | Runtime DB Role / Migration Role | role grant証跡 MISSING | UNKNOWN |
| Neon | 契約 / Backup / Restore window | 契約・設定証跡 MISSING | UNKNOWN |
| AWS | Account ID / Region | 検証済みID/region MISSING | UNKNOWN |
| AWS | CLI Profile | 専用用途の指定 MISSING、config/credentialsファイルはEXISTS（内容未取得） | UNKNOWN |
| AWS | CDK Stack | cdk.json/CDK依存/Stackコード MISSING | リモートStack UNKNOWN |
| AWS | S3 Bucket | 設定MISSING、infra/awsにtemplate EXISTS | UNKNOWN |
| AWS | Runtime Role / OIDC Provider | 実ARN/Trust/issuer設定 MISSING | UNKNOWN |
| AWS | Bedrock Model | model/region対応の確定値 MISSING | UNKNOWN |
| LiveKit | Project / 契約 / Dev-Test用途 | 設定・証跡 MISSING | UNKNOWN |
| Google | Cloud Project / OAuth Client | 設定・非機密ID MISSING | UNKNOWN |
| Google | Authorized Origin / Redirect URI | 設定証跡 MISSING | UNKNOWN |
| Google | Test Users | 2名の専用利用者設定証跡 MISSING | UNKNOWN |
| Production | 非機密resource識別子 | 未提供 | UNKNOWN |
| Production | Dev/Testとの分離 | Trust/DB role/env scope/resource policy証跡 MISSING | BLOCKED |

Localは.env.exampleのみ、実envファイルなし。Testは一時PostgreSQLとloopback Provider Mock、Production値を使用しない。Dev/Previewの実接続先・IAM Trust・DB Roleは未確認。同名/別名から権限分離を推測しない。Production Secret取得は行わない。

## 必須9項目

2026-09-22 `npm run security:readiness`: exit 1、以下9項目が不足。`npx tsx scripts/check-environment-isolation.ts`: exit 2/BLOCKED。Configured **0** / Missing **9**（このLocalで実検査した範囲。クラウド設定件数ではない）。

| 変数 | 用途/検証 | 必要な環境 | 取得元・設定先 |
| --- | --- | --- | --- |
| DATABASE_URL | PostgreSQL接続、TLS/role別途検証 | Dev/Test/Preview | Neon専用branch/runtime role→環境別Secret store |
| AUTH_SECRET | JWT暗号化、32文字以上 | Dev/Previewごとに独立 | 安全な乱数生成→Secret store、値は出力しない |
| AUTH_URL | 信頼origin、readinessはHTTPS必須 | Dev/Preview | 承認済み固定URL→Server env |
| AUTH_GOOGLE_ID | OAuth Client識別 | Dev/Preview | Google専用Web Client→Server env |
| AUTH_GOOGLE_SECRET | OAuth Client認証 | Dev/Preview | Google Console→Secret store |
| AUTH_TRUST_HOST | 信頼ホスト、検査はtrue必須 | Dev/Preview | origin確定後に管理者設定 |
| AI_ENABLED | AI有効化を明示 | Dev/Preview | 初期false案、実試験時だけ承認範囲でtrue |
| RECORDING_ENABLED | 録音有効化を明示 | Dev/Preview | 初期false案 |
| LIVE_MEETING_ENABLED | Live会議有効化を明示 | Dev/Preview | 初期false案 |

Local localhostのHTTP開発設定とproduction-readinessのHTTPS要件は区別する。検査を通すために既存validatorを弱めない。9項目すべてSecretという意味ではない。雛形のflag値は実設定に数えない。

機能有効時に追加: AWS_REGION、BEDROCK_MODEL_ID、S3_BUCKET_NAME、LIVEKIT_URL/API_KEY/API_SECRET。OIDC導入後はAWS_ROLE_ARN（非機密ARN）をDevelopment/Previewに設定し、短期tokenをSDK providerから取得する。長期AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEYはVercelへ設定しない。

## 既存Infrastructureと不足

`rg --files --hidden`（node_modules/.git/.next除外）と`git ls-files docs/phases docs/infrastructure infra`で調査。専用Infrastructure Dev/Test PhaseとBudget Guard仕様はMISSING。一般infrastructure-design.mdのMVP方針は手順＋設定例、将来CDKであり、完成したCDK仕様ではない。
既存S3 template、Rate Limit、AI input/output/retry上限、Feature flags、token metrics、readiness/isolation scripts、CI/Mockテストを再利用する。月次全Provider支出上限・予約/実績照合型Budget GuardはMISSING。現在のRate Limitで月3,000円を保証しない。

## 16 / 17テーブルの説明

- `tests/integration/database.test.ts:33` はtable_schema='public'のみを数えるので16。
- `tests/integration/qa-recovery.test.ts:16` はpublicとdrizzleを数えるので17。42行に16 app + migration journalのassertion。
- Migrationは0000の14テーブル＋0004 candidate_generations＋0007 rate_limits=16。
- Drizzle migratorが管理する`drizzle.__drizzle_migrations`が追加1。node_modules/drizzle-orm/pg-core/dialect.jsの既定journal名も照合。
- Phase12と再検証の間にSchema変更はない。今回もMigration変更なし。不一致を理由にテストやMigrationを変更しない。
