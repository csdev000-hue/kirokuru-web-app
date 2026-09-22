# Phase Infra-Verify ③ / Cloud Apply承認準備

調査日: 2026-09-22。基点commit: `03551e8`。管理者承認状態: **PENDING**。
**承認可能な確定差分はまだない。設定未確定のためPreflightを停止し、Cloud Changes: NOT EXECUTED / Release Decision: NOT READYを維持する。**

## 今回の証跡と停止理由

- 管理者が非本番用途を確認したCLI Profile、Account許可リスト、Region、Projectの指定がない。AWS default Profileは使用していない。資格情報ファイルの内容・Production Secretは取得していない。
- `NONPROD_CONFIG_FILE`、`AWS_PROFILE`、`AWS_REGION`、`AWS_NONPROD_ACCOUNT_ID`、`NONPROD_APPROVAL_FILE`、`CLOUD_APPLY_ALLOWED`、`BUDGET_USAGE_FILE`は未設定（存在だけ検査）。
- `infra/nonprod/parameters.local.json`、`infra/budget/usage.local.json`、`.vercel/project.json`、`.env.local`は不存在。別の設定保管先やクラウド資源の不存在を意味しない。
- 2026-09-22 05:42:45 UTC: `npm run infra:guard`はexit 2 / BLOCKED。実設定不足を検出。
- 同時刻: `npm run budget:check`はexit 2 / Unknown、7費用区分すべてunknown、`allowPaidOperations=false`。`knownTotalJpy=0`は請求額0円の証明ではない。
- STS / 各Provider管理API / 実設定synth / CDK diff: **NOT RUN**。環境分離の前提不足によりBLOCKED。架空fixtureで代用していない。
- Infrastructure Code READYは[Phase②報告](../docs/testing/infra-verify-02-report.md)と[既存テスト証跡](../docs/testing/evidence/infra-verify-02-commands.json)に基づくローカル判定。今回アプリ回帰テストの再実行や実環境成功を意味しない。
- 文書追加後の`npm run security:secrets`はPASS（422 files）、`git diff --check`はPASS。今回の変更は本資料と公開前チェックリストのみ。作業中に確認された`next-env.d.ts`の生成先差分は本作業では編集・取り消ししていない。

## 対象と管理者による補完

| 対象 | 現在 | 再開に必要な非機密情報・証跡 |
| --- | --- | --- |
| AWS Account / Region / CLI Profile | UNKNOWN | 専用非本番用途の管理者確認、明示Profile名、許可Account ID、Region、Productionとの権限分離根拠 |
| AWS bootstrap / Stack / IAM権限 | UNKNOWN | 対象Stack名、bootstrap qualifier/Stack名、使用Principal、読み取り権限と実行時権限の区別 |
| Vercel Team / Project / Environment / plan | UNKNOWN | IDとslug、Development/Previewの対象、issuer mode、契約、Production環境を信頼しないTrust条件 |
| Neon Project / Branch / plan / DB権限 / Backup | UNKNOWN | 非本番branch ID、非機密host/database/role、grant、TLS、データ由来、契約と復元可能期間 |
| LiveKit Project / plan / API Key所属 | UNKNOWN | 非本番Project ID、契約、鍵の所属確認証跡。鍵やSecretの値は記載しない |
| Google Project / OAuth Client / Callback / Test User | UNKNOWN | 専用Project/Clientの識別子、許可origin/callback、2テスト利用者の設定完了証跡。個人情報・Secretを貼らない |
| Production分離 | BLOCKED | 非機密識別子、IAM Trust/Policy、DB grant、接続先/env scope照合。Productionへの実接続は不要・禁止 |
| Budget / 通知先 | UNKNOWN | 全Provider契約、固定費、従量見積、通知先の安全な保管先と受信者合意 |

