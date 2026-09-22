# Phase 12 Release gate / Runbook

この文書は手順と確認待ち項目であり、Production操作を実行した記録ではない。初回判定はdocs/testing/phase-12-report.md、最新再検証はdocs/testing/phase-12-revalidation-report.md参照。

## 公開前に人間が確認する項目

- [ ] Release責任者が最終QA結果・差分・P0/P1・無効化機能を承認する。
- [ ] GitHub CIを実行し、Required Checksをbranch protectionで必須化する（リポジトリ設定未変更）。
- [ ] Vercel Preview/Staging/ProductionのDB、AWS、LiveKit、Authを別資格情報に分離する。
- [ ] Google OAuthの許可Origin/callbackで非Productionの実ログインを確認する。
- [ ] Neonのruntime最小権限とMigration専用credential、TLS、接続数を確認する。
- [ ] 全Migration SQLと既存データ適合性・DDL lockをStagingで検証する。Production適用は別途承認。
- [ ] Bedrockモデル利用権・IAM・入力データ方針・実モデル品質/費用を非Productionで確認する。
- [ ] S3 private/IAM/CORS/暗号化/期限/保持・削除を非Productionで確認する。
- [ ] LiveKitの2人接続、Mic/Camera/Share、再接続、権限変更・終了後の発行済みJWTを実SFUで確認する。それまではLIVE_MEETING_ENABLED=falseを公開条件とする。
- [ ] security:readinessを対象設定でオフライン実行し、禁止NEXT_PUBLIC設定がないことを確認する。成功だけで接続性/権限が保証されるわけではない。
- [ ] ログの保管先/閲覧権限/保持期限/通知先/当番、Backup契約と復旧演習を記録する。

## Observability / SLOとの対応

既存運用設計の可用性99.5%/月、CRUD p95 2秒、AI保存成功95%、登録99.9%は目標。ローカルSmokeから達成済みとは判定しない。
APIログのstatus/result/durationMs/requestIdで5xx/429/latencyを集計する。AIログのresult/durationMs/inputBytes/outputBytes/transportRetryCount/schemaRepairCountで失敗/遅延/retryを集計する。recording/live_meetingログと失敗Auditをresource単位で追跡する。
DB障害は共通SERVICE_UNAVAILABLE/INTERNAL_ERROR等、ProviderはAI_*/S3_*/LIVEKIT_*。ログに本文・Token・署名URLを含めない。監査action/requestIdで操作との相関を確認する。
本番通知ルール・閾値・通知経路の疎通、ログ欠落検知は未設定/未検証。実環境のSLO計測とAlert発報試験が必要。

## Incident Runbook

| 検知 | Triage | 影響限定 | Recovery / 確認 |
| --- | --- | --- | --- |
| AI失敗/latency | requestId、model/prompt、retry、Provider status | AI_ENABLED=false | 非Productionで疎通→Human Review→承認して再有効化 |
| S3失敗 | IAM/CORS/期限/HEAD、DB状態 | RECORDING_ENABLED=false | 未完了録音とtombstoneを照合、無断でobject削除しない |
| LiveKit失敗 | URL/Token grant/Room/end intent | LIVE_MEETING_ENABLED=false | cleanup end/leave、実SFUで復旧検証。既存JWT失効を別確認 |
| Auth障害 | cookie/callback/設定/Provider | 新規ログイン影響を案内、直前Appへrollback検討 | 実Google login/logout、Sessionを検証 |
| DB障害 | TLS/接続数/Neon status/直前Migration | 書込再試行を抑制、サービス障害案内 | 復旧後制約/整合性/登録冪等性を確認 |
| 高5xx | deploy時刻/共通requestId/依存障害 | App rollback/対象flag停止 | CRUD・review・登録・越境拒否Smoke |
| 高429 | actor/対象機能/正常トラフィックか濫用か | user/project予算を評価 | 無条件に制限解除せず、Rate Limitを再検証 |
| Migration失敗 | journal/transaction/lock/適用SQL | 後続deploy停止 | 前版Appとの互換確認、forward fixまたは承認済restore |

各事象でDetection→Triage→Disable/Rollback→Recovery→Smoke→Postmortemを記録する。外部への通知送信やProductionの設定変更は別途運用権限で行う。

