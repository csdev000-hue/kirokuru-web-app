**AIプロジェクトマネージャー**  
**DB設計書**

Version 1.0 / MVP

対象構成：Next.js / Vercel / Neon PostgreSQL / Drizzle ORM / Amazon Bedrock / S3

# **1\. DB設計概要**

本書は、AIプロジェクトマネージャーのMVP実装に必要なPostgreSQLデータベースの論理・物理設計方針を定義する。サービス中核である「Meeting → Transcript → Minutes → Ticket Candidate → Ticket」の追跡性と、人間による承認後にのみ正式チケットへ登録する制御を最優先とする。

| 項目 | 設計内容 |
| :---- | :---- |
| DBMS | PostgreSQL（Neon） |
| ORM | Drizzle ORM |
| 文字コード | UTF-8 |
| 主キー | UUID |
| 日時 | TIMESTAMPTZ。DBにはUTCで保存し、表示時にユーザーTZへ変換 |
| マルチテナント | organizationsをテナント境界とする |
| AIデータ | 構造化JSONをサーバーで検証後、JSONBまたは正規化カラムへ保存 |
| 削除 | 監査・追跡性を壊さないよう物理削除を限定。必要に応じ論理削除を拡張 |

# **2\. テーブル一覧**

| No. | テーブル名 | 分類 | 概要 |
| :---- | :---- | :---- | :---- |
| T-001 | users | ユーザー | サービス利用者 |
| T-002 | organizations | 組織 | 企業・チーム単位のテナント |
| T-003 | organization\_members | 組織 | ユーザーと組織の所属・ロール |
| T-004 | projects | プロジェクト | プロジェクト基本情報 |
| T-005 | project\_members | プロジェクト | プロジェクト参加者・ロール |
| T-006 | tickets | チケット | 正式タスク・課題・決定事項 |
| T-007 | ticket\_comments | チケット | チケットコメント |
| T-008 | meetings | 会議 | 会議基本情報と処理状態 |
| T-009 | meeting\_participants | 会議 | 会議参加者 |
| T-010 | meeting\_transcripts | AI/会議 | 発言単位の文字起こし |
| T-011 | meeting\_recordings | ファイル | 録音・録画ファイルのS3参照 |
| T-012 | meeting\_minutes | AI/会議 | AI議事録と人間確認版 |
| T-013 | ticket\_candidates | AI/チケット | AIが生成したチケット候補 |
| T-014 | audit\_logs | 監査 | 重要操作履歴 |

# **3\. ER関係**

論理的な主要関係は以下とする。

organizations 1 ─ N organization\_members N ─ 1 users

organizations 1 ─ N projects

projects 1 ─ N project\_members N ─ 1 users

projects 1 ─ N meetings

meetings 1 ─ N meeting\_participants N ─ 0..1 users

meetings 1 ─ N meeting\_transcripts

meetings 1 ─ N meeting\_recordings

meetings 1 ─ N meeting\_minutes

meetings 1 ─ N ticket\_candidates

projects 1 ─ N tickets

ticket\_candidates 0..1 ─ 0..1 tickets（登録前は未関連）

tickets 1 ─ N ticket\_comments

# **4\. users**

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | ユーザーID |
| email | varchar(255) | NO | UNIQUE |  | ログインメールアドレス |
| name | varchar(100) | NO |  |  | 表示名 |
| avatar\_url | text | YES |  | NULL | プロフィール画像URL |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **5\. organizations**

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 組織ID |
| name | varchar(200) | NO |  |  | 組織名 |
| created\_by | uuid | NO | FK users.id |  | 作成者 |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **6\. organization\_members**

複合主キーは (organization\_id, user\_id)。同一組織への二重所属を防ぐ。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| organization\_id | uuid | NO | PK/FK organizations.id |  | 組織ID |
| user\_id | uuid | NO | PK/FK users.id |  | ユーザーID |
| role | varchar(20) | NO | CHECK | member | owner / member |
| created\_at | timestamptz | NO |  | now() | 所属日時 |

# **7\. projects**

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | プロジェクトID |
| organization\_id | uuid | NO | FK organizations.id |  | 所属組織 |
| name | varchar(200) | NO |  |  | プロジェクト名 |
| description | text | YES |  | NULL | 説明 |
| status | varchar(20) | NO | CHECK | active | active / archived |
| created\_by | uuid | NO | FK users.id |  | 作成者 |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **8\. project\_members**

