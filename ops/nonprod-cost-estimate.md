# 非本番 月額3,000円 Budget Gate

2026-09-22。判定 **UNKNOWN**、有料プラン変更・有料API呼出・Cloud Applyなし。契約/既存利用量/割引/残クレジット/為替/税が未確認なので、実月額合計を0円とは置かない。

| 対象 | 現在の契約 | 見積式・確認対象 | 現在の見積 |
| --- | --- | --- | --- |
| Vercel | UNKNOWN | seat固定費＋compute/転送/build超過、Hobbyの利用条件 | UNKNOWN |
| Neon | UNKNOWN | compute時間＋storage＋転送＋restore履歴＋追加branch | UNKNOWN |
| S3 | UNKNOWN | GB-month×region単価＋PUT/GET回数＋転送、Versioning/監視 | UNKNOWN |
| Bedrock | UNKNOWN | Σ全試行(inputTokens×入力単価＋outputTokens×出力単価)、model/profile/region別 | UNKNOWN |
| AWS Budgets | UNKNOWN（実設定なし） | 通知のみのBudgetsは無料。SNS/CloudWatch/Logs等は別課金条件 | UNKNOWN（周辺費用含む） |
| LiveKit | UNKNOWN | 契約固定費＋participant minutes/転送等、残quota | UNKNOWN |
| その他 | UNKNOWN | Domain、GitHub Actions超過、backup保管/転送、ログ保持等 | UNKNOWN |
| 合計 | — | 税・為替・手数料・予備費込み | **UNKNOWN** |

## 評価できるシナリオ

Vercel Proは公式表示$20/月から。仮の換算係数150円/USD（現在の為替相場ではない）なら$20だけで3,000円となり、税/他Provider費用の余裕がない。Pro新規契約を前提にした構成はAT RISK。有料プランへの変更は今回禁止。Hobbyは非商用・個人利用条件があるので、Dev/Testという名前だけで無料対象と判定しない。

無料契約・利用資格・残無料枠が確認できた場合のみ、それぞれの見積を条件付き0円に更新できる。Neon/LiveKitの既存有料プランがある場合も追加費用だけでなく、今回の予算に含める固定費配賦を管理者が決める。

**承認用の配分案（価格見積や支出保証ではない）**: Vercel/Neon/LiveKitは確認済み無料枠内を条件、S3/転送300円、Bedrock700円、監視/通知300円、backup/CI等200円、税・為替・未知費用予備1,500円＝3,000円。無料条件不成立ならこの案は失効し再見積。AWSの承認額はこの全体予算と別にUSDへ換算しparametersのapprovedAwsBudgetUsdに記録する。

見積用の試験量案: AI合成入力2,000 tokens/出力500 tokens以内×月20回、最大4 transport試行/生成を見込む（入力上限はbytesなので別管理）。S3保存1GB以内/月・小object試験100往復、LiveKit2人×10分×月5回、Neon小fixture/停止可能compute。これらは未承認の試算条件であり実装済みhard limitではない。地域/model単価と実usageが未確定なので総額PASSにはしない。

## Usage Guardの現状とApply gate

- EXISTS: DB共有Rate Limit、AI出力token/入力bytes/timeout/retry上限、S3ファイルサイズ上限、短期署名、LiveKit人数/Token TTL、Feature flags。
- MISSING: 月次円換算の全Provider累計上限、並列消費の事前予約、失敗/repair/retry込みの予算消費、unknown usage時の停止、管理者解除の証跡。
- Bedrock response.usage集計はあるが、応答不明のtimeoutや実請求の完全性は保証しない。UNKNOWN usageを0にしない。
- 初期flagsはfalse案。実AI/録音/Live試験は承認した回数/時間/容量に限定し、観測不能時は停止する。一般公開の有料機能有効化はBudget Guard仕様・実装・回帰確認までBLOCKED。
- AWS Budgetは遅延する通知であり請求上限ではない。AWS以外の請求を監視しない。超過を意図的に起こさずsynthetic通知で経路を確認する。

## 管理者が承認する項目

対象の契約と無料枠適合、月額上限に含む固定費、確定model/region単価、換算係数/税、月間/試験単位上限、通知先担当、停止閾値（例50/80/100%通知）、最大許容支出、承認期限。UNKNOWNが残る対象はApplyしない。有料プラン変更は承認対象にも含めない。

## 公式価格・仕様参照

2026-09-22参照。一般仕様でありユーザーの契約証跡ではない。

- [Vercel pricing](https://vercel.com/pricing)、[Hobby条件](https://vercel.com/docs/plans/hobby)
- [Neon plans](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md)
- [S3 pricing](https://aws.amazon.com/s3/pricing/)、[Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
- [AWS Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)、[通知の遅延・限界](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
- [LiveKit pricing](https://livekit.com/pricing)、[quota](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
