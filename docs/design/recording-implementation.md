# Phase 9: S3 Recording

Phase仕様を優先し、古いAPI設計のfileName必須・s3Key応答・完了通知P1扱いは採用しない。録音管理のみで、LiveKit・自動録音・STT・AI起動は含まない。

## API・認可

| Method | Path | 権限・結果 |
|---|---|---|
| POST | /api/meetings/:id/recordings/upload-url | owner/member、201、contentType/fileSizeのみ |
| GET | /api/meetings/:id/recordings | viewer以上、page/limit（20件、最大100件） |
| GET | /api/recordings/:id | viewer以上、安全なメタデータ |
| POST | /api/recordings/:id/complete | owner/member、HEAD検証、200 |
| POST | /api/recordings/:id/upload-url | owner/member、uploadingかつObjectなし、再署名 |
| POST | /api/recordings/:id/download-url | viewer以上、uploaded/processing/completedのみ |
| DELETE | /api/recordings/:id | owner/member、利用依存なし、S3削除後に論理削除 |

操作POST/DELETEは既存のOrigin検証とJSON `{}` を使用。認証、認可、no-store、requestId、共通エラーを再利用。録音IDからMeeting→Project→Organizationを辿る。アーカイブ済Projectは書き込み不可、閲覧可。録音変更はMeetingロックを既存Transcript/Minutes変更と共有し、録音行もロックする。AI生成リース中の変更は既存ガードで拒否。

## Storageと制限

- SDK v3、server-only、遅延初期化、Default Credential Provider Chain。環境別Private Bucket、AWS_REGION。新しい依存ライブラリなし。
- Key: `organizations/{organizationId}/projects/{projectId}/meetings/{meetingId}/recordings/{recordingId}.{extension}`。UUIDはサーバー発行、元ファイル名・個人情報を利用しない。
- 許可形式: audio/webm、audio/mp4、audio/mpeg、audio/wav、video/webm、video/mp4。対応拡張子webm/m4a/mp3/wav/webm/mp4。
- 初期上限500 MiB（524288000 bytes）、設定可能、最大5,000,000,000 bytes。PUT TTL 600秒、GET 300秒、各60〜900秒。
- PUTはContent-Type/Content-Length/If-None-Matchを署名に含め、AES256を固定。ブラウザはContent-Lengthを自動送信。既存Objectを上書きできない。CORSに条件付きPUTと暗号化ヘッダーを許可する。
- DB INSERT成功後に署名発行。HEADで実サイズ、申告サイズとの一致、形式、上限を再検証。音声コンテナのバイト解析・マルウェアスキャンは実装していない（Content-TypeはS3 metadataの検証）。取得はattachment/no-store。
- SDK再試行最大2回、HEAD/DELETEは10秒で中断。署名は外部APIの通信不要。AWS raw error/URL/資格情報は返却・記録しない。
- 全成功URL発行・Complete・失敗監査を基準に、ユーザーごと30回/分をDB監査ログで制限。ユーザー行ロックで複数インスタンス間も直列化。大量の拒否リクエストへの外周WAFは別途運用。

## State / DB Migration

Migration `0005_cute_cyclops.sql`: meeting_recordingsにnullableのupload_expires_at / uploaded_at / deleted_atを追加。既存データを変更せず互換性を維持。

- uploading→uploaded: HEAD検証成功。uploadedへの再CompleteもHEAD再確認、同じ行を返す。
- 不正metadata→failed: ダウンロード禁止、Objectは追跡可能なまま隔離し、依存なしなら削除可能。
- Objectなし／一時的S3障害: uploadingを保持、再試行可能。署名生成失敗はfailedに更新し監査。
- 24時間経過したuploadingへの再発行はfailed化。自動一括更新は行わない。古い行は整合性レポートにも出す。
- uploaded→processing→completedとfailedへの内部遷移規則は定義するが、処理を起動するAPIは作らない。
- durationSecondsはNULL、uploadedAtは完了時刻。createdAtはメタデータ作成時刻。

## 削除・整合性・運用

Transcript/Minutes/CandidateのあるMeeting、録音processing/completedは削除不可。S3 Delete失敗はDB保持・502。Delete成功後のDB/監査失敗はDBロールバック、同じキーでDelete再試行できる。完全なS3/DB transactionとは扱わない。