## Backup / Recovery / Rollback

- Neon PITR/Backupの保持窓・復旧可能時刻は契約/実設定に依存。RPO≤24h/RTO≤4hの暫定目標は未実証。
- 非Production branch/restore先へ復元演習し、FK/監査/候補とTicketの相互リンクを照合、所要時間と最新復元点を記録する。Production RestoreはこのPhaseでは行わない。
- S3 Versioning/Backup/保持方針も実設定確認が必要。録音のDB復旧点とobject復旧点のずれを照合する。
- Appは承認済み前Deployment/Tagへ戻す。DBに追加された列/tableを直ちにDROPするdown migrationは作らない。互換性を確認しforward fixを優先、破壊的問題は承認済backup restore。
- AI/Recording/LiveKit flagで新規操作を停止できるが、発行済みURL/Token、接続中メディアの即時失効を保証しない。
- Secret漏えい時はアクセス遮断→証跡保全→Auth Secret/Provider鍵のローテーション→Session失効の実効確認→影響評価。JWT複製やLiveKit更新Tokenの制約を無視しない。実値をチケット・ログへ貼らない。

## 2026-09-22 再検証台帳（STEP 1 / STEP 9）

分類は初回棚卸し時点の不足種別。PASSは明記した試験範囲のみ。BLOCKEDは前提不足で試験未実施、FAILは実行した検査不合格、NOT RUNは対象外/禁止。既存checkboxは未達の公開条件なのでチェックしない。

台帳の判定日時: 2026-09-22 JST（正確なUTC実行時刻はevidence JSON）。手順の詳細は[再検証Runbook](phase-12-revalidation-runbook.md)、結果は[再検証報告](../docs/testing/phase-12-revalidation-report.md)。