プロジェクト参加者は原則として同一organizationのorganization\_membersに存在することをAPI層で検証する。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| project\_id | uuid | NO | PK/FK projects.id |  | プロジェクトID |
| user\_id | uuid | NO | PK/FK users.id |  | ユーザーID |
| role | varchar(20) | NO | CHECK | member | owner / member / viewer |
| created\_at | timestamptz | NO |  | now() | 参加日時 |

# **9\. tickets**

AI候補から正式登録された場合のみsource\_meeting\_id / source\_candidate\_idを設定する。手動作成チケットではNULLを許容する。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | チケットID |
| project\_id | uuid | NO | FK projects.id |  | プロジェクトID |
| title | varchar(300) | NO |  |  | タイトル |
| description | text | YES |  | NULL | 詳細 |
| type | varchar(30) | NO | CHECK | task | task / issue / decision / followup |
| status | varchar(30) | NO | CHECK | todo | todo / in\_progress / blocked / done |
| priority | varchar(20) | NO | CHECK | medium | low / medium / high / urgent |
| assignee\_id | uuid | YES | FK users.id | NULL | 担当者 |
| due\_date | date | YES |  | NULL | 期限 |
| created\_by | uuid | NO | FK users.id |  | 作成者 |
| source\_meeting\_id | uuid | YES | FK meetings.id | NULL | 元会議 |
| source\_candidate\_id | uuid | YES | FK ticket\_candidates.id / UNIQUE | NULL | 元AI候補 |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **10\. ticket\_comments**

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | コメントID |
| ticket\_id | uuid | NO | FK tickets.id |  | チケットID |
| user\_id | uuid | NO | FK users.id |  | 投稿者 |
| content | text | NO |  |  | 本文 |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **11\. meetings**

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 会議ID |
| project\_id | uuid | NO | FK projects.id |  | プロジェクトID |
| title | varchar(200) | NO |  |  | 会議名 |
| meeting\_date | timestamptz | NO |  |  | 開催日時 |
| status | varchar(20) | NO | CHECK | scheduled | scheduled / recording / processing / completed / failed |
| created\_by | uuid | NO | FK users.id |  | 作成者 |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **12\. meeting\_participants**

外部ゲスト参加を考慮しuser\_idはNULL可。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 参加者レコードID |
| meeting\_id | uuid | NO | FK meetings.id |  | 会議ID |
| user\_id | uuid | YES | FK users.id | NULL | 登録ユーザー。外部参加者はNULL |
| display\_name | varchar(100) | NO |  |  | 会議上の表示名 |
| role | varchar(30) | NO | CHECK | participant | host / participant |
| joined\_at | timestamptz | YES |  | NULL | 入室日時 |
| left\_at | timestamptz | YES |  | NULL | 退室日時 |

# **13\. meeting\_transcripts**

AIチケットの根拠参照先となるため、発言単位のID・順序・時刻を保持する。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 発言ID |
| meeting\_id | uuid | NO | FK meetings.id |  | 会議ID |
| speaker\_user\_id | uuid | YES | FK users.id | NULL | 登録済み発言者 |
| speaker\_name | varchar(100) | NO |  |  | 発言者表示名 |
| started\_at | numeric(12,3) | NO |  |  | 録音開始からの秒数 |
| ended\_at | numeric(12,3) | YES |  | NULL | 発言終了秒数 |
| text | text | NO |  |  | 発言内容 |
| sequence\_no | integer | NO | UNIQUE(meeting\_id, sequence\_no) |  | 発言順 |
| created\_at | timestamptz | NO |  | now() | 登録日時 |

# **14\. meeting\_recordings**

音声・動画本体はDBに保持せずS3に保存する。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 録音ID |
| meeting\_id | uuid | NO | FK meetings.id |  | 会議ID |
| s3\_key | text | NO | UNIQUE |  | S3オブジェクトキー |
| content\_type | varchar(100) | NO |  |  | MIME Type |
| file\_size | bigint | YES |  | NULL | バイト数 |
| duration\_seconds | integer | YES |  | NULL | 録音秒数 |
| status | varchar(20) | NO | CHECK | uploading | uploading / uploaded / processing / completed / failed |
| created\_at | timestamptz | NO |  | now() | 登録日時 |

# **15\. meeting\_minutes**

