# Phase 6 AI Minutes 実装補足

## APIとレビュー

- `POST /api/ai/generate-minutes`: `{ meetingId, regenerate?: boolean }`。owner/memberのみ。生成済みなら通常呼出は最新Versionを返す。再生成は新Versionを作る。
- `Idempotency-Key`は任意のUUID。同一Meetingの成功済みキーは同じMinutesを返す。UIは通信失敗後の再試行でキーを維持する。
- `GET /api/meetings/:id/minutes`: Version降順のメタデータ一覧。任意の`version`で絞り込み。
- `GET /api/minutes/:id`: 検証済みの議事録。raw output・generation keyは返さない。
- `PATCH /api/minutes/:id`: summary/decisions/actionItems/issues/pendingItemsのみ。owner/memberが編集できる。
- `POST /api/minutes/:id/approve`: 空JSON。権限・JSON構造・Evidence・担当者を再検証する。approvedは編集不可。
- `/meetings/:id/minutes`: Version履歴、全セクション編集、担当者・期限・根拠選択、保存と承認。未保存変更がある間は承認不可。根拠リンクは発言順のページとTranscriptアンカーへ移動する。

過去のapprovedは保持し、approvedのうち最大Versionを現行承認版として扱う。最新Versionがreviewでも過去承認の記録は消さない。viewerとarchived Projectは閲覧専用。

## Bedrockと検証

[Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)を利用する。`BEDROCK_MODEL_ID`、`AWS_REGION`を環境から取得し、temperatureは0.1。AWS認証はサーバーのSDK credential chainを利用する。

Systemと入力JSONを分離し、会議・Project名・メンバー名・参加者名・Transcriptの許可項目だけを渡す。本文中の命令はデータとして扱い、秘密情報はContextへ含めない。Promptだけでモデルの追従防止を保証せず、出力Schema・DB整合検証・人の承認を重ねる。

AI JSONとJSONB内の項目は既存AI設計のsnake_case（`source_evidence`, `action_items`等）。外側のHTTPリソースは既存APIのcamelCase（`actionItems`, `pendingItems`等）を用いる。Prompt Versionは`minutes-v1`、Schema Versionは`1.0`。JSON Parse→strict Zod→Meeting ID→Transcript所属→Project Member→時刻・期限・重複の順で検証する。

Evidenceは1〜10件、各カテゴリ最大100項目、summary最大5000文字。時刻はTranscriptのDB値を採用する。不明なUser ID・別MeetingのEvidenceは拒否する。AIの担当者名は根拠本文に現れる場合のみ保持する。期限は明示日付または会議日の日本時間基準の「明日」「今月末」「来週金曜日」と一致する場合のみ保持し、曖昧な期限はnullにする。人の編集では明示的に選んだ担当者・期限を許可するが、所属と形式は再検証する。

生成は常に`review`で保存する。AIに承認・Candidate/Ticket生成権限はない。raw outputは修復の間だけメモリに保持し、`ai_raw_output`はnull。Reactの通常escapeで表示する。

## Retry・上限・競合

SDK自動Retryは無効。429/5xx/一時ネットワーク障害は各モデル呼出につき最大1回、200ms待機後に再試行する。JSON/SchemaのRepairは全体で1回。最大モデル呼出4回。Business/Evidence不正や出力打ち切りはRepairしない。タイムアウトはRepairとRetryを含めた全体に適用する。

- `AI_MINUTES_MAX_INPUT_BYTES`: 既定60000、1000〜200000。System・Schema・会議データ・Repair入力をUTF-8バイトで検査する。モデル固有のtoken上限ではなく、運用設定の送信上限。
- `AI_MINUTES_MAX_OUTPUT_TOKENS`: 既定4096、256〜8192。
- `AI_MINUTES_TIMEOUT_MS`: 既定30000、1000〜45000。
- 応答本文は131072バイトまで。Schema不正、出力打ち切り、上限超過は安全なエラーを返す。
- 長文は送信前に`AI_CONTEXT_TOO_LARGE`で拒否する。Chunk/Map-ReduceはPhase仕様で許容されたTODO。導入する場合も元Transcript IDと最終検証を維持する。

Meeting行ロック下で120秒の生成leaseを取得し、外部通信中はDB transactionを保持しない。完了時にlease token・期限とContextを再検証し、Meeting行ロックと`UNIQUE(meeting_id, version)`でVersionを採番する。成功済みキーにも部分Unique Indexを設ける。稼働中のleaseは手動Meeting更新やMinutes編集も拒否する。worker異常終了は期限後の新規生成で回復し、古いworkerは新しい生成を保存・解除できない。

Meetingは開始時processing、成功時completed、失敗時failed。失敗はMinutesを保存せずleaseを解放し、安全な監査を記録する。DB障害で失敗処理自体が完了できない場合も期限切れleaseの再取得で回復可能。

## 監査・検証

成功・失敗・編集・承認・再生成をAuditへ記録する。MetricsにはrequestId、meetingId、modelId、Prompt/Schema Version、所要時間、送受信サイズ、token数、通信Retry数、Repair数、結果コードを記録する。本文・Prompt・raw response・SDK error全文は記録しない。

Unitは構造・根拠・日付・Prompt境界・Retry・Timeout・入力上限を検証する。Integration/Securityは隔離した一時PostgreSQLとBedrock mockで、認可・Tenant境界・編集承認・採番・冪等性・lease・保存失敗・監査を確認する。E2EはloopbackのConverse代替サーバーとSDK標準`AWS_ENDPOINT_URL_BEDROCK_RUNTIME`を利用し、アプリにテスト専用認証やAI分岐を導入しない。実モデルの品質・Prompt Injection耐性はMockだけでは確認できないため、開発用Bedrockの受入検証を別途行う。

Production接続・Migration・Deploy・資格情報変更は行わない。Migration `0003_phase_06_minutes_generation.sql`は開発環境へ適用してから利用する。
