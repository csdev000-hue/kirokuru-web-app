**AIプロジェクトマネージャー**  
**基本設計書**

Meeting → AI議事録 → AIチケット → プロジェクト管理

作成日：2026年9月7日  
版数：1.0

# **1\. 基本設計概要**

本書は、AIプロジェクトマネージャーの要件定義をもとに、システムを実装するためのアプリケーション構成、画面、API、データ、AI処理、権限、外部サービス連携を定義する。

| 項目 | 設計方針 |
| :---- | :---- |
| アーキテクチャ | Webアプリ \+ サーバーAPI \+ PostgreSQL \+ Bedrock |
| フロントエンド | Next.js / TypeScript |
| バックエンド | Next.js Route Handlers / Vercel Functions |
| DB | Neon PostgreSQL \+ Drizzle ORM |
| AI | Amazon Bedrock / Nova Lite |
| ストレージ | Amazon S3 |
| 会議 | WebRTC \+ SFU |
| ソース管理 | GitHub |

# **2\. システム全体構成**

ブラウザからDBやBedrockへ直接アクセスせず、Vercel上のサーバーAPIを経由する。会議音声・録画等の大容量データはS3等のストレージを利用し、AI処理はサーバー側で実行する。

| レイヤー | コンポーネント | 役割 |
| :---- | :---- | :---- |
| Client | Next.js / React | 画面表示・ユーザー操作 |
| API | Route Handlers | 認証、認可、業務処理 |
| Data | Neon PostgreSQL | 業務データ・AI結果・権限 |
| ORM | Drizzle | DBアクセス・型安全性 |
| AI | Amazon Bedrock | 議事録・チケット候補生成 |
| Storage | Amazon S3 | 録画・音声・添付ファイル |
| Meeting | WebRTC \+ SFU | 多人数音声・映像通信 |
| Async | SQS \+ Lambda（将来） | 長時間AI処理の非同期化 |

# **3\. アプリケーション構成**

| 領域 | 構成 |
| :---- | :---- |
| 画面 | app/ 配下のNext.js App Router |
| 共通UI | components/ |
| 認証 | lib/auth/ |
| DB | lib/db/ \+ drizzle/ |
| AI | lib/bedrock/ |
| S3 | lib/s3/ |
| 権限 | lib/permissions/ |
| API | app/api/ |
| テスト | tests/ |

画面コンポーネントとサーバー処理を分離し、AI・DB・認証処理を画面側へ直接記述しない。

# **4\. 画面基本設計**

| 画面ID | 画面名 | 主要機能 |
| :---- | :---- | :---- |
| SCR-001 | ログイン | 認証 |
| SCR-002 | ダッシュボード | プロジェクト状況、課題・会議概要 |
| SCR-003 | 課題一覧 | 検索、絞り込み、課題作成 |
| SCR-004 | ボード | ステータス別課題管理 |
| SCR-005 | 課題詳細 | 課題編集、コメント、履歴 |
| SCR-006 | オンライン会議 | 音声、映像、共有、チャット |
| SCR-007 | AI議事録確認 | AI結果の確認・編集・承認 |
| SCR-008 | AIチケット確認 | 候補選択・編集・登録 |
| SCR-009 | 会議一覧/詳細 | 会議・議事録の参照 |
| SCR-010 | プロジェクト設定 | メンバー・基本設定 |

# **5\. 画面遷移設計**

ログイン → ダッシュボード → 課題一覧 / ボード / 会議一覧

会議一覧 → オンライン会議 → AI議事録確認 → AIチケット確認 → 課題一覧 → 課題詳細

課題一覧 ↔ ボード → 課題詳細

課題詳細 → 元会議/議事録

画面遷移時は、対象Organization/Projectへのアクセス権をサーバー側で再確認する。

# **6\. 共通UI設計**

| 項目 | 設計 |
| :---- | :---- |
| レイアウト | 左サイドバー \+ ヘッダー \+ メインコンテンツ |
| 通知 | 成功/警告/エラーをToast等で表示 |
| ローディング | API/AI処理中はSkeletonまたはProgress表示 |
| エラー | ユーザー向けメッセージ \+ 開発者向けログ |
| 確認 | 削除・一括登録等は確認ダイアログ |
| レスポンシブ | PC優先。主要機能はタブレット/スマホ対応 |
| アクセシビリティ | キーボード操作、ラベル、十分なコントラストを考慮 |

# **7\. 認証・認可設計**

認証はAuth.jsまたはAmazon Cognitoを候補とし、MVPでは実装コストを考慮して選定する。認証で取得したユーザーIDをもとに、APIでOrganizationMemberおよびProjectMemberを確認する。