| ID | 確認事項 | 分類 | 状態 | 現状・結果 | 必要作業・残課題 | 実施環境 | 完了条件 | 実施コマンド・試験方法・証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | Release承認 | 人間による操作が必要 | BLOCKED | 前回NOT READY、公開承認なし | 責任者が残リスク/無効化機能を承認 | 管理プロセス | 全blocker証跡と承認記録 | 前回報告/今回再検証報告 |
| R02 | GitHub CI/Required Checks | 実環境未確認 | BLOCKED | CI定義あり、remote設定未取得 | 安全なPRでCI実行、branch保護を確認 | GitHub | CI URL/commitと必須check設定 |  .github/workflows/ci.ymlレビュー |
| R03 | Vercel/Neon/AWS/LiveKit/Auth分離 | 実環境未確認 | BLOCKED | Vercel linkなし、実envなし、AWS store用途不明 | 環境ID/scope/IAM/ACL証跡を提供 | Dev/Test/Preview | Production権限なしを非機密証跡で確認 | isolation JSON/Runbook環境表 |
| R04 | Google OAuth | 外部サービスの認証情報不足 | BLOCKED | 専用Client/Secret/Auth URL/DBなし | 専用clientと2テストユーザー、callback設定 | Dev/Test | login/callback/session/logout/越境拒否 | shell/file存在検査、Auth Mock回帰は別記 |
| R05 | Neon接続/最小権限/TLS | 外部サービスの認証情報不足 | BLOCKED | Project/Branch/安全な資格情報未特定 | runtime/migration role、接続/SELECT 1/CRUD確認 | Dev/Test | 安全な接続/CRUD/role確認 | 設定存在検査、ローカルDBは代替試験 |
| R06 | Staging Migration/lock | 実環境未確認 | BLOCKED | SQL/FreshDB検証あり、実Stagingなし | 非Production既存相当データで適合/lock検証 | Staging | journal/schema一致とlock評価 | drizzle/migrations、Test回帰 |
| R07 | Bedrock実モデル/費用 | 外部サービスの認証情報不足 | BLOCKED | model/region/専用role/費用上限不明 | 権限/上限確認後、合成入力最小呼出 | Dev/Test | 実Converse/JSON Schema/根拠検証 | 環境検査、Mock回帰は別記 |
| R08 | S3 private/CRUD/CORS | 外部サービスの認証情報不足 | BLOCKED | bucket/role分離・費用未確認 | 小object PUT/HEAD/GET/DELETE/匿名拒否 | Dev/Test | 実object結果とIAM/private証跡 | infra/awsはtemplate、実設定証拠なし |
| R09 | LiveKit Server | 外部サービスの認証情報不足 | BLOCKED | project/鍵所属/上限不明 | 専用Room/Token/2参加者/退出/終了 | Dev/Test | Server API結果、Room不存在 | Mock回帰は別記 |
| R10 | LiveKit実メディア/終了後JWT | 人間による操作が必要 | BLOCKED | 実SFU/2端末未検証 | 音声/映像/Share/reconnect/終了後再入室確認 | Dev/Test実ブラウザー | Serverと別のメディア証跡 | Runbookに手順、Live flag変更なし |
| R11 | 環境設定readiness | 設定不足 | FAIL | 必須Auth/DB/flag未設定 | Dev/Test専用値を安全なstoreに設定 | Local/Dev/Test | offline設定検査成功＋別途実接続 | npm run security:readiness、exit 1 |
| R12 | AWS Budget通知 | 実環境未確認 | BLOCKED | 対象Account/予算/購読/通知先不明 | 専用Account設定とsynthetic通知到達確認 | Dev/Test管理面 | 閾値/購読と受信証跡 | Runbook監視表、実AWS未呼出 |
| R13 | Bedrock利用量/障害通知 | 実環境未確認 | BLOCKED | ログ実装あり、CloudWatch設定未確認 | metric/log集計とTest通知 | Dev/Test | 設定＋通知受信時刻 | logging実装/Runbook |
| R14 | S3容量/障害通知 | 実環境未確認 | BLOCKED | 日次容量/Alarm/通知先未確認 | 対象bucketのmetric/Alarm/購読確認 | Dev/Test | 設定＋Test通知受信 | Runbook監視表 |
| R15 | API 5xx/Provider障害通知 | 実環境未確認 | BLOCKED | 安全ログあり、drain/集計/通知不明 | synthetic eventで集計から到達まで確認 | Dev/Test | requestId/試験ID/受信時刻 | logger/security回帰は配送証拠ではない |
| R16 | LiveKit利用量 | 実環境未確認 | BLOCKED | 契約/usage/通知先不明 | API利用可否確認、不可指標は手動担当設定 | Dev/Test管理面 | usage/費用/通知または手動確認記録 | 公式Analytics資料/Runbook |
| R17 | Neon利用量/契約/履歴窓 | 実環境未確認 | BLOCKED | ユーザーのplan/restore window不明 | Consoleでplan/usage/復元可能時点を確認 | Neon管理面 | 契約名と機能/窓の非機密証跡 | 公開plan資料は契約の証明ではない |
| R18 | Neon隔離復元/RPO/RTO | 人間による操作が必要 | BLOCKED | 安全なsource/target未確認 | 合成データから新Test復元先へ演習 | Test Neon | 整合性/復元時刻/所要時間 | Runbook復元手順、実Neon未接続 |
| R19 | 論理dump/restore代替方式 | テスト不足 | PASS | 新規ローカル回帰試験を追加 | pg_dump→新規DB→pg_restore/照合を実施済み | Local一時PostgreSQL | 17テーブル/履歴/リンク/制約一致 | QA-DR-01、Neon PITR/RPO/RTOは対象外 |
| R20 | ローカル回帰/Secret/Build | テスト不足 | PASS | 必須ローカル回帰成功 | 実環境検証は別途必要 | Local/Mock | 全必須チェック成功、skipなし | 再検証report/command evidence |
| R21 | Production操作 | 人間による操作が必要 | NOT RUN | 今回禁止 | 変更案/影響/Rollbackのみ文書化 | Production | この作業では実行しない | Runbook変更案、Production無変更 |

共通の設定・分離調査: `npx tsx scripts/check-environment-isolation.ts`、Git status/log、AGENTS/設計・コードレビュー。Production SecretもAWS credentialファイル内容も取得していない。

- [分離調査の証跡](../docs/testing/evidence/phase-12-isolation-2026-09-22.json): 2026-09-22 01:13:59 JST、exit 2/BLOCKED。
- `security:readiness`: 同日01:14頃JST、必須9項目不足でexit 1/FAIL。実環境設定なしを検出した結果であり、通すためのダミー設定追加はしない。
- R04–R10、R12–R18: 同日調査時点でBLOCKED判定、実接続/通知試験日時は「未実施」。環境分離・費用の確認不能が理由。
- R19/R20の正確な実施時刻・コマンド・件数は[実行証跡](../docs/testing/evidence/phase-12-revalidation-commands.json)を参照。