管理者は既存[台帳](nonprod-environment-inventory.md)、[管理者作業書](nonprod-admin-actions.md)と`infra/nonprod/parameters.example.json`を補完する。Secretは専用の安全な保管先へ設定し、チャット・Git・実行ログへ出さない。未確定IDを推測せず、有料プランへ変更しない。

## 想定リソースと変更の必要性

実Provider検証に必要な非本番権限・保管先・監視を既存CDKで定義済み。下表は**コード上の構築案**であり、作成/更新/削除の実差分ではない。既存資源がある場合は再利用・import可否を先にレビューする。

| 対象 | ローカル定義 | 実差分 |
| --- | --- | --- |
| S3 | Recording Bucket、BPA、AES256、TLS必須、限定CORS、retain | BLOCKED |
| OIDC Provider | Vercelの確定issuer/audience。既存共有Providerがあれば重複作成を停止 | BLOCKED |
| IAM Role / Policy | Team/Project/非本番Environment限定Trust、録音prefixと単一Bedrock Modelへの限定権限 | BLOCKED |
| AWS Budget | USD月額予算、50/80/100%通知。Account全体が対象 | BLOCKED |
| SNS | 通知Topic、email subscription、同一Account CloudWatchからの限定Publish | BLOCKED |
| CloudWatch Alarm 3本 | S3容量、Bedrock InputTokenCount、OutputTokenCount | BLOCKED |

IAM信頼と書込/Invoke権限追加、録音データ保存、通知購読がセキュリティ上の影響。実Account/Region/ARNとProduction非参照を確認するまで適用不可。GitHub Actions RoleをVercel Runtime Roleと兼用しない。

## 次回Read-only Preflightの手順・コマンド案

以下は未実行。`<...>`は管理者の確定値で置き換える。対象Profileの用途確認前には実行しない。

1. 非機密設定を`NONPROD_CONFIG_FILE`で指定し、`npm run infra:guard`を実行する。ローカルpolicy PASSだけでは実分離PASSにしない。
2. `aws --profile <非本番Profile> --region <確定Region> sts get-caller-identity --query '{Account:Account,Arn:Arn}'`でCallerを照合。Accountが許可リストに一致しない、Productionと重複、権限不足なら停止。認証情報のexport/表示をしない。
3. 同じ明示Profile/RegionでIAM OIDC Provider・Role/Trust/inline policy、S3 BPA/encryption/policy/CORS、CloudFormation bootstrap/対象Stackを読み取り確認。既存Budget/SNS/Alarmも確認し、削除・置換の影響を特定。AccessDeniedは「不存在」とせずBLOCKED。読み取り結果は非機密項目だけ保存する。
4. `npm run infra:synth`で確定Account/Regionのassemblyを生成。manifestの対象Account/RegionとContext Lookup不在を確認。fixture assemblyを使わない。
5. CDK CLIの利用可能性・バージョン・assembly互換性をローカル確認する（本RepositoryはCDK library/API synthを使用）。読み取り専用方式をサポートするCLIでのみ、次の案を確定して実行する。

```text
cdk diff <確定Stack> --app cdk.out/nonprod --profile <非本番Profile> --method=template --no-lookups --exclusively
```

明示Regionをプロセスにも設定し、assemblyのAccount/Regionを優先照合する。デフォルトdiff方式はchange setを作成し得るため使用しない。`--method=template`はtemplate比較であり置換評価に限界がある。CLIが対応しない場合は停止し、auto方式へフォールバックしない。[AWS公式diff仕様](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-diff.html)

6. 対象リソース全件の追加/更新/削除/置換/権限差分をレビュー。意図しないDELETE/REPLACE/権限拡大/Production参照があれば停止。bootstrap不存在でも作成しない。diffに必要な権限不足でも昇格・変更しない。
7. 成功したdiffを非機密artifactとして保存し、`shasum -a 256 <diff証跡ファイル>`でhashを記録。テンプレート/ソースcommitも固定し、設定Guardのdigestと併記。失敗ログのhashを成功diff hashにしない。

