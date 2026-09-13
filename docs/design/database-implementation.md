# Phase 1 DB実装補足

対象仕様: `docs/phases/phase-01-database.md`。基礎設計: `docs/design/db-design.md`。

## 実装範囲とMigration

14テーブルを`lib/db/schema/`に定義し、`index.ts`からテーブル、Relation、Select/Insert型をexportしています。
スキーマを領域別6ファイルに分け、Relationは`relations.ts`、共通日時・JSON型は`shared.ts`へ分離しました。

正式Migrationは`drizzle/migrations/0000_phase_01_database.sql`です。Drizzle Kitによる自動生成のままで、SQLの手動修正はありません。snapshotとjournalを合わせてGit管理します。

| 項目 | 実装 |
| --- | --- |
| Table | 14 |
| Primary Key | 14（UUID主キー12、membership複合主キー2） |
| Foreign Key | 30（RESTRICT 25、SET NULL 5） |
| Unique Constraint | 6（email、S3キー、会議ごとの発言順・議事録版、候補/正式チケットの相互参照） |
| Check Constraint | 17（列挙値・発言時刻・議事録版・信頼度） |
| 明示Index | 14。PK/UNIQUE由来20本とは別。実DBでは合計34本 |
| JSONB | 7カラム |
| 時刻 | TIMESTAMPTZ。期限のみDATE、発言開始/終了はNUMERIC |
| UUID | DB default `gen_random_uuid()` |

発言順と議事録版のUNIQUE制約により必要な複合Indexが作成されるため、同一列の通常Indexは追加していません。
参加者・録画・コメントには、それぞれ会議/チケットからの関連取得用Indexを追加しました。

## DB設計書との差分・具体化

- Phase 1を優先し、`ticket_candidates.type`は`task / issue / followup`に限定します。正式`tickets.type`の`decision`は保持します。
- Phase 1指定の`tickets.deleted_at`と、議事録・候補の`prompt_version`／`schema_version`を追加しました。
- DB設計書の候補`source_start_seconds`はPhase 1対象カラムに含まれないため追加していません。根拠は`source_transcript_ids`で保持します。
- `meeting_participants.id`はDB設計書とPhase 1の許容事項に従いUUID主キーとしました。`user_id=NULL`の複数ゲストや同名ゲストを識別できます。
- 列挙値はVARCHAR+CHECKを採用しました。Drizzleの`varchar`のenum指定はTypeScriptの型制限であり、DB側CHECKも独立して定義しています。
- 指定されたNULL許可を維持しています。議事録の配列JSONB、候補の根拠IDは`[]`、監査metadataは`{}`をDB defaultとします。
- 任意ユーザー参照5箇所（担当Ticket、担当候補、参加者、発言者、監査ユーザー）の削除規則はSET NULL。それ以外のFKはRESTRICTです。ユーザーが作成者やメンバーとして残る場合、その参照がユーザー削除を阻止します。

## 循環Foreign Key

`tickets.source_candidate_id`と`ticket_candidates.registered_ticket_id`をどちらもNULL許可・UNIQUE・FKにしています。
TypeScriptの循環型推論はFKコールバックの`AnyPgColumn`戻り値指定で解消しました。
Drizzleが全CREATE TABLEの後にALTER TABLEでFKを設定するため、初期Migrationひとつで安全に作成できます。一時PostgreSQLへの適用と以下の更新順序をテスト済みです。

1. 候補を作成（登録先TicketはNULL）。
2. Ticketを作成して候補IDを設定。
3. 候補の登録先Ticket IDを更新。

正式な登録処理は後続Phaseで単一トランザクションにします。FK/UNIQUEは参照先の実在と重複を防ぎますが、両参照が同じペアか、人間承認済みか、同じProject/Meetingかは後続サービス層で検証する必要があります。

## 日時・型の扱い

`created_at`と`updated_at`の挿入時defaultはDBの`now()`です。
更新は全テーブルでDrizzleの`$onUpdate(() => new Date())`に統一します。DBトリガーはありません。Drizzleを経由しない保守SQLでは`updated_at`を明示更新してください。
日時はタイムゾーン付きで保存し、APIではUTCのISO 8601として扱います。期限のDATEはタイムゾーン変換せず`YYYY-MM-DD`文字列で扱います。

NUMERICは精度維持のため文字列、BIGINTの録画ファイルサイズはJavaScriptの`bigint`として取得します。後続APIでJSONへ返す場合は明示的な変換が必要です。
JSONBのTypeScript型は基本的なJSON値に留めています。AI構造・ID実在・所属・根拠のZod検証は後続Phaseの責務です。

## Tenantと監査境界

Organization→Project→Ticket/Meetingの構造を保持し、子テーブルへ`organization_id`を重複追加していません。
OrganizationMemberのroleはowner/member、ProjectMemberにはviewerもあります。FixtureのViewer Aは組織memberかつProject viewerです。
所属・認可、候補のProjectとMeetingの整合、担当者の所属は後続APIで必ず検証します。Phase 1でRLSやPermission関数は実装していません。

監査ログには更新日時・削除日時や更新/削除APIを設けていません。通常操作では追記のみとし、後続Phaseでアプリ用DBロールの権限も設計します。現在のスキーマだけでDB管理者の直接UPDATE/DELETEを禁止するものではありません。

## テストDB・Fixtureの安全性

`npm run test:integration`はPostgreSQLの`initdb`/`pg_ctl`を使い、`/tmp/kirokuru-db-*`に専用クラスタを新規作成します。
ネットワーク待ち受けを無効化し、所有者専用ディレクトリのUnix socketでのみ接続します。接続先DATABASE_URL・`.env.local`・既存クラスタは使用しません。TLS無効はこの専用Unix socketのみで、アプリ接続のTLS証明書検証は維持しています。
テストは生成MigrationをDrizzle Migratorで適用し、2組織のFixtureを投入します。各ケースはトランザクションでロールバックし、完了後は専用クラスタを停止・削除します。

必要なバイナリの探索順は`PG_BIN`、`pg_config --bindir`、既存macOS PostgreSQL 14の標準パスです。PostgreSQL 14以上とNode.js 24を使用してください。PostgreSQL未導入の場合は事前にインストールしてください。
CIでもPostgreSQLツールを用意し、この隔離DB方式で実行します。DBが起動できない場合はテストを失敗させ、黙ってskipしません。

`tests/fixtures/db.ts`のFixtureは、NODE_ENV=testかつテストハーネスが発行した生存中のDBコンテキストだけを受け付けます。任意のDBクライアント・Production実行は拒否します。汎用SeedコマンドやProduction用Seedは作成していません。

Neon固有のTLS・権限・接続プールは今回のローカルテストの対象外です。後続環境構築で開発用Neonを用意し検証してください。
