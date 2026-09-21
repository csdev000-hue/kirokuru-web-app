# Phase 12 残課題解消・公開前再検証

検証日: 2026-09-22 JST。基点: `9290902 Phase12実施完了`、開始時Git clean。

## 1. Release Decision

**NOT READY**。
ローカル復旧方式のテスト不足は解消したが、環境分離と非Production接続設定・費用の確認ができず、実OAuth/Provider/通知/Neon復旧の公開阻害要因は残る。

## 2. OAuth

- 設定: **BLOCKED**。`.env.example`のみ。shellにもAuth/DB設定なし。実Google Clientと専用テストユーザーが未提供。
- 実ログイン/Callback/Session生成・維持/Logout: **BLOCKED、未実施**。
- 未認証拒否、不正Callback/redirect、CSRF、Session、別Organization拒否: **PASS（ローカル署名Session/Mockの既存回帰）**。実Google成功ではない。
- 管理者作業: Dev/TestのClient、許可Origin/callback、2ユーザー、専用AUTH_SECRET/DBを安全なSecret storeに設定。Secretをチャットへ貼らない。

## 3. Provider

| Provider | 実接続 | ローカル/Mockの再検証 |
| --- | --- | --- |
| Neon | BLOCKED: Project/Branch/runtime role/環境分離未確認。SELECT 1/CRUDも未実施 | 隔離PostgreSQLでMigration、CRUD、制約、競合、復元成功 |
| Bedrock | BLOCKED: 非Production Role/model/Region/費用未確認 | SDK＋Mock、構造化出力/Schema/根拠/エラー回帰成功 |
| S3 | BLOCKED: 専用Bucket/IAM/費用未確認 | SDK＋loopback Mock、PUT/HEAD/GET/DELETE・セキュリティ回帰成功 |
| LiveKit Server | BLOCKED: Project/鍵所属/費用未確認 | Token/Room制御/失敗系のMock回帰成功 |
| LiveKit Browser音声・映像 | BLOCKED: 実SFUと2ユーザー参加未確認 | Mock UI成功はメディア疎通証跡にしない |

AWSのconfig/credentialsファイルは存在するが内容未取得。用途が分からないdefault資格情報でSTSやProvider APIを呼ばない。

## 4. Environment Isolation

- Local: 設定ファイルは雛形のみ。`.vercel/project.json`なし。全`.env.example`定義項目はshell未設定。
- Test: 一時Unix socket/TLS loopback DB、合成データ・資格情報、ローカルProvider Mock。DB helperは外部DATABASE_URLを参照しない。復旧テストでambient URLを不達の予約アドレスに置き換えても成功。
- Dev / Preview: 非機密Project/Branch/Account/Role/Clientのinventoryとアクセスscope証跡なし、**BLOCKED**。
- Production: Secret取得・接続・変更を行っていない。非機密識別子/ポリシー証跡も未提供、分離を証明できない。
- Dev/Test→Production接続不能: 実リモート環境については**未証明**。別名のresourceや設定有無だけでPASSにしない。
- [環境調査JSON](evidence/phase-12-isolation-2026-09-22.json)、[環境別全項目表](../../ops/phase-12-revalidation-runbook.md)。

## 5. Monitoring

AWS Budget、Bedrock利用量、S3容量、API 5xx/Provider障害、LiveKit利用量、Neon利用量の設定と通知先・到達はすべて**BLOCKED**。アプリの安全ログ/requestId/Audit回帰は成功したが、通知配送を実証していない。テスト通知送信も行っていない。

各対象の設定、syntheticイベント試験、受信確認方法、API不可時の手動確認を[Runbook](../../ops/phase-12-revalidation-runbook.md)へ追加した。AWS BudgetだけでNeon/LiveKit/Vercelの費用を監視できるとは扱わない。

