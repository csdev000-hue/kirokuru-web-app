# Phase 7 AI Ticket Candidate 実装補足

## 対象範囲と設計の優先順位

承認済みMinutes → AI候補生成 → pending → 人の編集 → approved/rejectedまでを実装する。Candidateからのtickets INSERT、registeredへの遷移、registered_ticket_idの設定は実装しない。

Phase仕様を旧設計より優先する。生成元はapprovedのみ、候補typeはtask/issue/followup、状態変更はPATCHに混在させず専用POSTとする。画面はPhase仕様の `/meetings/:id/ticket-candidates`、詳細は `/ticket-candidates/:id`。Prompt Versionは`ticket-candidate-v1`、Schema VersionはPhase 7指定の`ticket-candidate-schema-v1`をJSONとDB両方で使用する。旧AI設計のsnake_case構造・client_candidate_id・最大件数・Evidence構造は維持する。

## API

- POST `/api/ai/generate-tickets`: `{ meetingId, minutesId?, regenerate?: boolean }`。minutesId省略時は対象Meetingの最新Versionを選び、未承認なら422。UIでは承認済みVersionを明示選択する。201で`{ data: { generationId, minutesId, candidates } }`を返す。
- 任意の`Idempotency-Key`はUUID。成功した同じMinutes・キーの再送は同じ生成結果を返す。通常呼出は最新の成功結果を再利用し、明示的なregenerateで新規生成する。
- GET `/api/meetings/:id/ticket-candidates`: 全世代の候補一覧。status/minutesId/type/priority/assigneeIdで絞り込み可能。
- GET `/api/ticket-candidates/:id`: 詳細。Minutes Version、発言ID・時刻・話者・本文を付与する。
- PATCH `/api/ticket-candidates/:id`: pendingのみ、title/description/type/priority/assigneeId/dueDateを許可。
- POST `/api/ticket-candidates/:id/approve`、`/reject`: 空JSONのみ。pendingから各状態へ遷移する。承認済み・却下済み・registeredからの操作は409。

owner/memberのみ生成・編集・承認・却下でき、viewerは参照のみ。archived Projectは参照のみ。認可はDB上のCandidate→Meeting→Project→OrganizationとMinutes整合を検証し、クライアントの所属情報は利用しない。変更APIは既存Origin検証とstrict入力検証を再利用する。存在・Tenant境界の404は既存共通エラー方針に従う。

## AI入力と検証

Phase 6 StructuredAIClientを再利用する。Model/Regionは環境設定、temperature=0.1。Systemと入力JSONを分離し、Project・Meeting・承認済みMinutes・Project Member名・Minutesが参照するTranscriptだけを渡す。既存未完了Ticketは同一Projectの最大200件のタイトル・type・担当者ID・期限のみを重複抑制用に渡す。Transcript全件をBedrockへ再送しない。

JSON Parse → strict Zod → Meeting一致 → 入力範囲のEvidence実在・所属 → Project Member → 時刻・期限・優先度 → 重複除去の順で検証する。1件でも構造・Evidence・User IDが不正なら生成全体を保存しない。Evidence時刻はDB値、source_quoteは元発言の先頭最大300文字から生成する。AIのreasonやraw outputは保存しない。

担当者は関連する承認済みAction Itemの指定、または発言本文と一意に対応するProject Memberのみ保持する。期限は関連Action Itemの期限、発言の明示日付、日本時間の会議日基準の明日・今月末・来週金曜日との一致を確認する。曖昧な値はnull。優先度は「今日中に対応が必要」「リリース前に必須」「優先度が高い」等の明示根拠がある場合だけ保持し、単なるurgent指定命令等では補完しない。

confidenceは0〜1をZod/DBで検証し、自動承認には使用しない。同一生成内の正規化タイトル・type・担当者・期限が一致する候補を除去する。同じキーを持つ既存未完了Ticketも除外する。意味的な重複判定は行わず、人が確認する。既存Candidateは再生成で上書き・却下・削除しない。

## 生成履歴と競合

Migration `0004_phase_07_candidate_generations.sql`で以下を追加する。

- candidate_generations: Minutes、request key、lease token、有効期限、processing/completed/failed、作成更新日時。
- 同一Minutesのrequest keyのUnique Indexと、processingが1件のみとなる部分Unique Index。
- ticket_candidates.generation_idのFK。既存候補互換のためnullable。
- ticket_candidates.ai_modelをvarchar(2048)に拡張。

0件の結果もcompleted世代として保持するため、候補がない場合でも再送による重複呼出を防げる。Meeting行ロック下で120秒の生成権を取得する。Bedrock通信中はTransactionを保持せず、保存時に権限・Context・lease token・期限を再検証する。失敗時は候補を保存せずfailedにする。期限切れの処理は再実行でき、同じキーの再試行でもtokenを変更して古いworkerからの上書きを拒否する。

候補群の保存、成功履歴更新、監査は同一Transaction。承認/却下はCandidate行ロックとpending条件を使い、競合時は1件だけ成功する。承認直前に担当者・Evidence・Minutes承認状態を再検証する。人による編集では明示的に選択された担当者・期限・優先度を許可し、形式と所属を再検証する。

## Retryと入力上限

Phase 6の通信Retry（各呼出最大1回）とJSON/Schema Repair（全体最大1回）を共用し、最大4呼出。Business/Evidence不正はRepairしない。Phase 6の`AI_MINUTES_MAX_INPUT_BYTES`（既定60000）、`AI_MINUTES_MAX_OUTPUT_TOKENS`（既定4096）、`AI_MINUTES_TIMEOUT_MS`（既定30000）を共通のAI上限として利用する。超過入力は送信前に拒否する。Chunkingは追加しない。

## レビューと監査

会議詳細・議事録から候補一覧へ移動できる。候補詳細と一覧で編集・承認・却下でき、未保存変更がある間は承認/却下を禁止する。Evidenceは閲覧専用で発言アンカーへ移動する。元MinutesのVersionへのリンクを表示する。Confidenceは「AI生成時Confidence」と明示し、正しさを保証しないことを説明する。React標準escapeを使用する。

監査はai.ticket_candidate.generate / generate.failed、ticket_candidate.update / approve / reject / regenerate。本文を記録せず、生成件数・モデル・Prompt/Schema Version・世代ID・changedFieldsを保存する。MetricsにはrequestId/Meeting/Minutes/Model/Version、所要時間、サイズ、token数、候補数、通信Retry・Repair数、結果コードを記録する。生成成功監査、Candidate状態、編集監査から将来の承認率・却下率・編集率を集計可能。

## テストと制限

UnitはFixtureによるSchema・Business検証・Prompt境界・修復回数、Integration/Securityは一時PostgreSQLとBedrock Mockによる権限・Tenant境界・状態遷移・冪等性・競合・失敗保存を検証する。E2Eは既存のloopback HTTP/2 Converse代替サーバーを拡張し、生成→編集→承認/却下→再生成と正式Ticketが増えないことを確認する。

実Bedrockの生成品質・Prompt Injectionへのモデル挙動はMockだけでは評価できない。開発用Bedrockでの受入評価は別途必要。Productionへの接続・Migration・Deployは行わない。Migration適用検証は隔離したTest DBのみ。

Phase 8はapprovedかつregistered_ticket_idがNULLの候補を入力にすること。正式登録時にも権限・担当者・Evidence・状態を再検証し、登録と状態更新の原子性・二重登録防止を実装すること。