再生成時は既存行を上書きせずversionを増加する。approved版の上書きは禁止する。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 議事録ID |
| meeting\_id | uuid | NO | FK meetings.id |  | 会議ID |
| version | integer | NO | UNIQUE(meeting\_id, version) | 1 | 版番号 |
| status | varchar(20) | NO | CHECK | draft | draft / review / approved |
| summary | text | YES |  | NULL | 要約 |
| decisions | jsonb | YES |  | \[\] | 決定事項 |
| action\_items | jsonb | YES |  | \[\] | アクション項目 |
| issues | jsonb | YES |  | \[\] | 課題 |
| pending\_items | jsonb | YES |  | \[\] | 保留事項 |
| ai\_model | varchar(100) | YES |  | NULL | 生成モデル識別子 |
| ai\_raw\_output | jsonb | YES |  | NULL | AI生出力。保存範囲は最小限 |
| created\_by | uuid | NO | FK users.id |  | 生成または作成者 |
| created\_at | timestamptz | NO |  | now() | 作成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **16\. ticket\_candidates**

正式Ticketと分離することが重要。AI誤抽出の修正・却下・承認履歴を保持し、承認なしの自動登録を防止する。

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | AI候補ID |
| project\_id | uuid | NO | FK projects.id |  | プロジェクトID |
| meeting\_id | uuid | NO | FK meetings.id |  | 元会議 |
| minutes\_id | uuid | YES | FK meeting\_minutes.id | NULL | 元議事録 |
| title | varchar(300) | NO |  |  | 候補タイトル |
| description | text | YES |  | NULL | 候補詳細 |
| type | varchar(30) | NO | CHECK | task | task / issue / decision / followup |
| priority | varchar(20) | YES | CHECK | NULL | AI推定優先度 |
| assignee\_id | uuid | YES | FK users.id | NULL | AI推定担当者 |
| due\_date | date | YES |  | NULL | AI推定期限 |
| source\_transcript\_ids | jsonb | YES |  | \[\] | 根拠となるtranscript ID配列 |
| source\_start\_seconds | numeric(12,3) | YES |  | NULL | 代表根拠発言の開始秒 |
| source\_quote | text | YES |  | NULL | 根拠の短い引用または要約 |
| confidence | numeric(5,4) | YES | CHECK 0\<=x\<=1 | NULL | AI信頼度 |
| status | varchar(20) | NO | CHECK | pending | pending / approved / rejected / registered |
| registered\_ticket\_id | uuid | YES | FK tickets.id / UNIQUE | NULL | 正式登録後のチケットID |
| ai\_model | varchar(100) | YES |  | NULL | 生成モデル識別子 |
| created\_at | timestamptz | NO |  | now() | 生成日時 |
| updated\_at | timestamptz | NO |  | now() | 更新日時 |

# **17\. audit\_logs**

| カラム | 型 | NULL | キー/制約 | Default | 説明 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| id | uuid | NO | PK | gen\_random\_uuid() | 監査ログID |
| organization\_id | uuid | NO | FK organizations.id |  | 組織ID |
| user\_id | uuid | YES | FK users.id | NULL | 操作ユーザー |
| action | varchar(100) | NO |  |  | 操作種別 |
| resource\_type | varchar(50) | NO |  |  | 対象種別 |
| resource\_id | uuid | YES |  | NULL | 対象ID |
| metadata | jsonb | YES |  | {} | 操作詳細。機密情報は格納しない |
| created\_at | timestamptz | NO |  | now() | 発生日時 |

# **18\. インデックス設計**

| テーブル | インデックス | 種別 | 目的 |
| :---- | :---- | :---- | :---- |
| organization\_members | idx\_org\_members\_user (user\_id) | BTREE | ユーザー所属組織検索 |
| projects | idx\_projects\_org\_status (organization\_id, status) | BTREE | 組織内プロジェクト一覧 |
| project\_members | idx\_project\_members\_user (user\_id) | BTREE | 参加プロジェクト検索 |
| tickets | idx\_tickets\_project\_status (project\_id, status) | BTREE | 一覧・カンバン |
| tickets | idx\_tickets\_project\_assignee (project\_id, assignee\_id) | BTREE | 担当者絞り込み |
| tickets | idx\_tickets\_due\_date (due\_date) | BTREE | 期限検索 |
| meetings | idx\_meetings\_project\_date (project\_id, meeting\_date DESC) | BTREE | 会議履歴 |
| meeting\_transcripts | uq\_transcript\_sequence (meeting\_id, sequence\_no) | UNIQUE | 発言順保証 |
| meeting\_minutes | uq\_minutes\_version (meeting\_id, version) | UNIQUE | 版管理 |
| ticket\_candidates | idx\_candidates\_meeting\_status (meeting\_id, status) | BTREE | 候補確認画面 |
| ticket\_candidates | idx\_candidates\_project\_status (project\_id, status) | BTREE | プロジェクト横断候補検索 |
| audit\_logs | idx\_audit\_org\_created (organization\_id, created\_at DESC) | BTREE | 監査検索 |