参照: [AWS Budget SNS](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html)、[S3容量/要求metrics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/metrics-dimensions.html)、[LiveKit Analytics APIの契約条件](https://docs.livekit.io/deploy/admin/analytics-api/)。公開仕様確認はアカウント設定の証跡とは別。

## 6. Backup / Recovery

- Neonの現在の契約、復元機能、実際のrestore window: **BLOCKED、未確認**。[公式plan文書](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md)の一般仕様をユーザー契約として代用しない。
- Neon復元試験: **BLOCKED**。Test専用source/target・費用未確認。手順を作成済み。
- 論理dump/restore代替方式: **PASS（ローカルfixture限定）**。17テーブルの全行、Migration履歴、Candidate↔Ticket、制約metadata一致と代表UNIQUE/FK/CHECKのSQLSTATEを確認。復元後Migration再実行でも不変。
- バックアップ後のmarkerは復元されないことを確認。dumpはPITRの代用ではなく、それ以降の更新を失う。
- 所要時間: dump 176ms、復元先作成〜restore〜照合完了 1,006ms（最終測定）。対象は小規模fixture。運用検知・実データ転送・App切替・S3 object・role/ACL復旧は含まない。
- RPO≤24h / RTO≤4h: **実環境では未検証**。定期backup、暗号化保管、失敗通知、restore演習が必要。今回はローカル検証用dumpを終了後削除し、実backup保管を構築していない。

初回の追加試験ではlibpq 14のIP証明書照合、CHECKの同値cast表記差、追加テストの型不足を検出した。接続はlocalhost名＋loopback hostaddrでverify-fullを維持し、制約metadataと実際のSQLSTATEを検証する形へ修正。型検査・build・Integrationを再実行して成功した。アプリ本体の変更はない。

## 7. Test Results

Node 24.11.1。以下は今回実行した最終結果。過去の成功を流用していない。

| コマンド | 結果 |
| --- | --- |
| npm ci | PASS |
| npm run lint | PASS |
| npm run typecheck | PASS（追加テストの型修正後） |
| npm run test:run | PASS、162件 |
| npm run test:integration | PASS、353件（復旧試験1件追加） |
| npm run test:security | PASS、209件 |
| npm run build | PASS（型修正後） |
| npm run test:e2e | PASS、50件、Chromium/Firefox/WebKit、32.8秒 |
| npm run security:secrets | PASS |
| npm run security:client | PASS |
| npm audit | PASS、脆弱性0件 |
| npm run db:generate | PASS、差分なし |
| npx vitest run tests/integration/qa-recovery.test.ts --reporter=verbose | PASS、1件（Integrationに含む） |
| npx tsx scripts/check-environment-isolation.ts | BLOCKED、exit 2。remote分離証拠なし |
| npm run security:readiness | FAIL、exit 1。Auth/DB/feature flag必須9項目不足 |

[コマンド実行証跡](evidence/phase-12-revalidation-commands.json)に開始/終了UTC、exit code、再実行履歴を記録。原ログはローカル`/tmp/kirokuru-recheck-*.log`、一時ファイル。Secretを含む可能性のあるraw browser traceは公開しない。今回はテストskip追加なし。

## 8. Remaining Blockers

[チェックリストR01–R21](../../ops/phase-12-release-checklist.md)に分類、状態、必要作業、環境、完了条件、証跡を記録。

1. 管理者がDev/Test/Preview/Productionの非機密resource IDとscope/IAM/ACL証跡を提供し、Production接続権限なしを確認する。
2. 安全なDev/Test認証の設定場所と費用上限を確定する。Google同意操作・2ユーザー操作も必要。
3. 各実Providerの小規模試験を実施する。LiveKitはServerと実メディアを別々に確認する。
4. 監視の通知先設定、購読確認、synthetic通知の実着証跡、利用量のAPI/手動確認担当を確定する。
5. Neonの契約・履歴窓・復元機能を確認し、隔離Test復元と整合性/RPO/RTOを測定する。
6. GitHub CI/Required Checksと公開責任者の確認。

実環境の変更案・影響・Rollback方法はRunbookに記載。Productionへの実行はしていない。

## 9. Changed Files

- `scripts/check-environment-isolation.ts`: 値を取得しないオフライン存在確認、remote分離はBLOCKED。
- `tests/helpers/postgres.ts`: 既存PG binary検出関数のexport。
- `tests/integration/qa-recovery.test.ts`: 一時DB間のdump/restore・整合性・制約・所要時間。
- `ops/phase-12-release-checklist.md`: 21項目の再検証台帳。
- `ops/phase-12-revalidation-runbook.md`: 環境表、OAuth/Provider/通知/復元手順と変更案。
- `docs/testing/phase-12-revalidation-report.md`: 本報告。
- `docs/testing/evidence/phase-12-isolation-2026-09-22.json`、`phase-12-revalidation-commands.json`: Secret値なしの証跡。
- `README.md`: 再検証へのリンク。

DB Migration差分: **なし**。Production Deploy/Migration/Secret取得・表示・変更/Data削除/S3削除/LiveKit変更は未実施。

## 10. Final Release Decision

**NOT READY**。
ローカルQAと論理復旧は成功したが、実環境分離・OAuth・Provider・監視通知・Neon復旧はBLOCKED。機能flagを無効にするだけではCoreの認証・DB・復旧の公開条件を満たさない。
