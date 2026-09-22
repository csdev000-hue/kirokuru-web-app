# Budget Guard — 月3,000円のオフライン集計

実装: infra/budget/guard.ts、scripts/budget-check.ts。AWS BudgetはAWSだけの通知、全Providerの請求上限ではない。今回実usage取得/外部通知/有料呼出は行わない。

## 入力・実行

`infra/budget/usage.example.json`をgitignore対象のusage.local.jsonへコピーし、BUDGET_USAGE_FILEを設定して`npm run budget:check`。exampleは意図的に全UNKNOWN。monthは対象のUTC年月を明示する。

対象: vercel、neon、bedrock、s3、awsMonitoring、livekit、other。すべて必須。各項目はamountJpy（null=不明）、source（api/manual/estimate/unknown）、observedAt（UTC）、evidence（機密を含まない確認記録ID）。Secret、raw API応答、通知先、connection stringを入力しない。結果にevidenceは出力しない。

Vercel固定費はvercelFixedJpyに分け、vercel.amountJpyは変動費だけ。未確認の固定費はnull。税・為替・全関連費用を含む円換算後の同一月累計を入力し、AWS請求総額とS3/Bedrock内訳を重複計上しない。awsMonitoringは他欄で計上しない監視費用だけ。

## 状態・判定

- Normal: 50%未満。
- Warning: 50%以上。
- Critical: 80%以上。
- Exceeded: 100%以上（3,000円ちょうどを含む）。
- Unknown: 金額/固定費/証跡/日時不足、取得不可、未来日時、24時間超の古い値、対象月不一致。

warning/critical比率、maxAgeHours（最大168h）は入力で検証可能。月額目標は3000固定。
既知額だけで超過した場合は、他がUnknownでもExceededを優先しincomplete=trueを残す。既知のVercel固定費もこの下限に含む。
Provider別stateは共通の全体予算に対する金額比、独自割当予算ではない。knownTotalJpyは不明費用を0と確定した総額ではなく、観測済みの下限。

allowPaidOperationsはNormal/Warningかつ全項目確認済み・推定なしの場合のみtrue。Critical/Exceeded/Unknown/estimateはfalseでexit 2。不正JSON/schemaもexit 2、値を出さない。これは観測に基づく判断材料であり、Cloud Apply承認を付与しない。

## Neon / LiveKitインターフェース

`UsageReader.read(): Promise<unknown>`と`collectUsage(reader)`を提供する。認証済み管理APIや手動記録をこのshapeへ変換できる。API unavailable/error/invalidはunknown/nullへ変換し、エラー本文を出さない。現在、実Neon/LiveKit API collectorは接続していない。

NeonはConsoleでplan/compute/storage/transfer/restore費用を確認しmanual記録を入力。契約上APIが利用できる場合だけread adapterを実装する。LiveKitもmanual/APIに加え、estimateLiveKitCost(participant minutes, 円単価, 固定費)で推定できる。推定時source=estimateを付け、課金許可判定には使用しない。転送等の他課金がある場合は含めるまでUNKNOWN。

## 監視基盤

CDKはS3日次容量、Bedrock input/output tokensのAlarm、AWS月次USD Budgetを合成する。token数から円換算するには実model/region/cache/retry単価と実績が必要。欠損を無料としない。通知設定の存在、synthetic送信受付、受信者の到達確認は別証跡。

追加費用はCloudWatch Alarm 3本＋SNS通知等。契約/region単価を確定するまでUNKNOWN、予算PASSにしない。[AWS Budgets価格](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)、[CloudWatch価格](https://aws.amazon.com/cloudwatch/pricing/)、[SNS価格](https://aws.amazon.com/sns/pricing/)をApply前に確認する。

## 限界と既存機能

このPhaseのGuardは監視/状態集約であり、自動メール送信、課金API停止、月次の並列予約ledgerではない。既存アプリのRate Limit、AIサイズ/token/retry上限、録音容量上限、Feature flagsは維持する。新DB Migrationはない。

観測遅延や試験以外の支出を防止できないため、月3,000円以内の請求を保証しない。実試験は管理者承認の回数/時間/容量上限と停止担当が必要。自動予約/停止を要求する運用への展開は別の設計・回帰確認が必要。
