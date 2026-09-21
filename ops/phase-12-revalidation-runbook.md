# Phase 12 実環境確認・復旧手順

2026-09-22。これは未実行手順を含む。完了証跡はrelease-checklistとrevalidation-reportを参照する。
Secret値、OAuth code、Cookie、Token、接続文字列、署名URLは報告・ログ・Gitへ出さない。

## 実接続を開始する条件

1. 管理者がDev/Test専用Vercel Project/Environment、Neon Project/Branch、AWS Account/Role/Region、S3 Bucket、LiveKit Project、OAuth Client/Callbackを非機密IDで特定する。
2. ProductionはSecretの取得なしに管理者提供の非機密inventoryとIAM/ACL/環境scope証跡で照合する。異なる名前だけでは分離の証明にしない。
3. Dev/Test credentialにProduction resourceへの権限がないことをIAM policy、DB role/project境界、Vercel env scope、LiveKit project keyの所属で確認する。Productionへの接続試行はしない。
4. 試験データは合成データのみ。Production branch/dataの複製をテストに使わない。
5. Dev/Testの認証情報を環境別Secret storeへ設定し、試験費用上限・最大呼出数・cleanup担当を記録する。共有AWS default profileを自動使用しない。
6. 分離・費用・接続先のいずれか不明なら、下記の実接続はBLOCKEDのままにする。設定検査やMock成功を代用しない。

`npx tsx scripts/check-environment-isolation.ts`はオフラインの存在確認のみ。Secret/`.env`内容を読まず、remote isolationを証明できないためexit 2/BLOCKEDを返す。実環境証跡が揃った場合も、この出力だけをPASSに置き換えない。

## 環境別inventory（管理者が追記する非機密項目）

| 項目 | Local | Dev | Test（今回） | Preview | Production |
| --- | --- | --- | --- | --- | --- |
| Vercel Project / Environment | linkなし | 未確認 | 使用せず | 未確認 | 非機密ID未提供 |
| Neon Project / Branch | 未設定 | 未確認 | 使用せず | 未確認 | 非機密ID未提供 |
| DATABASE_URL | shell/env fileなし | 未確認 | harness生成一時DB、loopback/Unix socket | 未確認 | 取得禁止 |
| AWS Account / Region | account未確認、region未設定 | 未確認 | 実AWSなし、Mock ap-northeast-1 | 未確認 | 非機密ID未提供 |
| AWS IAM Role | 未指定、credentialsファイル存在のみ確認 | 未確認 | 合成資格情報、Mock endpoint固定 | 未確認 | Secret取得禁止、policy証跡待ち |
| S3 Bucket | 未設定 | 未確認 | local-recordings-test（Mock） | 未確認 | 非機密ID未提供 |
| Bedrock Model | 未設定 | 未確認 | local-e2e-model（Mock） | 未確認 | model利用設定未確認 |
| LiveKit Project | 未設定 | 未確認 | loopback Mock | 未確認 | 非機密ID未提供 |
| OAuth Client / Callback | 未設定 | 未確認 | local-e2e-client / loopback、実OAuthなし | 未確認 | 非機密ID未提供 |
| Secret | shell未設定、AWS store内容未読 | 未確認 | 動的生成/合成値のみ | 未確認 | 取得/表示/変更なし |
| Feature Flag | shell未設定 | 未確認 | E2Eは3機能trueでMock接続 | 未確認 | 未確認・変更なし |

`.env.example`のAI=true/Recording=true/Live=falseは雛形であり、どの実環境の設定証拠でもない。
Test harnessは外部DATABASE_URLを参照せずDBを作成する。復元テストでは予約済み不達IPのambient DATABASE_URLを設定しても一時DBだけを利用することを検証する。これはDev/PreviewのIAMやネットワークを保証しない。

## OAuth（分離確認後）

必要項目: Dev/Test専用`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` / `AUTH_URL` / `AUTH_TRUST_HOST` / `DATABASE_URL`。

