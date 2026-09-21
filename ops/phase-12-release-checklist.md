# Phase 12 Release gate / Runbook

この文書は手順と確認待ち項目であり、Production操作を実行した記録ではない。最終判定はdocs/testing/phase-12-report.md参照。

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
