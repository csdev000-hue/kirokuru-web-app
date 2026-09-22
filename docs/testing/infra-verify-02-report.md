# Phase Infra-Verify ② 結果

2026-09-22 JST。Infrastructure Code **READY（今回ローカル仕様）** / Non-production Environment **BLOCKED** / Cloud Apply **NOT EXECUTED** / Release Decision **NOT READY**。

## 1. 実装したIaC

CDK v2 TypeScript、非本番Stack、S3 BPA/AES256/所有者強制/TLS/限定CORS/retain、Vercel TeamまたはGlobal issuerの限定Trust、recording prefixと単一modelのRuntime最小権限、AWS USD月次Budget、SNS、Bedrock input/output tokensとS3容量の3 Alarm、必要Outputs。
Vercel用のserver-only短期credential adapterをS3/Bedrockへ追加。Localでrole未指定の場合は既存SDK chainを維持。GitHub用AWS Roleは作成していない。

## 2. 作成・変更ファイル

- infra/aws/: config.ts / nonprod-stack.ts / synth.ts / tsconfig.json（既存S3 JSONを維持）。
- infra/budget/: guard.ts / usage.example.json。
- infra/nonprod/: parameters.example.json / README.mdを統合更新。
- lib/aws/credentials.ts、lib/bedrock/client.ts、lib/s3/client.ts。
- scripts/budget-check.ts / nonprod-guard.ts。
- tests/infrastructure/: fixture.json / infra.test.ts / budget.test.ts / oidc-runtime.test.ts。
- .env.example / package.json / package-lock.json / .gitignore / .github/workflows/ci.yml。
- docs/infrastructure/dev-test-setup.md / budget-guard.md、今回報告・コマンド証跡。
- ops/nonprod-provisioning-plan.md / nonprod-admin-actions.md / phase-12-release-checklist.md / nonprod-cost-estimate.md / nonprod-environment-inventory.md、README.md。

DB Migration変更なし。Auth/業務サービス/画面/既存テスト変更なし。

## 3. CDK synth

`npm run infra:build`成功、`npm run infra:synth:fixture`成功。CDK App.synthでcdk.out/fixtureへローカル合成。架空設定のみ、Context lookup/custom resourceなし。実設定は未確定なので実用templateの承認は未了。cdk bootstrap/deploy/destroy/diffは未実行。

## 4. テスト

| コマンド | 結果 |
| --- | --- |
| npm run test:infra | 51件PASS |
| npm run lint / typecheck | PASS |
| npm run test:run | 162件PASS |
| npm run test:integration | 353件PASS（隔離Local DB） |
| npm run test:security | 209件PASS |
| npm run build | PASS |
| npm run test:e2e | 50件PASS、3ブラウザー、38.3秒 |
| npm run security:secrets / security:client | PASS |
| npm audit | 脆弱性0件 |
| npm run budget:check | Unknown、exit 2（未確認usageの想定動作） |
| npm run infra:guard -- --apply | 拒否、exit 2（設定/承認なしの想定動作） |

CDK build初回でTypeScript 6のnode型指定不足を検出し、専用tsconfigにtypes:nodeを指定後成功。検証を弱める変更・skipはない。
[実行時刻とexit code](evidence/infra-verify-02-commands.json)。GitHub hosted Workflowの実成功は未確認。

## 5. 未確定設定

実Account/allowlist/Production非機密deny list、Region、Stack/Bucket、Team/Project名/issuer mode、CORS URL、model可用性、DB host/role、予算USD、監視閾値、通知受信先、Provider固定費/usage/為替。設定例はnull/空欄で拒否される。Secret値は保存していない。

## 6. 管理者確認

AWS専用Account・最小権限・既存OIDC有無、Vercel Development/Preview scope・短期資格情報、Neon専用branch/role/TLS/契約、LiveKit Project/契約/usage、Google専用client/2 test users/callback、Productionとの分離証拠。budget入力は実契約と観測日時・証跡に基づき更新する。

## 7. 想定Cloud変更

S3、OIDC Provider、Runtime Role、Budget、SNS Topic/email subscription、CloudWatch Alarm 3本。受信先はNoEcho Parameter。実Applyなし、実通知なし。既存OIDCがある場合は重複作成を停止しimport差分を別レビューする。

## 8. 費用

全Provider月額はUNKNOWN、3,000円以内の保証なし。S3/Bedrockに加えAlarm 3本・SNSの追加費用を管理者が確認する。AWS Budgetは通知であり全Providerの支出停止機能ではない。Budget Guardは状態集約で、古い/欠損/取得不能usageはUnknown、推定は推定と表示し課金許可判定を出さない。

## 9. リスクとRollback

Trust誤設定はアクセス停止/過剰権限、通知設定は未購読/追加費用、誤modelは呼出失敗となる。限定Trust/Account/DB/明示承認GuardとAssertionでローカル検証済み、実IAM/接続確認は次Phase。
新role停止・対象flag停止・App前版復帰。S3/OIDCはretainするためstack削除だけで完全cleanupしない。データ/共有Provider削除は別承認。Guardは管理者台帳の真実性や直接CLI操作の阻止を保証しない。

## 10. 次回Cloud Apply案

[管理者作業書](../../ops/nonprod-admin-actions.md)末尾のプロンプトを使用。承認ID/期限/P番号、実対象ID、review済みcommit/template hash、費用上限、cleanup範囲を埋める。設定digestと実caller identityを照合し、不一致/UNKNOWNは停止。分離PASS後に承認範囲の実疎通・通知・復元を実施しMockと別記する。Production操作・有料プラン変更は禁止。
