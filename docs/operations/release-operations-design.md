**AIプロジェクトマネージャー**  
**リリース・運用設計書**

Version 1.0 / MVP

対象: Next.js / Vercel / Neon PostgreSQL / Amazon Bedrock / Amazon S3 / LiveKit

# **1\. 文書概要**

本書は、AIプロジェクトマネージャーのMVPを安全かつ継続的にリリース・運用するための設計を定義する。対象はアプリケーション、データベース、AI処理、ファイルストレージ、オンライン会議、監視、障害対応、バックアップ、セキュリティ運用、コスト管理、リリース判定である。

| 項目 | 内容 |
| :---- | :---- |
| 対象システム | Next.js \+ Vercel / Neon PostgreSQL / Amazon Bedrock / S3 / LiveKit / GitHub Actions |
| 対象環境 | Local / Preview / Staging / Production |
| リリース方式 | GitHubを起点としたCI/CD。Productionはmainブランチからデプロイ。 |
| DB変更 | Drizzle Migrationをコード管理し、Production反映前にStagingで適用確認。 |
| AI変更 | Prompt / JSON Schema / Model IDをバージョン管理し、通常コードと同様にレビュー・評価。 |
| 基本原則 | 小さくリリース、ロールバック可能、監視可能、監査可能、人間承認を残す。 |

# **2\. 運用対象構成**

User Browser  
   │  
   ▼  
Vercel / Next.js  
   ├─ Web UI  
   ├─ Route Handlers / Functions  
   ├─ Auth  
   ├─ DB Access ───────────────► Neon PostgreSQL  
   ├─ AI Adapter ──────────────► Amazon Bedrock  
   ├─ Presigned URL API ───────► Amazon S3  
   └─ Meeting Token API ───────► LiveKit

GitHub ──► CI / Test / Build / Deploy

Observability  
   ├─ Vercel Logs / Metrics  
   ├─ Application Structured Logs  
   ├─ Neon Monitoring  
   ├─ AWS CloudWatch  
   └─ Alert Notification

*ブラウザからNeon、Bedrock、S3の秘密情報へ直接アクセスさせない。S3は署名付きURL、LiveKitは短期トークンを利用する。*

# **3\. 環境設計**

| 環境 | 用途 | デプロイ元 | DB | データ方針 |
| :---- | :---- | :---- | :---- | :---- |
| Local | 開発者ローカル | feature branch | Local/Dev DB | ダミー・テストデータ |
| Preview | PRレビュー | Pull Request | Preview/Dev DB | 本番データ禁止 |
| Staging | 統合・受入・リリース確認 | develop/release | Staging DB | 匿名化/テストデータ |
| Production | 本番利用 | main | Production DB | 実データ |

* Production用DATABASE\_URL、AWS資格情報、S3 Bucket、LiveKit SecretをPreviewへ流用しない。  
* Preview環境はPR単位で作成し、機能レビューとE2E確認に利用する。  
* StagingはProductionと可能な限り同じMigration、AI Prompt version、外部連携構成を利用する。  
* 本番データを開発環境へコピーしない。必要な場合は匿名化・最小化する。

# **4\. ブランチ・バージョン管理**

| ブランチ | 役割 | 直接Push |
| :---- | :---- | :---- |
| main | Productionリリース可能状態 | 禁止 |
| develop | 次回リリース候補の統合 | 原則禁止 |
| feature/\* | 機能開発 | 可 |
| fix/\* | 通常不具合修正 | 可 |
| hotfix/\* | 本番緊急修正 | 可 |

* mainへの変更はPull Request \+ CI成功 \+ Reviewを必須とする。  
* リリース単位でGit tagを作成する。例: v0.1.0。  
* Semantic Versioningを採用する。  
* Prompt変更も通常のコードReview対象とし、prompt\_versionを更新する。

# **5\. CI/CD設計**

## **5.1 Pull Request CI**

1\. Lockfileから依存関係をInstallする。

2\. Lintを実行する。

3\. TypeScript typecheckを実行する。

4\. Unit Testを実行する。

5\. DB Schema / Migrationの静的確認を行う。

6\. Buildを実行する。

7\. PreviewへDeployする。

8\. E2E Smoke TestをPreviewまたはStagingで実行する。

## **5.2 Production CD**

1\. main mergeまたはRelease tagを起点とする。

2\. 全CIを再実行する。

3\. Production DB Migrationの実行可否を確認する。

4\. 後方互換Migrationを先に適用する。

5\. Vercel ProductionへDeployする。

6\. Smoke Testを実行する。

