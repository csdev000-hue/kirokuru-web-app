# Phase 12 Test Inventory / Matrix

基点: f52b3cf（Phase 11）。初期棚卸しは Unit 162 / Integration 345 / Security 209 / Chromium E2E 21。
`test.skip` / `it.skip` / `describe.skip` / `fixme` / 実装TODO は app/lib/tests/e2e の検索で検出なし。失敗テストをskipする変更は行わない。

## 不足と対応

| 不足 | 対応 / Evidence |
| --- | --- |
| 単一シナリオでの端から端までのHuman Review | e2e/full-flow.spec.ts: E2E-FULL-01 |
| ブラウザー上の全主要resource越境・3ロール | e2e/tenant-isolation.spec.ts |
| 429のネットワーク応答 | 同ファイル。専用fixture actorの永続カウンターを事前消費 |
| Firefox/WebKit | playwright.config.ts。Auth/Smoke/Full Flowを追加 |
| 3画面幅、キーボード、HTTPエラーUI | full-flow.spec.ts / ui-qa.spec.ts |
| Candidate N+1とページング | qa-performance.test.ts。修正前101件811 queryを再現、修正後50件4 query |
| 親とowner/hostの原子性 | qa-transactions.test.tsで子INSERT失敗を注入 |
| Approve/Reject競合 | registration-suite.ts: CON-T02、独立poolで1勝者 |
| 性能とMigration・運用証跡 | qa-performance.test.ts、既存database.test.ts、ops/phase-12-release-checklist.md |

## Critical Scenario Matrix

最終結果: Unit 162 / Integration 352 / Security 209 / E2E 50件×3回が成功。PASSはローカル・Mock範囲の結果であり、Issue欄の実環境確認を含まない。

| ID | Feature | Scenario | Level | Priority | Result | Evidence | Issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0-01 | Auth | Session/login/logout、偽造cookie、CSRF、redirect | Unit/Security/E2E | P0 | PASS (local) | auth-config/auth-api/auth-cookie tests、auth.spec.ts | Google OAuth実疎通未確認 |
| P0-02 | Org/Project | 作成/編集/role/原子性 | Integration/E2E | P0 | PASS (local) | crud-suite、qa-transactions、org-project.spec | なし |
| P0-03 | Ticket | CRUD/filter/comment/soft delete | Integration/E2E | P0 | PASS (local) | ticket-suite、ticket.spec | なし |
| P0-04 | Meeting | host/transcript/bulk/状態遷移 | Integration/E2E | P0 | PASS (local) | meeting-suite、meeting.spec | なし |
| P0-05 | AI Minutes | generate/schema/evidence/retry/version | Unit/Integration/E2E | P0 | PASS (local) | ai-minutes、minutes-suite、minutes.spec | Bedrock Mock |
| P0-06 | Review | Minutes編集→承認、承認後immutable | Integration/E2E | P0 | PASS (local) | minutes-suite、full-flow.spec | なし |
| P0-07 | AI Candidate | 生成、架空ID/根拠/型の拒否 | Unit/Integration/Security | P0 | PASS (local) | ticket-candidate、candidate-suite | Bedrock Mock |
| P0-08 | Review | 候補編集/承認/却下 | Integration/E2E | P0 | PASS (local) | candidate-suite、ticket-candidate.spec | なし |
| P0-09 | Registration | 明示登録までTicketなし、相互リンク | Integration/E2E | P0 | PASS (local) | registration-suite、full-flow.spec | なし |
| P0-10 | Kanban | todo→in_progress→done | E2E | P0 | PASS (local) | full-flow.spec / ticket.spec | なし |
| P0-11 | Tenant | 全resource越境拒否、URL直入力 | Security/E2E | P0 | PASS (local) | authorization、各security suite、tenant-isolation.spec | なし |
| P0-12 | Concurrency | 2/10並列登録、重複bulk、approve/reject | Integration | P0 | PASS (local) | registration-suite | なし |
| P0-13 | Secret | ソース/Client/ログ/応答検査 | Security/Script | P0 | PASS (local) | headers-logging/hardening、security:secrets/client | Git全履歴の完全検査ではない |
| P0-14 | Build | production形式build、型、空DBmigration | Build/Integration | P0 | PASS (local) | npm run build、database.test | Production適用なし |
| P1-01 | Recording | PUT/complete/download/delete/権限/異常 | Integration/E2E | P1 | PASS (local) | recording-suite、s3.test、recording.spec | Private S3/IAM実設定未確認 |
| P1-02 | LiveKit | start/token/join/leave/end/recovery | Unit/Integration/E2E | P1 | PASS (local) | live-meeting suite、livekit-provider、live-meeting.spec | Real WebRTC未確認 |
| P1-03 | AI failure | 429/500/timeout/network/repair上限 | Unit/Integration | P1 | PASS (local) | ai-minutes.test、minutes/candidate suite | 実モデル品質とは別 |
| P1-04 | Rate | 原子的制限、Retry-After、requestId | Security/E2E | P1 | PASS (local) | hardening.test、tenant-isolation.spec | E2Eは専用事前消費fixture、並列消費はDBテスト |
| P1-05 | Browser | Chromium全体、Firefox/WebKit核心 | E2E | P1 | PASS (local) | playwright projects | Firefox/WebKitの実RTCは対象外 |
| P1-06 | Responsive | 390/768/1280、Ticket/Board/Meeting/Review | E2E | P1 | PASS (local) | full-flow.spec | スクリーンリーダー実機未確認 |
| P1-07 | UX | keyboard/label/button/pending/errors | E2E/Unit | P1 | PASS (local) | ui-qa、既存UI tests | 完全なWCAG適合監査ではない |
| PERF-01 | List | 100 Tickets / 100 Meetings / 500 Transcripts / 100 Candidates | Integration | P1 | PASS (local) | qa-performance.test | ローカルSmoke、Production p95ではない |

