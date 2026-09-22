# 非Production入力（未確定・未適用）

parameters.example.jsonはCDK config/policyの入力雛形。null/空欄は未確定なのでGuardが拒否する。Secretを入れない。管理者が検証済み非機密値だけをparameters.local.jsonへ入力する。架空の動作設定はtests/infrastructure/fixture.jsonだけに置き、synthetic=trueでApply禁止。

CDK実装はinfra/aws/、手順は[dev-test-setup](../../docs/infrastructure/dev-test-setup.md)。以前のvercel-oidc-trust.team.example.jsonはTeam issuerの説明用設定案。実際のTrustはCDKがvalidated configから合成する（単一environment、完全一致）。

[構築計画](../../ops/nonprod-provisioning-plan.md)と管理者承認が必要。実Account/Project/role/DB分離と費用は未確認。Cloud Applyは未実行。