7\. 監視指標とError Logを確認する。

8\. Release記録を残す。

# **6\. GitHub Actions基本構成**

jobs:  
  validate:  
    \- npm ci  
    \- npm run lint  
    \- npm run typecheck  
    \- npm run test  
    \- npm run build

  migration-check:  
    \- schema consistency check  
    \- migration file presence check

  e2e:  
    \- deploy preview/staging  
    \- playwright smoke test

  release:  
    \- production migration  
    \- vercel production deploy  
    \- post-deploy smoke test

*Secretはworkflowへ直接記載せず、GitHub/Vercel/AWSのSecret管理機能を使用する。*

# **7\. リリース手順**

1\. 対象Ticketと仕様変更範囲を確定する。

2\. Stagingへ対象Commitを反映する。

3\. DB MigrationをStagingへ適用する。

4\. P0テストおよび対象機能の回帰テストを実行する。

5\. AI変更がある場合は固定Fixtureで旧版との比較評価を行う。

6\. Release Noteを作成する。

7\. Production Backup/復旧可能性を確認する。

8\. Production DB Migrationを実行する。

9\. ProductionへアプリをDeployする。

10\. Smoke Testを実行する。

11\. エラー率、レスポンス時間、DB接続、AI失敗率を確認する。

12\. Release tagとRelease結果を記録する。

# **8\. DB Migration運用**

| 分類 | 方針 |
| :---- | :---- |
| 基本 | Drizzle MigrationをGit管理し、手動SQL変更を原則禁止。 |
| 追加カラム | まずNULL許可/Default付与で追加し、必要なら後続リリースで制約強化。 |
| 削除カラム | 互換期間を置き、参照停止後に削除。 |
| Rename | 新カラム追加→データ移行→アプリ切替→旧カラム削除。 |
| 大量更新 | Migrationへ巨大UPDATEを含めず、別Job/Scriptで段階処理。 |
| Production | 実行前にBackup、ロック影響、Rollback/Forward Fixを確認。 |

* Application DeployとDB MigrationはBackward Compatibleにする。  
* DBを戻せないMigrationでは、アプリだけ戻しても整合する状態を維持する。  
* Migration成功を確認してから次工程へ進む。

# **9\. ロールバック設計**

| 障害パターン | 第一選択 | 補足 |
| :---- | :---- | :---- |
| UI/API不具合 | 直前Vercel DeploymentへRollback | DB互換性が前提 |
| AI Prompt不具合 | prompt\_versionを前版へ戻す | model変更も同様 |
| DB Migration不具合 | Forward Fixを原則 | 危険なDown Migrationを避ける |
| S3設定不具合 | 環境変数/権限設定を前版へ戻す | 既存Objectは削除しない |
| LiveKit不具合 | 会議機能をFeature Flagで停止 | Project/Ticket機能は継続 |

Production障害時は完全復旧より先に影響範囲を限定する。AI生成、録音、オンライン会議などを個別停止できる設計を推奨する。

# **10\. Feature Flag運用**

| Flag例 | 用途 | 障害時 |
| :---- | :---- | :---- |
| AI\_MINUTES\_ENABLED | AI議事録生成 | OFFで手動議事録のみ継続 |
| AI\_TICKET\_ENABLED | AIチケット候補生成 | OFFで手動Ticket継続 |
| MEETING\_ENABLED | オンライン会議 | OFFで会議履歴のみ利用 |
| RECORDING\_ENABLED | 録音 | OFFで手動入力へ縮退 |

*MVPでは環境変数から開始可能。ユーザー単位・段階リリースが必要になった時点で専用Feature Flagを検討する。*

# **11\. 監視設計**

| 監視対象 | 主要指標 | 検知例 |
| :---- | :---- | :---- |
| Vercel | 5xx率、Function Error、Latency | 5xx急増、Timeout |
| Application | error\_code、request\_id、処理時間 | AI\_SCHEMA\_INVALID増加 |
| Neon | 接続数、Storage、Query latency | 接続枯渇、長時間Query |
| Bedrock | Invocation Error、Throttle、Latency | 429/5xx増加、Timeout |
| S3 | 4xx/5xx、Upload失敗 | 署名付きURLエラー |
| LiveKit | Room接続失敗、Participant異常 | 入室不可、Token失敗 |
| Business | AI成功率、Ticket登録成功率 | AI失敗増加、二重登録疑い |

# **12\. SLI / SLO設計**

