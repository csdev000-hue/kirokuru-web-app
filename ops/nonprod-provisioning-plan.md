# Phase Infra-Verify / Nonproduction Provisioning Plan

2026-09-22、基点5c410fa。状態: **DRAFT / NOT APPROVED / NOT APPLIED**。
初回は調査・計画・設定案の準備のみ。既存アプリ、DB schema、成功済みテストの変更なし。既存仕様が見つからないため、専用CDK/Budget GuardはINCOMPLETEとする。

## 承認単位

G0: 非機密inventory・契約・費用・既存仕様を管理者が補完。
G1: 別のローカル実装単位でCDK合成/OIDC provider/Budget Guardの不足を埋め、diff・回帰をレビュー。まだApply不可。
G2: 対象ID/実行コマンド/確定差分/費用上限/cleanupを固定し、管理者が明示承認。
G3: 承認された非Production項目だけを別実行でApply。
G4: 分離確認PASS後、実疎通→通知→復元→CI証跡を取得して公開判定を更新。

UNKNOWN Account/Projectに対する包括承認を求めない。G0/G1未完了の間、以下のコマンド例を実行しない。

## 対象別変更計画

| ID / 対象 | Account/Project | 作成・変更内容 | コスト | 必要権限 | 実行方法/コマンド案 | 影響 | Rollback/cleanup | Production非影響の確認条件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 AWS基盤 | UNKNOWN、専用非本番Account必須 | CDK bootstrap/Stack、S3/IAM/OIDC/通知Budget | UNKNOWN、cost-estimate参照 | 限定CloudFormation/IAM/S3/Budgets、必要時SNS/Logs | CDK実装後に`cdk synth --no-lookups`で固定Account/Region合成、レビュー後`cdk bootstrap aws://<account>/<region> --profile <nonprod>`、`cdk deploy <stack> --profile <nonprod> --require-approval broadening` | 非本番resourceとbootstrap保管費用、IAM信頼追加 | 新Trust無効化、Stack差分戻し。Bucket retain、共有OIDC/bootstrap削除禁止。専用objectだけ別承認cleanup | caller Account、固定region、resource ARN、TrustのTeam/Project/environment、Production policy非参照 |
| P02 Vercel | Team/Project UNKNOWN | 専用Project、Development/Preview env、固定Preview URL/OIDC | UNKNOWN、無料利用資格確認 | Team Project/env/deploy管理 | Consoleで専用Project/環境設定。実装検証後`vercel deploy --target=preview --scope <team>`（紐付けIDを事前照合） | Preview公開、OAuth origin変更 | 新Preview停止、当該env設定を安全な既知版へ復元 | Production Project/envを選択しない。`--prod`禁止。自動Git deploy設定を先に確認 |
| P03 Neon | Project UNKNOWN | Dev/Test/Preview分離、runtime/migration role、TLS、Test migration | UNKNOWN、契約/branch課金確認 | 専用Project管理＋DB role管理 | Consoleで新規非Production Project/Branch、role/grantをレビュー後適用。安全なTest URLを注入して`npm run db:migrate` | schema作成・接続先追加 | 専用新branchを停止、データ保存後cleanup。共有branchをdropしない | Productionデータからcloneしない。runtimeにDDL/他DB権限なし、各URLとbranch照合 |
| P04 Google OAuth | Cloud Project UNKNOWN | 専用Web Client、同意画面、2 test users、origin/callback | UNKNOWN、既存契約確認 | OAuth設定管理 | Google Consoleで設定。SecretはVercelの対象scopeへ直接登録 | Dev/Test login有効化 | 新Client無効化、専用envを削除/戻す | Production OAuth Clientを再利用せず別origin |
| P05 LiveKit | Project UNKNOWN | 専用Project/key、試験用Room | UNKNOWN、無料枠/転送確認 | 専用Project管理 | ConsoleでProject、アプリ開始/token APIで合成会議を実行 | 参加時間・転送費用 | 新Room終了、専用key無効化。共有Project削除禁止 | key所属Projectと用途を確認、Production endpoint使用禁止 |
| P06 監視 | 各非本番Account/Project UNKNOWN | Budget、5xx/Provider metrics、通知先/購読 | UNKNOWN（通知Budget自体以外も評価） | Billing閲覧/予算管理、CloudWatch/SNS、各Provider監視管理 | Console/IaCで専用rule作成、受信者合意後synthetic通知 | 通知量・ログ保管/metric費用 | 新ruleだけ無効化、既存監視維持 | Test専用通知経路、自動停止/削除Actionなし |
| P07 Neon復元 | source/target UNKNOWN | 契約機能の確認後、新規Test復元先 | UNKNOWN、履歴/branch/storage費用 | Test branch restore管理 | Runbookのmarker A/B復元手順。実API/Console選択後コマンド確定 | Test branchと追加保存領域 | 作成ID照合・証跡保存後、専用復元先のみcleanup | Production復元/clone/上書きなし、target空/隔離 |
| P08 GitHub CI | Repository管理設定未確認 | 非本番PRのCI実行、Required Checks | UNKNOWN、Actions枠確認 | PR/Actions閲覧、管理者branch rule設定 | PRでCI/Security実行、Consoleで結果と必須status checksを確認 | merge gateが追加 | 追加ruleのみ前設定へ復元、成功検査をskipしない | ActionsにProduction Secret不要、contents:read維持 |