* Authentication：ユーザーが誰かを判定  
* Authorization：対象組織・プロジェクトで何ができるかを判定  
* 全APIで権限チェックを実施  
* 他テナントのIDを指定したアクセスを拒否  
* Viewer等の更新不可権限では書き込みAPIを拒否

# **8\. DB基本設計**

| テーブル | 主なキー/関連 |
| :---- | :---- |
| users | id |
| organizations | id |
| organization\_members | organization\_id \+ user\_id |
| projects | id / organization\_id |
| project\_members | project\_id \+ user\_id |
| tickets | id / project\_id / assignee\_id / source\_meeting\_id |
| meetings | id / project\_id / created\_by |
| meeting\_participants | meeting\_id \+ user\_id |
| meeting\_transcripts | meeting\_id / speaker / timestamp |
| meeting\_minutes | meeting\_id |
| meeting\_recordings | meeting\_id / S3 key |
| comments | id / ticket\_id / user\_id |

# **9\. データ関連**

Organization 1:N Project、Project N:M User、Project 1:N Ticket、Project 1:N Meeting、Meeting 1:N Transcript、Meeting 1:1または履歴型のMinutes、Meeting 1:N Ticket候補/登録済みTicketという関係を基本とする。

Ticket.source\_meeting\_idを起点として、元会議→文字起こし→議事録→チケットまで追跡可能な設計とする。

# **10\. API基本設計**

| API | 処理 | 認可 |
| :---- | :---- | :---- |
| GET/POST /api/organizations | 組織取得/作成 | 組織権限 |
| GET/PATCH /api/organizations/:id | 組織取得/更新 | 組織Member/Owner |
| GET/POST /api/projects | プロジェクト取得/作成 | 組織Member |
| GET/PATCH/DELETE /api/projects/:id | 取得/更新/削除 | Project権限 |
| GET/POST /api/projects/:projectId/tickets | 一覧/作成 | Project権限 |
| GET/PATCH/DELETE /api/tickets/:id | 取得/更新/削除 | Project権限 |
| GET/POST /api/projects/:projectId/meetings | 会議取得/作成 | Project権限 |
| GET/PATCH/DELETE /api/meetings/:id | 取得/更新/削除 | Project権限 |
| POST /api/ai/generate-minutes | AI議事録生成 | Project権限 |
| POST /api/ai/generate-tickets | AIチケット候補生成 | Project権限 |
| POST /api/tickets/bulk | 承認候補一括登録 | Project Owner/Member |

# **11\. API共通仕様**

* Content-TypeはJSONを基本とする。  
* 認証情報はセッション/トークンから取得し、リクエストパラメータのuserIdを信用しない。  
* 入力値はサーバー側でバリデーションする。  
* エラーはHTTPステータスと機械判定可能なerror codeを返す。  
* AIレスポンスはJSON Schema/Zod等で検証する。  
* 一覧APIはページングを基本とする。  
* 監査対象の更新処理は変更履歴を保存する。

# **12\. AI議事録処理設計**

入力：MeetingTranscript。処理：Vercel API → Bedrock → 構造化JSON検証 → MeetingMinutes保存。

| 出力項目 | 内容 |
| :---- | :---- |
| summary | 会議全体の要約 |
| decisions | 決定事項 |
| actionItems | 実施事項 |
| issues | 課題・問題 |
| pendingItems | 保留事項 |
| participants | 関係者 |
| sourceReferences | 発話時刻等の根拠 |

AIが根拠なく担当者や期限を生成することを防ぐため、確定情報とAI推定候補を区別する。

# **13\. AIチケット生成設計**

議事録を入力し、チケット候補をJSON配列で生成する。候補は一時データとして保持し、ユーザー確認後にTicketへ登録する。

| 項目 | 設計 |
| :---- | :---- |
| title | 必須 |
| description | 背景・作業内容 |
| type | Task / Issue / Bug等 |
| priority | High / Medium / Low |
| assignee | ユーザーID候補 |
| dueDate | 期限候補 |
| sourceMeetingId | 元会議 |
| sourceReference | 根拠となる議事録/発話 |

候補生成と登録を分離することで、誤生成による不要チケットの大量登録を防止する。

# **14\. オンライン会議設計**

ブラウザとSFU間でWebRTC通信を行う。会議制御・参加者情報はアプリAPIで管理し、音声データの文字起こし処理はSpeech-to-Text基盤と連携する。