| 項目 | SLI | MVP目標 |
| :---- | :---- | :---- |
| Web/API可用性 | 正常レスポンス / 全リクエスト | 99.5%以上/月 |
| 主要API性能 | p95 Response Time | 通常CRUD 2秒以内 |
| AI議事録成功率 | 正常保存 / 生成要求 | 95%以上 |
| AI Schema初回成功 | 初回Schema正常 / AI呼出 | 90%以上を改善目標 |
| Ticket正式登録 | 正常登録 / 承認要求 | 99.9%以上 |
| Evidence整合 | 有効根拠候補 / 全候補 | 99%以上 |

*AI処理は通常CRUDと同一Latency SLOを設定せず、成功率と再実行可能性を重視する。*

# **13\. アラート設計**

| Severity | 条件例 | 通知 | 対応 |
| :---- | :---- | :---- | :---- |
| Critical | ログイン不可、全API障害、DB接続不能、データ破損疑い | 即時 | 最優先で影響限定・復旧 |
| High | 主要API 5xx継続、Ticket登録不能、AI全失敗 | 即時 | 当日対応 |
| Medium | AI失敗率上昇、一部会議機能障害 | 営業時間 | 原因調査 |
| Low | 単発エラー、コスト予兆、非主要警告 | 日次 | 計画対応 |

* 同一エラーの大量通知を防ぐため集約・抑制する。  
* Alertには環境、request\_id、対象機能、発生時刻、エラーコードを含める。  
* 会議本文や個人情報を通知本文へ載せない。

# **14\. ログ設計**

| 項目 | 記録内容 |
| :---- | :---- |
| request\_id | API呼出単位の一意ID |
| user\_id | 必要な場合のみ内部ID |
| organization\_id / project\_id | Tenant追跡用 |
| route / method | 対象API |
| status / error\_code | 結果 |
| duration\_ms | 処理時間 |
| ai\_model / prompt\_version | AI呼出時 |
| meeting\_id / ticket\_id | 対象Resource |

* Transcript全文、議事録全文、認証Token、AWS Secret、DATABASE\_URLをLogへ出力しない。  
* Error Logと監査ログを区別する。  
* ProductionではJSON Structured Logを基本とする。

# **15\. 障害対応フロー**

1\. 障害を検知しSeverityを判定する。

2\. Organization/Project/全ユーザーのどこまで影響しているか特定する。

3\. Feature Flag、Rollback等で影響を限定する。

4\. request\_id、Vercel Log、DB、CloudWatch等から原因を調査する。

5\. 復旧処置を実施する。

6\. 主要Smoke Testを実施する。

7\. 利用者影響がある場合は告知・更新を行う。

8\. 原因・対応・再発防止をPostmortemへ記録する。

# **16\. 障害Runbook**

| 事象 | 確認ポイント | 一次対応 |
| :---- | :---- | :---- |
| ログインできない | Auth設定、Cookie、Callback URL、Secret | Rollback、Auth設定確認 |
| DB接続不能 | Neon status、接続数、DATABASE\_URL | 接続復旧、Connection確認 |
| API 5xx急増 | 直前Deploy、共通Error、Dependency | Rollback/Feature Flag |
| AI議事録失敗 | Bedrock Error、Throttle、Schema error | AI停止または再実行 |
| AI Ticket誤生成増加 | prompt/model version、Fixture結果 | Prompt前版へ戻す |
| S3 Upload失敗 | Bucket/CORS/IAM/Presigned期限 | 録音停止、設定確認 |
| LiveKit入室不可 | Token、URL、Room status | 会議機能停止 |
| Ticket二重登録 | candidate.status、transaction、idempotency | 登録停止、データ確認 |

# **17\. バックアップ・復旧設計**

| 対象 | バックアップ方針 | 復旧方法 | MVP目標 |
| :---- | :---- | :---- | :---- |
| Neon PostgreSQL | Provider機能 \+ 定期論理Backup検討 | PITR/Backup Restore | RPO 24h以内 / RTO 4h以内 |
| S3 Recording | Versioning/保持方針に応じ設定 | Version/Backupから復元 | 保持ポリシー優先 |
| Application | GitHub \+ Vercel履歴 | Tag/DeploymentへRollback | RTO 1h以内 |
| Prompt/Schema | Git version管理 | 前versionへ戻す | 即時 |
| Secrets | Secret Manager/Vercel設定 | 再発行・再設定 | 漏洩時即Rotate |

*RPO/RTOはMVP初期値。契約SLA・顧客要件確定後に再定義する。*

# **18\. データ保持・削除運用**

