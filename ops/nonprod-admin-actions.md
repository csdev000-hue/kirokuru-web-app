# 非Production 管理者作業・承認待ち事項

2026-09-22。Secret値を会話/Git/ログに貼らない。初回実行ではCloud Applyを承認済みと扱わない。

## 最初に必要な管理者作業

1. **資料**: Infrastructure Dev/Test Phase・Budget Guard仕様の既存配置を示す。Repositoryにない場合は、provisioning-planの不足要件をレビューして次のローカル実装範囲を確定する。
2. **環境・契約の確認**: 各Consoleで非機密ID、plan、無料枠/残usage、Dev/Test用途、Productionとの権限境界を確認しinventoryへ追記する。Production Secretは取得しない。
3. **AWS**: 専用Account/region/profileを指定、SSO等で非本番最小権限を設定する。必要権限は計画P01/P06に限定。既存default profileを自動流用しない。
4. **Vercel/Google/Neon/LiveKit**: 各非本番管理者が計画P02–P05の対象/権限を確定する。Googleの2テストユーザーと同意画面、Neon runtime/migration role、Vercel Team/Project issuer modeも必要。作成は後続Apply承認後。
5. **費用と通知**: cost-estimateのUNKNOWNを解消し、月3,000円内の根拠・試験単位上限・停止担当・通知先を確定。受信者はsynthetic通知に合意し、実着時刻を記録する。
6. **承認**: G1のコード/合成差分と確定費用をレビュー後、P番号・対象ID・実行コマンド・上限・期限・cleanupを明示してG2承認。未知対象や有料プラン変更は承認範囲にしない。

## R01–R21の直接原因と解除条件

現状はrelease-checklistの最終結果。テスト不足の分類が残っていてもR19/R20はPASS済みで、BLOCKEDとは扱わない。

| ID | 確認事項/現状 | BLOCKED等の直接原因 | 必要設定・リソース/作業 | 自動実施 | 管理者作業 | 想定コスト | 完了条件 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | Release承認 / BLOCKED | 前回NOT READY、公開承認なし | 責任者が残リスク/無効化機能を承認 | 不可（公開判断） | Release責任者の明示判断 | クラウド追加費用なし | 全blocker証跡と承認記録 | 前回報告/今回再検証報告 |
| R02 | GitHub CI/Required Checks / BLOCKED | CI定義あり、remote設定未取得 | 安全なPRでCI実行、branch保護を確認 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | CI URL/commitと必須check設定 | .github/workflows/ci.ymlレビュー |
| R03 | Vercel/Neon/AWS/LiveKit/Auth分離 / BLOCKED | Vercel linkなし、実envなし、AWS store用途不明 | 環境ID/scope/IAM/ACL証跡を提供 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | Production権限なしを非機密証跡で確認 | isolation JSON/Runbook環境表 |
| R04 | Google OAuth / BLOCKED | 専用Client/Secret/Auth URL/DBなし | 専用clientと2テストユーザー、callback設定 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | login/callback/session/logout/越境拒否 | shell/file存在検査、Auth Mock回帰は別記 |
| R05 | Neon接続/最小権限/TLS / BLOCKED | Project/Branch/安全な資格情報未特定 | runtime/migration role、接続/SELECT 1/CRUD確認 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 安全な接続/CRUD/role確認 | 設定存在検査、ローカルDBは代替試験 |
| R06 | Staging Migration/lock / BLOCKED | SQL/FreshDB検証あり、実Stagingなし | 非Production既存相当データで適合/lock検証 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | journal/schema一致とlock評価 | drizzle/migrations、Test回帰 |
| R07 | Bedrock実モデル/費用 / BLOCKED | model/region/専用role/費用上限不明 | 権限/上限確認後、合成入力最小呼出 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 実Converse/JSON Schema/根拠検証 | 環境検査、Mock回帰は別記 |
| R08 | S3 private/CRUD/CORS / BLOCKED | bucket/role分離・費用未確認 | 小object PUT/HEAD/GET/DELETE/匿名拒否 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 実object結果とIAM/private証跡 | infra/awsはtemplate、実設定証拠なし |
| R09 | LiveKit Server / BLOCKED | project/鍵所属/上限不明 | 専用Room/Token/2参加者/退出/終了 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | Server API結果、Room不存在 | Mock回帰は別記 |
| R10 | LiveKit実メディア/終了後JWT / BLOCKED | 実SFU/2端末未検証 | 音声/映像/Share/reconnect/終了後再入室確認 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | Serverと別のメディア証跡 | Runbookに手順、Live flag変更なし |
| R11 | 環境設定readiness / FAIL | 必須Auth/DB/flag未設定 | Dev/Test専用値を安全なstoreに設定 | 検査のみ自動 | 環境別Secret store/flags設定 | 検査はローカル、環境費用UNKNOWN | offline設定検査成功＋別途実接続 | npm run security:readiness、exit 1 |
| R12 | AWS Budget通知 / BLOCKED | 対象Account/予算/購読/通知先不明 | 専用Account設定とsynthetic通知到達確認 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 閾値/購読と受信証跡 | Runbook監視表、実AWS未呼出 |
| R13 | Bedrock利用量/障害通知 / BLOCKED | ログ実装あり、CloudWatch設定未確認 | metric/log集計とTest通知 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 設定＋通知受信時刻 | logging実装/Runbook |
| R14 | S3容量/障害通知 / BLOCKED | 日次容量/Alarm/通知先未確認 | 対象bucketのmetric/Alarm/購読確認 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 設定＋Test通知受信 | Runbook監視表 |
| R15 | API 5xx/Provider障害通知 / BLOCKED | 安全ログあり、drain/集計/通知不明 | synthetic eventで集計から到達まで確認 | 安全性・承認後に自動可能 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | requestId/試験ID/受信時刻 | logger/security回帰は配送証拠ではない |
| R16 | LiveKit利用量 / BLOCKED | 契約/usage/通知先不明 | API利用可否確認、不可指標は手動担当設定 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | usage/費用/通知または手動確認記録 | 公式Analytics資料/Runbook |
| R17 | Neon利用量/契約/履歴窓 / BLOCKED | ユーザーのplan/restore window不明 | Consoleでplan/usage/復元可能時点を確認 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 契約名と機能/窓の非機密証跡 | 公開plan資料は契約の証明ではない |
| R18 | Neon隔離復元/RPO/RTO / BLOCKED | 安全なsource/target未確認 | 合成データから新Test復元先へ演習 | 承認・設定後に一部自動、管理面/実着は人間確認 | 対象Consoleの非本番管理権限/証跡提供 | UNKNOWN（費用表の対象サービス） | 整合性/復元時刻/所要時間 | Runbook復元手順、実Neon未接続 |
| R19 | 論理dump/restore代替方式 / PASS | 公開阻害原因なし（この範囲） | pg_dump→新規DB→pg_restore/照合を実施済み | 既存ローカルsuiteを再利用 | 新規設定不要 | 外部Provider課金なし、CI費用別 | 17テーブル/履歴/リンク/制約一致 | QA-DR-01、Neon PITR/RPO/RTOは対象外 |
| R20 | ローカル回帰/Secret/Build / PASS | 公開阻害原因なし（この範囲） | 実環境検証は別途必要 | 既存ローカルsuiteを再利用 | 新規設定不要 | 外部Provider課金なし、CI費用別 | 全必須チェック成功、skipなし | 再検証report/command evidence |
| R21 | Production操作 / NOT RUN | 初回禁止事項 | 変更案/影響/Rollbackのみ文書化 | 初回禁止 | 今回は実施しない | 初回追加費用なし | この作業では実行しない | Runbook変更案、Production無変更 |

