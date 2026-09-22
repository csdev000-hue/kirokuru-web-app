# Dev/Test Infrastructure — local implementation

Phase Infra-Verify ② / 2026-09-22。Cloud Apply **NOT EXECUTED**。実Account/Project/契約・分離は未確認。

## 実装と安全境界

- `infra/aws/config.ts`: Zod設定、dev/test/preview限定、管理者許可Account/Region/StackとProduction deny listの照合、DB host/database/role許可、TLS verify-full限定。
- `infra/aws/nonprod-stack.ts`: CDK v2/TypeScript。S3 BPA/所有者強制/AES256/TLS/CORS/未完multipart削除、retain、Vercel OIDC、Runtime Role、foundation-modelへのInvokeModel、USD月次AWS Budget、50/80/100%通知、SNS、S3容量とBedrock input/output tokensの3 Alarm、Outputs。
- `infra/aws/synth.ts`: CDK App.synthを直接呼ぶ。AWS SDK/Context Lookup/CDK diffを使わずローカル完結。L1 OIDC Providerを使い証明書取得用custom resourceを合成しない。
- `scripts/nonprod-guard.ts`: 設定・DB URL・Apply承認をオフライン検査するだけ。クラウド操作や接続機能なし。
- `lib/aws/credentials.ts`: server-only公式Vercel短期資格情報provider。S3/Bedrockクライアントから使用。Localでroleなしの場合は従来chain、Vercelまたはrole指定時はnonprod設定を要求し静的キーを拒否。

Guardは管理者が検証した台帳を入力として照合する。台帳自体の真実性や実IAM/ネットワーク分離をローカルで証明しない。既存アプリDB接続をこのCLIが横取りするものではない。手動のAWS CLI/CDKを技術的に全面禁止するsandboxでもない。Apply時のcaller identityとIAM権限確認は次Phase必須。

## ローカル実行

Node 24で`npm ci`後:

```bash
npm run infra:build
npm run test:infra
npm run infra:synth:fixture
npm run budget:check
npm run infra:guard -- --apply
```

fixture合成は`tests/infrastructure/fixture.json`の架空Account/hostのみ。`cdk.out/fixture/`はGit ignore。fixtureの`synthetic:true`はApply承認しても拒否する。**実アカウントへの適用テンプレートとして使わない。**

budget:checkは未設定例でUnknown/exit 2、infra:guard --applyも未承認なのでexit 2が正常な安全側結果。実確認PASSではない。infra:buildはtsc noEmitによるCDKコードの型ビルド。

## 未確定設定の準備

`infra/nonprod/parameters.example.json`をgitignore対象の`parameters.local.json`へコピー。config/policy内のnull/空配列を管理者確認済み非機密情報だけで埋める。SecretやDB URLをJSONへ保存しない。現状のexampleは不完全なので合成を拒否する。

- config: environment、accountId、region、stackName、bucketName、Team/Project名・issuer mode・environment、固定CORS origin、model ID、AWS月額USD、容量/日次token閾値、DB host/database/runtime role。
- policy: 非本番Account allowlist、Production Account deny list、region/stack allowlist、許可DB tuple、Production DB host deny list。
- Production Account/hostの**非機密識別子**も未確認なら空欄のままBLOCKED。Production Secretを取得して埋めない。
- `NONPROD_CONFIG_FILE`をそのファイルへ設定して`npm run infra:guard`、`npm run infra:synth`。実資格情報不要。`AWS_PROFILE`やCDK_DEFAULT_ACCOUNTを使って未確定値を推測しない。
- `--database`付きguardは現在のDATABASE_URLをメモリ上で照合。URLをログに出さない。hostaddr等で接続先を上書きするquery、role/DB不一致、verify-full以外を拒否。Neon poolerと直接hostのProduction denyは正規化して照合する。

## OIDCとIAM

Team issuer `https://oidc.vercel.com/<team>` / Global issuer `https://oidc.vercel.com`を設定で選ぶ。audは標準Team URL、subはTeam/Project名と単一environmentのStringEquals。dev→development、test/preview→preview。productionやwildcardを許可しない。[Vercel公式claims](https://vercel.com/docs/oidc/reference)

Vercel Development/Previewへ`AWS_ROLE_ARN`、`AWS_NONPROD_ACCOUNT_ID`、明示`AWS_REGION`を設定する。RuntimeはVERCEL_ENVがdevelopment/previewの場合だけ許可。`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`と併用不可。公式awsCredentialsProviderが短期資格情報を取得・更新する。実STS交換・更新の疎通は未実施。[公式AWS接続](https://vercel.com/docs/oidc/aws)

Runtimeにはrecording prefixのGet/Put/Delete、prefix条件付きListBucket、設定regionの1 foundation modelへのInvokeModelのみ。モデル利用権/region可用性は別途確認。cross-region inference profileやstreaming権限は今回対応しない。必要なら対象ARNを明確にした別レビューが必要。GitHub Actions用AWS Roleは作らず、既存CIはAWS資格情報なしのローカル合成だけ。

共有OIDC Providerが実Accountに既存の場合、重複作成は失敗する。既存ARNのimportへ変更するか専用Accountとするかを管理者が確認し、次の差分レビューで決定する。自動探索・既存Provider変更はしない。

## 通知・監視と費用

CloudFormation Parameter `NotificationEmail`はNoEcho、defaultなし。承認された受信先をApply時に安全に入力する。SNS email subscriptionは受信側確認が必要。AWS Budgetは直接email、CloudWatch Alarmは専用SNSへ送る。送信/到達は未検証。

S3はAWS/S3・BucketSizeBytes・StandardStorageの日次Average。将来storage class変更時は指標も更新する。BedrockはAWS/Bedrock・ModelId・InputTokenCount/OutputTokenCountの日次Sum。欠損はmissing（0にしない）。請求/キャッシュ/失敗usageの完全性を保証しない。[AWS runtime metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html)

**追加課金要素**: CloudWatch標準Alarm 3本、SNS publish/email配信、S3保存/要求/転送、実Bedrock tokens。通知のみBudget自体以外にも費用がある。region単価・無料枠・契約が未確定なので実月額はUNKNOWN。S3容量標準指標とBedrockサービス指標を利用し、新規custom metric、Lambda、ログ本文保存、KMS CMKは作らない。最新単価/税/為替をApply前に確認し月3,000円の全Provider予算に含める。

## Apply gateと次回手順

このRepositoryに自動Applyコマンドは実装していない。以下は**検査のみ**:

1. `infra:guard`のconfigurationDigestを承認記録へ保存する。
2. ローカルの承認JSONにallowed=true、digest、accountId、stackName、expiresAt（UTC）、reference、fixture=falseを設定。管理者の承認後のみ。
3. CLOUD_APPLY_ALLOWED=true、NONPROD_APPROVAL_FILEを明示して`infra:guard -- --apply`。設定変更/失効/fixture/承認欠落は拒否。
4. 実行直前に実caller identity/確定Account/実IAM/費用/通知先と承認された合成template hashを別途照合する。guard成功だけでDeploy承認と解釈しない。
5. 管理者承認後の別実行単位でのみ、限定Applyと実接続試験を行う。今回bootstrap/deploy/destroy/diff/lookupは一切実行しない。

S3 Bucket/OIDC ProviderはRetain、autoDeleteObjectsなし。stack削除だけでは保存費用/信頼Providerが残る。誤Trustはrole無効化、Appはflags停止・旧版へ戻す。bucket/object/共有OIDCの削除は所有と保存要件を確認した別承認が必要。DB Migration差分なし。