| データ | MVP方針 |
| :---- | :---- |
| Tickets/Projects | 安易な物理削除を避ける。 |
| Meeting Transcript | 会議履歴として保持し、将来保持期間設定を追加。 |
| Meeting Recording | 容量・プライバシー影響が大きいため保持期間を明示。 |
| AI Raw Output | デバッグ上必要最小限。長期保持しない。 |
| Audit Log | 操作追跡に必要な期間保持。 |

* 削除APIでは関連DBデータとS3 Objectの扱いを明確化する。  
* 録音・Transcript削除要求へ対応できるResource ID管理を維持する。  
* 要件未確定の段階で無期限保持を既定にしない。

# **19\. セキュリティ運用**

| 運用項目 | 方針 |
| :---- | :---- |
| Secret管理 | GitへCommit禁止。Vercel/GitHub/AWS Secret機能を使用。 |
| Secret Rotate | 漏洩疑い・担当変更・定期運用でRotate可能にする。 |
| IAM | Bedrock/S3へ最小権限。Productionと非Productionを分離。 |
| DB権限 | アプリ用Credentialと管理用Credentialを分離。 |
| 管理者Access | 最小人数。離任時は即無効化。 |
| Dependency | 脆弱性検知を有効化しCritical/Highを優先対応。 |

* Production SecretをIssue本文、ログ、スクリーンショットへ貼らない。  
* 侵害疑い時はSecret Rotate、Session無効化、アクセスログ確認を優先する。  
* Prompt Injectionは継続的なセキュリティテスト対象とする。

# **20\. AIモデル・Promptリリース運用**

1\. Prompt/System instructionまたはJSON Schema変更をPRでReviewする。

2\. 固定Fixtureで現行Versionと候補Versionを比較する。

3\. Schema Success、Ticket Precision、Reject Rate、Edit Rateを確認する。

4\. Stagingで実会議相当データを確認する。

5\. prompt\_version/schema\_version/model\_idを更新する。

6\. Productionへ反映する。

7\. リリース後にAI失敗率・Reject Rateを監視する。

8\. 悪化時はPromptまたはModelを前Versionへ戻す。

*Model変更もアプリ仕様変更としてテスト・Reviewする。*

# **21\. コスト運用**

| 対象 | 主なコスト要因 | 対策 |
| :---- | :---- | :---- |
| Vercel | Function実行、帯域 | Polling削減、Cache活用 |
| Neon | Compute/Storage | Index最適化、不要保持見直し |
| Bedrock | Input/Output token | Chunk、不要Context削減、モデル選択 |
| S3 | Storage/転送 | 録音保持期間、Lifecycle |
| LiveKit | 接続時間/転送 | 会議終了処理、録画方針 |

* 月次Budgetを設定し、想定比の急増をAlert対象にする。  
* Bedrockはmeeting\_id単位で概算利用量を追跡可能にする。  
* AI再生成を無制限に許可せずRate Limitで異常利用を抑制する。

# **22\. Rate Limit・濫用対策**

| API群 | MVP方針 |
| :---- | :---- |
| 通常CRUD | IP/User単位の基本Rate Limit |
| AI生成 | User/Organization単位により厳しい制限 |
| Upload URL発行 | 短時間の発行回数制限 |
| Login/Auth | 認証基盤のBrute-force対策を利用 |

AI APIはコストと外部依存があるため通常CRUDより厳しい制限を設ける。再生成ボタン連打等による重複処理もidempotencyまたはProcessing状態で防止する。

# **23\. 運用作業一覧**

| 頻度 | 運用作業 |
| :---- | :---- |
| 日次 | Critical/High Alert、5xx、AI失敗、Backup異常、コスト急増確認 |
| 週次 | Error傾向、遅いAPI、AI Reject/Edit傾向、外部障害履歴確認 |
| 月次 | Dependency更新、Access棚卸し、DB/S3容量、コストレビュー |
| リリース毎 | Release checklist、Migration、Smoke、監視、Release Note |
| 障害後 | Postmortem、再発防止Ticket、テストケース追加 |

# **24\. リリースチェックリスト**

| No. | 確認項目 | 必須 |
| :---- | :---- | :---- |
| R-01 | 対象Ticket/仕様変更が確定 | ○ |
| R-02 | PR Review完了 | ○ |
| R-03 | Lint/typecheck/Unit/Build成功 | ○ |
| R-04 | P0 Integration/E2E成功 | ○ |
| R-05 | Staging確認完了 | ○ |
| R-06 | DB Migration確認済み | DB変更時 |
| R-07 | AI Fixture比較済み | AI変更時 |
| R-08 | Backup/Restore経路確認 | ○ |
| R-09 | Rollback方針確認 | ○ |
| R-10 | Production Secret差分確認 | 設定変更時 |
| R-11 | Release Note作成 | ○ |
| R-12 | Deploy後Smoke成功 | ○ |
| R-13 | 監視指標正常 | ○ |
| R-14 | Git tag / Release記録作成 | ○ |