R03/R05/R07/R08/R09の必要resource詳細は[provisioning plan](nonprod-provisioning-plan.md)のP01–P05、R12–R18はP06/P07参照。R04の必須設定名は[inventory](nonprod-environment-inventory.md)の9項目表。契約や無料枠が不明な項目の費用はUNKNOWNを維持する。

## 承認記録の雛形（未承認）

- 管理者/日時/有効期限: 未記入
- 対象P番号とAccount/Project/Branch/region: 未記入
- レビュー済みcommit/合成diff/実行コマンド: 未記入
- 月額/試験単位費用上限と無料枠の根拠: 未記入
- Production分離の証跡: 未記入
- 必要権限/実施者/通知先担当/cleanup対象ID: 未記入
- Cloud Apply承認: **なし**

## Next Codex Command（次のローカル実装単位）

> ops/nonprod-*.mdと、管理者が提示したInfrastructure Dev/Test・Budget Guard仕様を確認してください。確定した非機密台帳に基づき、既存S3 templateを再利用するCDK、server-only Vercel OIDC資格情報provider、承認済みBudget Guardの不足をローカルで実装・合成・回帰検証してください。未確定入力や既存仕様との矛盾があればBLOCKEDにしてください。Cloud Apply・Deploy・有料操作はまだ禁止です。確定diff・費用・権限・コマンド・cleanupを提示してApply承認の最終判断に備えてください。

## Next Codex Command（G2承認後のApply単位）

> ops/nonprod-provisioning-plan.mdのうち、承認記録［ID/日時］に明記したP番号［列挙］、Account/Project/Branch/region［非機密ID］、レビュー済みcommit［SHA］のみをApplyしてください。承認した費用上限［金額・試験量］、権限、コマンド、期限を照合し、UNKNOWN/差分追加/対象不一致があれば実行せず報告してください。有料プラン変更は禁止です。Productionへの接続・Secret取得・変更・Deployは禁止です。分離PASS後に承認範囲の実疎通・synthetic通知・隔離復元を順番に検証し、Mockと分けて結果/usage/cleanupを台帳へ記録してください。実環境未確認をPASSにせず公開判定を更新してください。

角括弧が未記入のまま実行しない。現在はG0/G1未完了でApplyできない。