CDKコマンドは将来の雛形。現在cdk.json/実行可能Stackはないため、存在するコマンドとして報告しない。未知のリソース名を推測してApplyしない。

## G1で必要なコード/設定

- infra/awsの既存S3設定を再利用。BPA全true、BucketOwnerEnforced、AES256、TLS必須policy、限定CORS、abort multipart、retainを合成検証する。
- Account/Regionは検証済み値を固定、CDK default account/regionに依存しない。未設定・Production一致・origin wildcardは拒否する。
- OIDCは`infra/nonprod/vercel-oidc-trust.team.example.json`を出発点とし、実issuer modeを確認。Team issuer `https://oidc.vercel.com/<team>`、標準aud `https://vercel.com/<team>`、sub `owner:<team>:project:<project-name>:environment:<development|preview>`をStringEquals。Global設定ならissuer/pathを合わせる。[公式仕様](https://vercel.com/docs/oidc/reference)
- Runtime roleは録音prefixのGet/Put/DeleteObject、必要prefixのListBucketだけ。Bedrockは確定model/profile ARNへのInvokeModelだけ。不要な管理/streaming権限を付けない。cross-region inference利用時は対象region/model ARNと費用を別レビューしResource=*で回避しない。
- アプリに公式`awsCredentialsProvider`をserver-onlyで組み込み、AWS_ROLE_ARNと明示AWS_REGIONを使う。現在の標準chainだけではVercel OIDC完成扱い不可。[公式AWS連携](https://vercel.com/docs/oidc/aws)
- 失効・誤Team/Project/production subject拒否、S3越境、region mismatch、期限更新、静的AWS key非使用を回帰試験する。
- Budget通知設定と月次Usage Guardは別機能。未提示の専用仕様を確認し、並列予約・retry・UNKNOWN usage時の停止要件を確定してから実装する。初期feature flags=false案。追加新機能と称して課金基盤全体を実装しない。

## G4の試験順序と証跡

既存[再検証Runbook](phase-12-revalidation-runbook.md)を再利用し重複suiteは作らない。

1. 分離: 各ID/Trust/grant/env scope/policyを照合。Productionへ実接続して拒否を試すのではなく権限証跡で確認。別名だけでPASSにしない。
2. Neon: TLS verify-full接続、SELECT 1、migration role適用/journal確認、runtime CRUD、DDLと他branchアクセス権なしを確認。
3. OAuth: 専用2ユーザー、login/callback/session refresh/logout、未認証・他Org拒否。code/token/Cookieのraw記録禁止。
4. Bedrock: region/model availability確認→OIDC短期権限→承認上限内の最小合成入力→既存Zodと根拠検証。各試行input/output tokens、repair/transport retry、usage不明を記録。token値は記録しない。
5. S3: private/IAM/CORS→小object PUT/HEAD/GET/DELETE、presigned使用、匿名/別prefix拒否。作成key以外は削除しない。
6. LiveKit Server: 専用Room/token/2参加/退出/終了。Browser:別証跡で音声/映像/Share/reconnect、終了後token再利用・Room再作成挙動。未確認ならLive OFF。
7. 監視: AWS Budget、5xx、Bedrock/S3障害・容量、Neon容量/Compute、LiveKit usageを対象別に「設定存在」「synthetic受信日時」を別記。実障害/実超過を発生させない。API不可の指標は担当者と手動周期を定めUNKNOWNを残す。
8. Neon復元: 契約/restore窓を確認、Test marker A/Bから隔離新targetへ復元、全行/履歴/制約/リンク・Test App接続確認。RPOは最新保持データ時刻差、RTOは開始〜App正常確認まで。ローカルdump成功は代用不可。
9. CI: 実PR commitのCI/checks・Security/security実行URL、Required Checks設定、Secret name/scopeのみ、DB一時生成、3browser、Migration差分なし、Client scanを確認。ローカル成功と区別する。

記録形式: ID / UTC日時 / 環境・非機密ID / commandまたはConsole手順 / PASS・FAIL・BLOCKED・NOT RUN / result・requestId / 費用・usage / 証跡参照 / cleanup結果 / 残課題。実接続機能の結果とMock結果は別欄。