# **25\. Production Smoke Test**

1\. ログインできる。

2\. Organization/Project一覧が取得できる。

3\. Projectを開ける。

4\. Ticket一覧が取得できる。

5\. テスト用Ticketを作成・更新できる。

6\. Meeting一覧を開ける。

7\. AI有効時、テスト入力でAI APIが正常応答する。

8\. Candidate承認からTicket登録が1回だけ成功する。

9\. 権限のないProjectへアクセスできない。

10\. 重大な5xxが監視ログへ発生していない。

# **26\. Postmortemテンプレート**

| 項目 | 記録内容 |
| :---- | :---- |
| 概要 | 何が発生したか |
| 影響 | 対象ユーザー/Organization/機能/時間 |
| Timeline | 検知から復旧まで |
| Root Cause | 直接原因と背景要因 |
| Detection | どの監視で検知したか/できなかったか |
| Response | 実施した対応 |
| Recovery | 復旧方法 |
| Prevention | 再発防止策 |
| Action Items | 担当者・期限付き改善Ticket |

*Postmortemは個人責任追及ではなく、システム・プロセス改善を目的とする。*

# **27\. 災害復旧・外部サービス障害**

| 障害 | 縮退運転 |
| :---- | :---- |
| Bedrock障害 | AI生成停止。手動議事録/Ticketを継続 |
| LiveKit障害 | オンライン会議停止。Meeting記録を継続 |
| S3障害 | Recording Upload停止。会議情報を継続 |
| Neon障害 | 書き込み停止。復旧までMaintenance表示 |
| Vercel障害 | Provider復旧待ち。重大時は代替Hosting手順を将来検討 |

サービス全体を1つの外部依存障害で停止させない。AI・会議・録音は可能な範囲で独立して縮退可能とする。

# **28\. 運用権限・役割**

| 役割 | 責務 |
| :---- | :---- |
| Developer | 実装、PR、テスト、ログ調査 |
| Release Manager | Release判定、チェックリスト、Production反映 |
| System Admin | Secret、AWS/IAM、DB、Provider設定管理 |
| Support/Operator | 問い合わせ、一次切り分け、Incident起票 |

*MVP初期は同一人物が複数役割を兼務してよいが、責務として区別する。*

# **29\. Codex実装への引継ぎ**

ops/  
├─ release-checklist.md  
├─ incident-runbook.md  
├─ postmortem-template.md  
├─ smoke-test.md  
└─ ai-release-checklist.md

.github/  
└─ workflows/  
   ├─ ci.yml  
   └─ release.yml

scripts/  
├─ smoke-test.ts  
├─ migration-check.ts  
└─ health-check.ts

* CI/CD定義はコード化し、手順書とPipelineを乖離させない。  
* Smoke Testは可能な範囲で自動化する。  
* Production向け危険操作をCodexに自動実行させず、明示された環境でのみ実行する。  
* Migration/Release Scriptはdry-run等の安全確認手段を検討する。

# **30\. リリース・運用のDefinition of Done**

* Local / Preview / Staging / Productionの環境分離ができている。  
* Production SecretがGit管理されていない。  
* mainへのPRでCIが必須となっている。  
* DB Migrationがコード管理されている。  
* Production Deploy後のSmoke Test手順が存在する。  
* Vercel / Neon / Bedrock / S3の主要Errorを追跡できる。  
* AI Prompt/Schema/ModelのVersionを追跡できる。  
* RollbackまたはFeature Flagによる影響限定が可能である。  
* Backup/Restore方針が定義されている。  
* Critical障害のRunbookが定義されている。  
* Release checklistとIncident/Postmortemテンプレートが存在する。

# **31\. 設計上の重要判断**

本サービスは通常のプロジェクト管理機能に加え、AI、録音、オンライン会議という外部依存と非決定的処理を含む。そのため、すべてを常時正常に動かすことだけを運用目標とせず、外部サービス障害やAI品質劣化が起きてもProject/Ticketという中核業務を継続できる縮退設計を採用する。また、DB MigrationとAI Prompt変更を同じ『リリース対象』として扱い、Review、Staging検証、監視、Rollback可能性を必須とする。