* 入室時にMeeting権限を確認  
* マイク/カメラ状態を同期  
* 画面共有を提供  
* チャットを提供  
* 文字起こしON/OFF状態を表示  
* 会議終了時にTranscriptを確定  
* 録画を行う場合は同意・保存期間等の仕様を別途定義

# **15\. ファイル・ストレージ設計**

* S3バケットは用途別プレフィックスで分離する。  
* DBにはS3のURLではなくオブジェクトキー等の参照情報を保持する。  
* ブラウザからS3へ直接アップロードする場合は署名付きURLを利用する。  
* 録画・音声ファイルにはアクセス権を設定する。  
* 不要ファイルの削除・保持期間を将来ライフサイクルルールで管理する。

# **16\. セキュリティ設計**

* HTTPSを必須とする。  
* 秘密情報は環境変数/Secrets管理し、Gitへ登録しない。  
* Bedrock等のAWS認証情報をブラウザへ渡さない。  
* SQLインジェクション対策としてORM/パラメータ化クエリを利用する。  
* XSS対策としてユーザー入力を適切にエスケープする。  
* APIでテナント境界を検証する。  
* AIへの入力に機密情報が含まれる可能性を考慮し、ログへ全文を出力しない。

# **17\. エラー・リトライ設計**

| 対象 | 方針 |
| :---- | :---- |
| DBエラー | ユーザーへ再試行を案内し、詳細はサーバーログ |
| Bedrockエラー | 指数バックオフ等を考慮し、最終的に再実行可能状態 |
| AI JSON不正 | スキーマ検証で拒否し、再生成/再試行 |
| 通信切断 | 画面状態を保持し再接続を可能にする |
| 二重登録 | 冪等性キーまたは候補IDを利用して防止 |

# **18\. ログ・監査設計**

* アプリケーションエラーをサーバーログへ記録  
* AI処理の開始・成功・失敗を記録  
* チケット作成/更新/削除の操作履歴を保持  
* AI生成物には生成日時・生成元会議・承認者を保持  
* 個人情報・会議全文等の過剰なログ出力を避ける

# **19\. 開発・デプロイ設計**

| 項目 | 方針 |
| :---- | :---- |
| Repository | GitHub |
| Branch | main \+ feature/\*等 |
| CI | Pull Request時にLint/Test/Build |
| Preview | Vercel Preview |
| Production | mainマージ後にデプロイ |
| DB Migration | Drizzle MigrationをGit管理 |
| 環境 | local / preview / productionを分離 |
| Secrets | Vercel/AWS等のSecret管理機能を利用 |

# **20\. テスト基本方針**

* Unit Test：AIプロンプト変換、JSON検証、権限判定、業務ロジック  
* API Test：認証、認可、CRUD、異常系  
* E2E Test：ログイン→会議→議事録→AIチケット→登録  
* AI Test：代表的な議事録に対する出力品質・必須項目・幻覚の確認  
* Security Test：他Organization/Projectへの不正アクセス確認

# **21\. MVP実装順序**

| Step | 実装 |
| :---- | :---- |
| 1 | Next.js基盤・認証・共通レイアウト |
| 2 | Organization / Project / Member |
| 3 | Ticket CRUD \+ 一覧 \+ 詳細 |
| 4 | Board |
| 5 | Meeting登録 \+ Minutes |
| 6 | Bedrock AI議事録 |
| 7 | AIチケット候補 \+ 承認 \+ 登録 |
| 8 | トレーサビリティ |
| 9 | オンライン会議 \+ 文字起こし |
| 10 | テスト・セキュリティ・本番デプロイ |

# **22\. 基本設計上の重要判断**

* MVPの中心価値を「会議からチケット化」に置く。  
* AIによる自動登録ではなく、人による承認を必須とする。  
* 会議→議事録→チケットの出典を一貫して保持する。  
* VercelをWeb/APIの入口とし、AI・DB・S3はサーバー経由で利用する。  
* オンライン会議基盤は自前実装を最小化し、WebRTC \+ SFUを採用する。  
* 将来のBacklog/GitHub/Slack連携を考慮してTicketドメインを独立させる。

# **23\. 要件定義から詳細設計への引継ぎ事項**

* DBカラム、型、インデックス、外部キーの確定  
* APIリクエスト/レスポンスJSONの確定  
* 認証方式（Auth.js/Cognito）の確定  
* SFUおよびSpeech-to-Textサービスの選定  
* AIプロンプト・JSON Schemaの確定  
* 画面項目・バリデーション・状態遷移の確定  
* エラーコード一覧の作成  
* テストケース・受入基準の詳細化