- 管理者が専用Google Web OAuth Client、同意画面、2名のテストユーザー、許可Originと`<Dev/Test origin>/api/auth/callback/google`を確認する。
- 2つの独立ブラウザでログインしCallback成功、Session API成功、reload後Session維持、保護画面を確認する。SecretやcodeのあるNetwork dumpは保存しない。
- 一方のユーザーのOrganizationを他方がAPI/直接URLで読めないことを確認する。
- 未認証API=401、不正redirectが外部へ遷移しないこと、CSRFなしLogout拒否、正常Logout後Sessionと保護API拒否を記録する。
- 証跡: 日時、環境名、シナリオID、HTTP status、requestId、結果。アカウント識別は匿名化する。

## Provider（分離・費用確認後のみ）

| Provider | 最小試験と完了条件 | 制限・cleanup |
| --- | --- | --- |
| Neon | TLS接続→SELECT 1→migration journal照合→合成Org/ProjectのCRUD→読戻し | runtimeとmigration roleを分離。対象Test branchだけ。Migrationを勝手に適用しない |
| Bedrock | 利用model/profile/regionとInvoke権限を確認。合成Transcriptで1回の最小Converse→JSON parse→既存Zod/根拠ID検証→Human Review | token上限と最大retry込み費用を合意。429/timeout等は通常Mockで試験し実障害を起こさない |
| S3 | 一意のqa prefixに小さい合成object PUT→HEAD size/type→認証GET内容比較→匿名GET拒否→DELETE→HEADで不存在 | 専用Bucketのみ。PublicAccessBlock/Policy/ACL/暗号化/CORSも確認。試験で作ったkey/versionだけを削除しprefix全削除禁止 |
| LiveKit Server | 専用Projectへ接続→一意Room作成→2つの短期Token生成→参加者一覧→退出→Room終了/不存在 | Room/Token値をログに残さない。費用は参加時間/転送量上限で管理 |
| LiveKit Browser | 2ユーザー実参加、相互音声・映像・画面共有、再接続、退出・終了後の再入室拒否 | Server API成功とは別の証跡。端末権限・browser・track受信を記録。未確認時はLive機能を無効化して公開判断 |

実Providerエラーの安全な表示/requestIdを確認する。負荷・課金・障害を意図的に発生させない。MockのFault Injectionは別欄へ記録する。

## 監視・通知（未設定/未確認の作業）

| 対象 | 設定・確認する指標/場所 | 通知試験・未利用APIの代替 |
| --- | --- | --- |
| AWS Budget | 対象Account/期間/金額、Actual/Forecast通知、email/SNS購読の確認 | 専用Test通知先でsynthetic通知受信。Budgetの閾値判定とSNS配送の証拠を分ける。実支出を増やさない |
| Bedrock | Invocation/Token/latency/error/throttle、model/region dimension、アプリ安全ログ | Test log/metricで専用Alarm→通知。実モデル障害を起こさない |
| S3容量 | AWS/S3 BucketSizeBytes/NumberOfObjects、必要ならrequest errors | 日次容量と即時request metricsを区別。Test専用metric/Alarmを使用 |
| API 5xx / Provider障害 | Vercel log drain/監視先、status/requestId、既存SLO集計 | syntheticログで集計→通知。サービスへ実5xx障害を発生させない |
| LiveKit利用量 | Cloud Dashboard billing/usage。契約で使えるAnalytics APIを確認 | API不可なら日次Dashboard手動確認・担当を記録。API未実装と権限不足を区別 |
| Neon利用量 | Console usage/billing/storage/compute、契約に応じmetrics export/spending通知 | 利用可能なAPI/planを確認。APIがない指標は日次手動確認 |
| Vercel利用料 | Vercel自身のusage/billing | AWS Budgetに含めず別途確認 |

AWS BudgetはNeon/LiveKit/Vercelの利用料監視を代替しない。通知先は担当role、設定有無、購読confirmed、受信日時・試験IDだけを報告し、email/webhookの実値は記載しない。
通知API受付成功だけで「到達PASS」にしない。受信担当の実着確認が必要。自動復旧/削除/課金操作を紐付けたAlarmは試験対象から除外する。

