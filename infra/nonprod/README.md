# 非Production設定の準備（未適用）

parameters.example.jsonは入力台帳でありCDK context/CloudFormationではない。null/空欄は未確定、デプロイ可能ではない。Secret値は入力しない。featureFlagsは承認案であり現在の設定を変更しない。

vercel-oidc-trust.team.example.jsonはTeam issuerモード専用Trust案。実Team/Project/issuerモードを確認してから値を確定する。Global issuerならProvider ARNとconditionキーのissuer pathを変更して再レビューする。Project IDをPROJECT_NAMEに代入しない。subjectのProject名と一致させる。wildcard/productionの許可は禁止。

公式資料: [Vercel AWS OIDC](https://vercel.com/docs/oidc/aws)、[claims reference](https://vercel.com/docs/oidc/reference)（2026-09-22確認）。audienceは標準のTeam URLを使う案。custom audienceを選ぶ場合はProvider登録・Trust・SDK設定を同時に一致させる。JWT自体は成果物に保存しない。

既存infra/aws/のS3 Block Public Access、AES256、BucketOwnerEnforced、CORS、Lifecycle、IAM案を再利用する。新規の重複S3 templateを作らない。CORSのexample.invalidを承認済みDev/Preview originへ限定し、ListBucketは必要prefixのみに絞る。HeadObjectはGetObject権限で扱う。

CDK・Budget Guard専用の既存仕様/実装は見つかっていない。計画段階でCDK完了とは報告しない。次のローカル実装単位で、Account/Region/Stack固定、未設定/Production拒否、S3/IAM/Trust/Budget合成assertion、retain方針を追加する。管理者が既存仕様の別配置を示した場合はそれを優先する。

アプリは現状AWS標準Credential Chain。AWS_ROLE_ARNだけを設定してもVercel OIDC対応完了ではない。server-onlyの共通資格情報providerへ公式awsCredentialsProviderを統合し、S3/Bedrockに渡す変更・回帰テストが別途必要。Vercelには長期Access Keyを設定しない。AWS_REGIONはVercelの実行region任せにせず明示固定する。

変更計画・承認範囲: [provisioning plan](../../ops/nonprod-provisioning-plan.md)。このフォルダのファイルから自動Applyする仕組みはない。