## 費用評価

| 費用区分 | 月額見積 | 未確認事項 |
| --- | --- | --- |
| Vercel | UNKNOWN | 契約と固定費・従量 |
| Neon | UNKNOWN | 契約、Compute/Storage/branch/復元枠 |
| LiveKit | UNKNOWN | 契約、接続時間/転送 |
| S3 | UNKNOWN | 保存容量、request、転送 |
| Bedrock | UNKNOWN | Model、input/output tokens、試行上限 |
| AWS監視/Budgets/SNS | UNKNOWN | 3 Alarm、通知、metric関連費用・適用無料枠 |
| その他固定費 | UNKNOWN | Actions等の契約・利用枠 |

総額・税・為替を含む月3,000円との整合: **UNKNOWN**。[費用評価](nonprod-cost-estimate.md)を更新後に承認する。AWS Budgetは請求上限でもAWS以外の費用監視でもない。追加Alarm/SNSの費用も適用前の承認に含める。プラン不明を0円扱いしない。

## 承認対象の固定・有効期限

| 項目 | 状態 |
| --- | --- |
| 管理者承認 | PENDING（まだ承認可能な確定対象なし） |
| Account / Project / Environment | UNKNOWN |
| 設定hash | NOT GENERATED / BLOCKED（実設定なし） |
| CDK Diff hash | NOT GENERATED / BLOCKED（diff未実施） |
| Template hash / 確定変更commit | 未固定。調査基点03551e8は承認済み変更を示さない |
| 承認者・承認参照 | 未指定 |
| 有効期限 | 未設定。承認の効力なし。承認時にUTC期限を明示 |
| Cloud Apply | NOT EXECUTED |

対象、設定、template/source、diff、費用、コマンド、期限のいずれかが変われば再レビュー・再承認する。既存`infra:guard -- --apply`は設定digest/Account/Stack/期限に対する検査であり、diff hashや管理者本人を自動検証しない。別途承認記録との照合を必須にする。PENDING文書から`allowed:true`の承認ファイルを生成しない。

Apply実行コマンドは[既存構築計画](nonprod-provisioning-plan.md)P01を基に、確定Profile/Stack/assembly/安全なNotificationEmail入力方式を固定して追記する。現段階では対象・bootstrapの有無が不明なため、実行可能なdeploy/bootstrapコマンドは確定できない。今回bootstrap/deploy/destroy、他Provider作成・変更・Deployは一切行わない。

## Rollback / 後片付け

適用前に既存template・Trust・policyの非機密証跡を保存する。問題時は追加Runtime Trust/権限を無効化し、レビュー済み旧定義へ戻す変更を別途承認する。S3はretainで録音データを保護し、自動削除しない。共有OIDC/bootstrapや既存監視を削除しない。SNS購読/Alarmは今回追加分のみを対象に停止案を作る。新規bucketの残存・監視費用も記録する。`cdk destroy`を一般的なRollbackに使用しない。Productionに影響しない根拠が確定するまではRollback操作も含め適用不可。

## 次回投入プロンプト案

> 非本番用途を確認したProfile・Account許可リスト・Regionと各Project/契約情報を台帳へ追記しました。ops/nonprod-apply-approval.mdに従い、対象を再照合してread-only Preflight、実設定synth、template-only CDK diff、費用評価を実施してください。資格情報やSecretを表示せず、差分・設定・templateのhashと期限を固定した承認資料を更新してください。今回もCloud Applyは禁止です。管理者がその確定資料を明示承認した後、別実行単位で承認対象だけをApplyしてください。

Infrastructure Code: READY / Actual Account・Project: UNKNOWN / Environment Isolation: BLOCKED / CDK Diff: BLOCKED / Budget: UNKNOWN / Cloud Apply Approval: PENDING / Cloud Changes: NOT EXECUTED / Release Decision: NOT READY。