# **19\. 外部キー・削除方針**

| 親 | 子 | ON DELETE | 考え方 |
| :---- | :---- | :---- | :---- |
| organizations | projects / organization\_members | RESTRICT | テナントデータの意図しない全削除を防止 |
| projects | tickets / meetings / project\_members | RESTRICT | プロジェクト削除はMVPではarchivedを使用 |
| meetings | transcripts / minutes / candidates / recordings | RESTRICT | AIトレーサビリティ維持 |
| users | member系 / created\_by / assignee | RESTRICT または SET NULL | 履歴保持が必要な項目は削除禁止、任意担当者はSET NULL検討 |
| ticket\_candidates | tickets.source\_candidate\_id | RESTRICT | AI候補と正式チケットの関係を保持 |
| tickets | ticket\_comments | CASCADE可 | チケットの明示的な物理削除を将来許容する場合のみ |

# **20\. ステータス遷移**

| 対象 | 遷移 |
| :---- | :---- |
| meetings | scheduled → recording → processing → completed / failed |
| meeting\_minutes | draft → review → approved |
| ticket\_candidates | pending → approved → registered、または pending/approved → rejected |
| tickets | todo → in\_progress → blocked / done（doneからの再オープンは将来対応可） |
| meeting\_recordings | uploading → uploaded → processing → completed / failed |

# **21\. トランザクション設計**

* AIチケット正式登録時は、tickets INSERT、ticket\_candidates.status=registered、registered\_ticket\_id更新を単一トランザクションで実行する。  
* 一括承認・一括登録は候補ごとのエラーを返せるよう、MVPでは全件原子的にするか部分成功にするかAPI詳細設計で確定する。推奨は「全件原子的」から開始する。  
* 会議処理開始・完了・失敗のstatus更新は、AI処理結果の保存と整合する順序で更新する。  
* meeting\_minutesの新version作成時は、同一meetingのversion採番競合を防ぐためトランザクションまたは一意制約リトライを利用する。

# **22\. AIデータ設計**

| 対象 | 保存方針 | 理由 |
| :---- | :---- | :---- |
| minutes.summary | TEXT | UI表示・全文検索しやすい |
| decisions/action\_items/issues/pending\_items | JSONB | MVPの構造変更に耐えやすい |
| ticket candidate主要属性 | 正規化カラム | 絞り込み・編集・正式登録しやすい |
| source\_transcript\_ids | JSONB配列 | 1候補が複数発言を根拠にできる |
| ai\_raw\_output | JSONB | 障害解析・再現性用。ただし保存期間・PIIに注意 |
| ai\_model | VARCHAR | モデル差分による結果追跡用 |

AIレスポンスはBedrockから受け取った直後にZod/JSON Schemaで検証し、検証成功後のみDBへ保存する。ブラウザから直接AI出力をDB登録しない。

# **23\. マルチテナント・認可設計**

* organization\_idをテナント境界とし、project経由の子データも必ず組織所属を検証する。  
* APIは「ログインユーザー → organization\_members → project\_members」の順に権限を評価する。  
* project viewerは参照のみ、memberはチケット・会議操作、ownerはメンバー管理を可能とする方針。  
* Neon/PostgreSQLのRLS採用はMVP実装複雑度とのバランスでAPI詳細設計時に確定。採用しない場合でも全クエリでテナント条件を必須化する。

# **24\. セキュリティ・データ保持**

* 録音・録画ファイル本体はS3へ保存し、DBにはs3\_key等のメタデータのみ保存する。  
* 署名付きURLは短時間有効としてサーバー側で発行し、S3バケットを公開しない。  
* 会議文字起こし・AI raw outputには個人情報や機密情報が含まれる可能性があるため、ログへの複製を避ける。  
* 監査ログには誰が・いつ・何を行ったかを残し、会議本文そのものをmetadataへ大量保存しない。  
* データ保持期間、録音削除、退会・組織削除時の取り扱いは利用規約・運用設計と合わせて確定する。

# **25\. Drizzle ORM実装構成**