公式参照（2026-09-22確認）: [AWS Budget SNS](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html)、[S3 metrics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/metrics-dimensions.html)、[LiveKit Analytics API](https://docs.livekit.io/deploy/admin/analytics-api/)。LiveKit Analytics APIは契約条件があり、使えない場合はDashboardで補う。

## Backup / Recovery

現在のNeon契約プラン・restore window・利用可能機能は**未確認**。公開ドキュメントはユーザーの契約証跡ではない。[Neon公式plan文書](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md)では履歴窓やsnapshot数がplanにより異なるため、管理者がConsoleで契約名・対象Project・実際の履歴窓・最古復元点・費用を確認する。

### Neon復元（BLOCKED、未実施）

1. 分離・費用を確認済みのDev/Test Projectに合成fixtureを用意し、バックアップ方式と基準時刻を記録する。
2. 合成marker Aを書込、復元可能時点を確認後marker Bを書込する。
3. Test専用の新しい復元先branch/databaseを確保し、restoreのsource/target両方を再確認する。既存branch上書きは禁止。
4. 契約とConsole/APIが提供する履歴時点/snapshotから新規Test復元先へ復元する。Production由来データを使用しない。
5. Aあり/Bなし、全テーブル、FK/UNIQUE/CHECK、Migration履歴、監査、Candidate↔Ticket、録音metadata整合を検証する。
6. 開始〜接続可能〜検証完了の各時刻と復元点を記録。対象Test Appだけに接続してCRUD/認可Smokeを実施する。
7. 証跡確保後、この試験専用branchだけを管理者がcleanupする。Productionへ切替・復元しない。

### PITR等が使えない場合の代替

- 定期`pg_dump --format=custom`→暗号化・権限限定した別保管先→新規Test DBへ`pg_restore --exit-on-error --single-transaction`。
- 資格情報は専用Secret store/保護したlibpq service設定を使用し、コマンド引数へ実接続文字列を貼らない。Test専用DB以外では実行しない。
- 定期実行・保存世代・失敗通知・暗号化鍵回復・off-site保管・容量を運用側で整える。今回は設定していない。
- 論理dumpはPITRではなく、dump以後の書込みを失う。role/owner/ACL、S3 object、Secret、インフラ設定は別途復元が必要。
- RPO≤24hは「24hごとのschedule」だけでは保証できない。最後の正常dumpの経過時間を監視し、失敗検知・再試行余裕を持たせる。
- RTO≤4hは実データ量、転送、権限復元、App切替、検証時間を含む演習が必要。

### 今回のローカル代替方式試験

`npx vitest run tests/integration/qa-recovery.test.ts --reporter=verbose`。
2つの一時PostgreSQL clusterを生成、sourceへMigration/fixture→pg_dump→新targetへpg_restore→全17テーブル/制約metadata/代表UNIQUE・FK・CHECK拒否/相互リンク/再Migrationの不変性を検証する。
TLS verify-full維持、PG設定/資格情報を継承しない。fixture dumpは0700一時ディレクトリに保存しfinallyで削除。外部URLを指定する入力機能は持たない。
結果はローカル方式の実行可能性だけを示し、Neon・S3復旧/可用性/本番RPO/RTOの保証ではない。

## 公開環境に必要な変更案（実行していない）

| 変更案 | 影響 | Rollback/対応 |
| --- | --- | --- |
| 環境別Secret scope/最小権限設定 | 誤設定時にAuth/DB/Provider停止 | 非Productionで検証後、管理者が既知の安全な設定版へ戻す。漏えいした旧鍵は再利用しない |
| 監視集計/通知先・購読設定 | 通知量・監視費用 | 新ルールだけを無効化、既存通知は維持 |
| Backup保持/定期dump/暗号化保管 | 保存費用・DB負荷 | scheduleを停止し既存正常backupは保持。復旧点を失う設定縮小は別判断 |
| 未検証AI/Recording/Live機能のflag停止 | 対象機能が利用不可 | 検証証跡と公開承認後に段階復帰。発行済みURL/Tokenは別失効措置 |

ProductionのDeploy/Migration/Secret取得・変更/データ削除は今回行わない。