## Phase Infra-Verify 初回調査（2026-09-22）

Cloud Changes: **NOT EXECUTED** / Release: **NOT READY**。R01–R21の判定は変更しない。今回の成果物作成だけでBLOCKEDをPASSへ更新しない。

- [非本番環境台帳](nonprod-environment-inventory.md): 全項目を記録。ローカル不足はMISSING、remote実在/契約はUNKNOWN、Production分離はBLOCKED。
- [構築・試験計画](nonprod-provisioning-plan.md): G0〜G4、P01〜P08、承認前後の境界・権限・影響・cleanup。
- [管理者作業](nonprod-admin-actions.md): R01〜R21の原因、必要作業、自動化可否、費用、完了条件、証跡と次回プロンプト。
- [月3,000円見積](nonprod-cost-estimate.md): UNKNOWN。契約を無料と推定せず、有料プラン変更なし。
- 設定案: infra/nonprod/parameters.example.json / vercel-oidc-trust.team.example.json。未適用、Secretなし。
- security:readiness再実行はexit 1、必須9項目不足（0/9）。isolationはexit 2/BLOCKED。
- 16/17テーブルはpublic 16＋drizzle migration journal 1の集計差。Schema/Migration差分なし。既存成功済みテストを変更していない。
- 専用Infrastructure Dev/Test Phase・Budget Guard仕様・CDKコードはRepository検索で見つからずMISSING。一般設計を完成したCDK仕様と扱わない。OIDC adapter/月次Usage Guardの不足を次のローカル実装単位へ記載。
- 初回禁止のBackup/Restoreも再実行していない。前回のローカル復元PASSを保持し、Neon復元PASSにはしない。

## Phase Infra-Verify ② ローカルIaC（2026-09-22）

- Infrastructure Code: READY（本Phaseのローカル実装範囲）。Environment BLOCKED、Cloud Apply NOT EXECUTED、Release NOT READY。
- R03/R05: Account/Region/Stack/DB接続先/承認Guardを実装・拒否テスト成功。ただし実権限分離の証明は未了、BLOCKED維持。
- R07–R09: S3/IAM/OIDC/Bedrock IaC・短期credential adapter追加。実Provider試験なし、BLOCKED維持。
- R12–R17: AWS Budget、S3容量/Bedrock tokensのAlarm、Budget GuardとNeon/LiveKit manual/API interface追加。契約/実usage/通知到達未確認、BLOCKED維持。
- R19: 既存隔離ローカルdump/restoreをIntegration内で再実行して成功。Neon復元は未実施。
- R20: lint/typecheck/Unit 162/Integration 353/Security 209/E2E 50/build成功。Infrastructure 51件成功、CDK build/synth成功。Secret/Client検査成功、audit 0。
- budget:checkはUnknown/exit 2、infra:guard --applyは承認なしでexit 2。これらを実環境PASSとは扱わない。
- 実施時刻/コマンド: [今回の証跡](../docs/testing/evidence/infra-verify-02-commands.json)。設定値の実値やSecretは記載しない。
- 既存DB Migration変更なし。Cloud bootstrap/deploy/destroy/diff/lookupなし。

## Phase Infra-Verify ③ Preflight（2026-09-22）

- [Cloud Apply承認準備資料](nonprod-apply-approval.md)を作成。承認PENDING、Cloud Changes NOT EXECUTED、Release NOT READY。
- 実用途を確認したAWS Profile/Account/Regionと実設定が不足。2026-09-22 05:42:45 UTCの`npm run infra:guard`はexit 2/BLOCKED、`npm run budget:check`はexit 2/Unknown。
- STS/各Provider照会/実設定synth/CDK diffはNOT RUN。実在・分離・契約は未確認のまま。設定hash/diff hashは未生成、承認期限も未設定。
- R01–R21の判定を変更しない。Phase②のローカル成功証跡を保持し、実環境成功に読み替えない。今回アプリ/DB Migration変更なし。