| ファイル例 | 定義 |
| :---- | :---- |
| lib/db/schema/users.ts | users |
| lib/db/schema/organizations.ts | organizations / organization\_members |
| lib/db/schema/projects.ts | projects / project\_members |
| lib/db/schema/tickets.ts | tickets / ticket\_comments / ticket\_candidates |
| lib/db/schema/meetings.ts | meetings / meeting\_participants / meeting\_transcripts / meeting\_recordings / meeting\_minutes |
| lib/db/schema/audit.ts | audit\_logs |
| lib/db/schema/index.ts | 全schema export / relations |

# **26\. マイグレーション・環境方針**

* Drizzle Kitでmigration SQLを生成しGitHub管理する。  
* ローカル/開発/ステージング/本番でDBを分離し、本番への手動DDL適用を避ける。  
* 破壊的migrationはexpand → migrate data → contractの段階適用を基本とする。  
* 初期データはstatus/type/role等をアプリ定数で管理し、マスタテーブル乱立を避ける。

# **27\. MVP実装優先度**

| 優先度 | 対象 | 備考 |
| :---- | :---- | :---- |
| P0 | users / organizations / organization\_members | 認証・テナント基盤 |
| P0 | projects / project\_members | プロジェクト基盤 |
| P0 | tickets / ticket\_comments | 通常のプロジェクト管理 |
| P0 | meetings / transcripts / minutes / ticket\_candidates | AIプロジェクトマネージャーの中核 |
| P0 | 主要インデックス / audit\_logs | 運用・追跡性 |
| P1 | meeting\_recordings | オンライン会議・録音機能の段階導入 |
| P1 | 非同期AIジョブ管理テーブル | SQS/Lambda導入時に追加 |
| P2 | 通知 / 外部連携 / 分析データ | MVP後 |

# **28\. 初期Migration作成順序**

1\. users

2\. organizations → organization\_members

3\. projects → project\_members

4\. meetings → meeting\_participants → meeting\_transcripts → meeting\_recordings

5\. meeting\_minutes

6\. ticket\_candidates

7\. tickets → ticket\_comments

8\. ticket\_candidates.registered\_ticket\_id等の循環FKを後段migrationで追加

9\. audit\_logs

10\. indexes / check constraints

ticket\_candidatesとticketsは相互参照があるため、初期migrationでは片方向FKを先に作成し、後続migrationで逆方向FKを追加すると実装が安定する。

# **29\. データ登録フロー例**

| 処理 | 主なDB操作 |
| :---- | :---- |
| 1\. 会議作成 | meetings INSERT / participants INSERT |
| 2\. 会議実施 | recordings INSERT、transcriptsを逐次または会議後にINSERT |
| 3\. AI議事録生成 | meeting.status=processing → meeting\_minutes INSERT |
| 4\. AIチケット候補生成 | ticket\_candidates INSERT（status=pending） |
| 5\. 人間レビュー | candidateのtitle/assignee/due\_date等をPATCH、approved/rejectedへ更新 |
| 6\. 正式登録 | tickets INSERT \+ candidate registered更新をtransaction実行 |
| 7\. 参照 | ticket → source\_candidate → meeting → transcriptへ遡る |

# **30\. DB受入条件**

* 異なるorganizationのデータを通常API経由で参照・更新できない。  
* AI候補は承認前にticketsへ登録されない。  
* 正式Ticketから元meetingと根拠transcriptを追跡できる。  
* 同一meetingのtranscript sequence\_noとminutes versionが重複しない。  
* 正式チケット登録処理で途中失敗してもcandidateとticketが不整合にならない。  
* 主要一覧クエリが想定インデックスを利用できる設計になっている。

# **31\. API・詳細設計への引継ぎ事項**

* Auth.jsまたはCognitoの採用決定後、usersテーブルとの同期方式を確定する。  
* 各status/type/roleをPostgreSQL ENUMにするかVARCHAR+CHECKにするか最終決定する。現時点ではmigration容易性を優先してVARCHAR+CHECKを推奨する。  
* AI議事録・ticket candidateのJSON Schemaを確定する。  
* 一括チケット登録APIのトランザクション単位を確定する。  
* RLS採用可否と、採用時のorganization/project policyを確定する。  
* 録音・文字起こし・AI raw outputの保持期間と削除バッチ設計を確定する。

# **32\. 設計上の重要判断**

本サービスでは、AIが生成した内容を直接ticketsへ格納せず、ticket\_candidatesを独立テーブルとして設ける。これにより、ユーザーがAI候補を修正・承認・却下でき、生成根拠をtranscriptまで遡って確認できる。これは単なるタスク管理SaaSではなく、「会議から仕事を自動構造化するAIプロジェクトマネージャー」としての中核データ設計である。