## Provider Matrix

| Provider | Mock | Integration | Production dependency | Failure behavior |
| --- | --- | --- | --- | --- |
| Bedrock | HTTP2 deterministic Converse fixture | schema/timeout/retry、DB rollback | 有効時のみ | AIエラー/failed状態、通常CRUDは独立 |
| S3 | loopback SigV4 storage double | 実SDK署名/PUT/HEAD/Delete | 録音有効時 | 録音失敗、Meeting/Ticketは独立 |
| LiveKit | loopback Twirp/provider double | 実SDK/Token検証/Room制御 | 会議有効時 | end intent保持、cleanup再試行 |
| Neon | 代替は隔離PostgreSQL | 制約/Tx/競合/TLS(E2E) | Core DB必須 | 安全なエラー、Provider機能でもDB障害は回避不可 |
| Google/Auth.js | 検証済みUser fixture＋署名済みSession | 実Auth.js core/cookies/logout | Login必須 | 安全文言/未設定503。実同意画面・callbackは未確認 |

## 安全性とArtifact

Test DBはcreateTestDatabaseのNODE_ENV=test・生成context WeakSet guardでのみseedする。E2Eのアプリ子プロセスはproduction形式buildだが接続先は一時TLS loopback DBであり、Production環境ではない。
外部endpointは専用loopback Mockへ上書き。cleanupはcontextに紐付く一時clusterだけをfinallyで閉じる。Productionデータ・資格情報は使わない。
E2Eの共通user予算は3ブラウザー実行用に明示的なテスト値へ上書きする。アプリ本体の認証・認可・Rate Limitを無効化しない。
trace/screenshotは失敗時のみ、Git ignore。Token/署名URLを含み得るためCIでは自動公開アップロードしない。ローカル失敗Artifactは必要な調査後削除する。

## DB / Query Review

0000–0007を順序通り確認。初期作成、soft delete、会議制約、生成lease/ledger、録音状態、LiveKit時刻、Rate Limitを追加するMigration。
DROP TABLE/COLUMNや大量DELETEはない。Phase5のCHECK追加は時刻・sequenceの値域を制限するため、既存データ適合性とlock時間はStagingで要確認。
空DBへ全件適用・再適用を既存database.testで実行。16テーブル、FK/UNIQUE/CHECK/default/nullabilityを検証。db:generateで差分なしを確認する。
仕様に挙げられたmembership、project/status、ticket/status/assignee/deleted、meeting/date、transcript/sequence、minutes/version、candidate/meeting/project/status、audit/org/timeのindex/uniqueをschemaで確認。
Ticket/Meeting一覧はJOIN/集計、Transcript/Comment/Membersは集合取得。Candidate一覧のN+1は修正した。認可後にDB側のproject/meeting条件で限定し、根拠も同会議のページ内IDに限定する。
Ticket/Meeting/Transcript/Candidateは上限付き一覧。Auditの一般ユーザーAPIは未公開。候補生成履歴・Minutes履歴、メンバー、コメントの非ページング取得は拡大時のP2改善候補として残す。