削除履歴は通常一覧・詳細・URL発行から除外する。発行済みPUTは取り消せないため、削除後でもTTL内の遅延PUTによりObjectが再出現し得る。**削除履歴とKeyを保持し、最大PUT TTL経過後の整合性確認と再削除対象にする。** URLの開始済み転送はTTLを越えて継続し得るため、確認は一度で終わらず定期照合する。削除直後のGET URLも署名期限内は再出現したObjectに使えるため、この性質を運用上考慮する。DB行の早期物理削除を行わず、Meeting削除も録音履歴が残る間は既存依存ガードで拒否する。

`npx tsx scripts/check-recording-consistency.ts <local-inventory.json>` はオフラインの読み取り専用比較。DB/AWSへ接続せず、Production削除を実行しない。管理手順で同時点に近いDBメタデータとS3 Inventoryを出力し、以下のJSONへ変換する（機密情報として扱いGitへ入れない）。

```json
{"recordings":[{"id":"00000000-0000-4000-8000-000000000001","s3Key":"organizations/.../recordings/file.webm","status":"uploaded","contentType":"audio/webm","fileSize":"3","createdAt":"2026-09-20T00:00:00Z","deletedAt":null,"uploadExpiresAt":null}],"objects":[{"key":"organizations/.../recordings/file.webm","contentType":"audio/webm","fileSize":3}]}
```

レポートはstale uploading、Object欠落、metadata不一致、failed Object、削除後Object、DBにないObjectの件数、合計bytes/平均容量/録音件数を出力。KeyやURLをログへ出さない。孤立Objectの特定は元Inventoryを管理者が照合する。自動削除・自動Cronは未導入。

録音保持日数は既存設計に具体値がないため無根拠な日数で削除しない。リリース前に同意・保持期間・依存データ・法的削除方針を確定しLifecycleと照合手順に反映する。設定例のLifecycleは未完了Multipartの掃除のみ（本Phaseは単一PUT）、完成Objectの期限削除は未設定。

## Infrastructure（未適用の設定例）

`infra/aws/` に環境別CORS、Private設定、IAM、Lifecycle例。ダミーBucket/Originを対象環境へ置換しレビュー後に適用する。Runtimeは録音prefixのPutObject/GetObject/DeleteObjectと対象Bucket限定ListBucket。Bucket管理・ACL変更権限なし。HeadObjectはGetObject権限を使用し、欠落を404として識別するためListBucketも必要（権限不足403をObjectなしと誤判定しない）。[AWS HeadObject仕様](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)。録音専用Bucketを使用する。

Public Access Block全項目ON、BucketOwnerEnforced、SSE-S3。実AWSへの適用、資格情報作成、Productionアクセスは実行していない。

## Test・引継ぎ

REC-T01〜18、SEC-S3-01〜10に対応し、Unit/DB Integration/Security/Browser E2Eを追加。実S3の代替はloopback上のS3プロトコルdouble。実SDKのSigV4署名をPUT/GETで検証し、形式・サイズ・Key改変、期限切れ、上書き、公衆アクセス拒否を確認。AWS IAMそのものをエミュレートするものではないため、環境構築後に非Production BucketでIAM/CORS/暗号化/公開拒否の実機確認が必要。

`getRecordingForProcessing(userId, recordingId)` は内部専用で、member認可後にs3Keyを含む情報を返す。後続処理はこの境界、状態遷移、削除依存、テナント認可を継承する。匿名Worker向けの認可迂回は設けない。

## 検証結果

| コマンド | 結果 |
|---|---|
| npm run lint | 成功 |
| npm run typecheck | 成功 |
| npm run test:run | 146件成功 |
| npm run test:integration | 311件成功 |
| npm run test:s3 | 2件成功（Integrationにも含む） |
| npm run test:security | 151件成功 |
| npm run test:e2e | 19件成功 |
| npm run build | 成功 |

テストDBは一時PostgreSQL、S3はloopback double。MigrationはテストDBのみ適用。Production環境は変更していない。オフライン整合性CLIの欠落検知も確認済み。
