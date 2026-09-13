**AIプロジェクトマネージャー**  
**画面詳細設計書**

Version 1.0 / MVP

対象：Next.js Web Application

# **1\. 文書概要**

本書は「AIプロジェクトマネージャー」のMVP画面仕様を、実装・レビュー・テストに使用できる粒度で定義する。要件定義書、基本設計書、DB設計書、API詳細設計書を前提とし、画面ごとの表示項目、操作、入力制約、状態別表示、権限、API連携を明確化する。

| 項目 | 内容 |
| :---- | :---- |
| 対象システム | AIプロジェクトマネージャー |
| フロントエンド | Next.js \+ TypeScript |
| 主要利用環境 | PCブラウザをMVPの主対象とし、基本的なレスポンシブ表示に対応 |
| デザイン方針 | 情報量の多い業務画面として、左ナビゲーション \+ ヘッダー \+ メインコンテンツを基本 |
| 中核ユーザーフロー | 会議 → 文字起こし → AI議事録 → AIチケット候補 → 人間確認 → 正式チケット |
| 認可境界 | Organization / Project membershipに基づく |
| 対象外 | ネイティブモバイル専用UI、外部PMツール連携画面、高度分析ダッシュボード |

# **2\. 画面一覧**

| 画面ID | 画面名 | URL | 機能分類 | 利用者 | 優先度 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| SCR-001 | ログイン | /login | 認証 | 未認証ユーザー | P0 |
| SCR-010 | ダッシュボード | /dashboard | ホーム | ログインユーザー | P0 |
| SCR-020 | 組織一覧 | /organizations | 組織 | ログインユーザー | P0 |
| SCR-021 | 組織詳細・メンバー管理 | /organizations/:organizationId | 組織 | owner / member | P0 |
| SCR-030 | プロジェクト一覧 | /projects | プロジェクト | 所属ユーザー | P0 |
| SCR-031 | プロジェクト詳細 | /projects/:projectId | プロジェクト | project member | P0 |
| SCR-040 | チケット一覧 | /projects/:projectId/tickets | チケット | project member/viewer | P0 |
| SCR-041 | カンバンボード | /projects/:projectId/board | チケット | project member/viewer | P0 |
| SCR-042 | チケット詳細・編集 | /tickets/:ticketId | チケット | project member/viewer | P0 |
| SCR-050 | 会議一覧 | /projects/:projectId/meetings | 会議 | project member/viewer | P0 |
| SCR-051 | オンライン会議 | /meetings/:meetingId/live | 会議 | meeting participant | P1 |
| SCR-052 | 会議詳細 | /meetings/:meetingId | 会議 | project member/viewer | P0 |
| SCR-053 | AI議事録確認 | /meetings/:meetingId/minutes | AI | project member/viewer | P0 |
| SCR-054 | AIチケット候補確認 | /meetings/:meetingId/candidates | AI | project member/viewer | P0 |

# **3\. 共通画面構成**

ログイン後画面は、以下の共通レイアウトを基本とする。

| 領域 | 仕様 |
| :---- | :---- |
| グローバルナビ | 左固定。ダッシュボード、プロジェクト、必要に応じ組織管理への導線を表示。現在地を強調。 |
| ヘッダー | 組織/プロジェクト文脈、ページタイトル、ユーザーメニューを表示。 |
| パンくず | Project配下など階層が深い画面で表示。 |
| メイン領域 | 一覧、詳細、フォーム、会議UIを表示。最大幅は画面用途に応じ可変。 |
| 通知 | 成功はToast、入力エラーは対象項目直下、致命的エラーはページ内AlertまたはError画面。 |
| 確認ダイアログ | 削除、会議終了、AI候補の破棄など不可逆操作で使用。 |
| ローディング | ページ初期読込はSkeleton、ボタン処理は対象ボタン内Spinner \+ 二重送信抑止。 |
| 空状態 | データが0件の場合は説明 \+ 主操作CTAを表示。 |

# **4\. 共通UIルール**

| 項目 | ルール |
| :---- | :---- |
| 主ボタン | 1画面内の主要アクションは原則1種類。例：新規作成、保存、承認して登録。 |
| 危険操作 | 削除・却下などは視覚的に区別し、確認ダイアログを出す。 |
| 日付 | 表示はユーザーのローカルタイム。DBはUTC。日付のみはYYYY/MM/DD。 |
| ステータス | 文字 \+ Badge。色だけで意味を伝えない。 |
| 権限不足 | ボタン非表示またはdisabledではなく、閲覧可能・操作不可の意図に応じて統一。直接URLアクセスは403。 |
| 一覧ページング | MVPはcursorまたはpage方式。20〜50件/ページを想定。 |
| 検索 | 明示的な検索ボックスまたは即時フィルタ。API負荷が高いものは300ms程度のdebounceを想定。 |
| 変更破棄 | 編集画面から未保存で遷移する場合は確認を出す。 |
| アクセシビリティ | フォームlabel、キーボード操作、focus表示、aria属性、十分なコントラストを確保。 |

# **5\. レスポンシブ方針**

| 幅 | 基本仕様 |
| :---- | :---- |
| 1280px以上 | 標準。左ナビ常時表示、一覧は複数列表示。 |
| 768〜1279px | 左ナビ縮小/折りたたみ。表は優先度の低い列を非表示または横スクロール。 |
| 767px以下 | MVPでは利用可能性を確保するが最適化対象外。会議画面・カンバンは横スクロールを許容。 |

# **6\. 画面遷移設計**

主要遷移は以下とする。

| \[SCR-001 ログイン\]        ↓\[SCR-010 ダッシュボード\]   ├─→ \[SCR-020 組織一覧\] → \[SCR-021 組織詳細\]   └─→ \[SCR-030 プロジェクト一覧\] → \[SCR-031 プロジェクト詳細\]                                      ├─→ \[SCR-040 チケット一覧\]                                      │       ├─→ \[SCR-041 カンバン\]                                      │       └─→ \[SCR-042 チケット詳細\]                                      └─→ \[SCR-050 会議一覧\]                                              └─→ \[SCR-052 会議詳細\]                                                      ├─→ \[SCR-051 オンライン会議\]                                                      ├─→ \[SCR-053 AI議事録確認\]                                                      └─→ \[SCR-054 AIチケット候補確認\]                                                              └─→ \[SCR-042 正式チケット詳細\] |
| :---- |

| 遷移元 | 操作 | 遷移先 | パラメータ/条件 |
| :---- | :---- | :---- | :---- |
| SCR-010 | プロジェクト選択 | SCR-031 | projectId |
| SCR-031 | チケット一覧 | SCR-040 | projectId |
| SCR-031 | 会議一覧 | SCR-050 | projectId |
| SCR-050 | 会議選択 | SCR-052 | meetingId |
| SCR-052 | 会議参加 | SCR-051 | meeting.statusがscheduled/recording |
| SCR-052 | 議事録確認 | SCR-053 | 文字起こしが存在 |
| SCR-053 | チケット候補生成 | SCR-054 | minutesが保存済み |
| SCR-054 | 正式登録後チケット選択 | SCR-042 | registeredTicketId |

# **SCR-001 ログイン**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-001 |
| 画面名 | ログイン |
| URL | /login |
| 目的 | ユーザーを認証し、利用可能な組織・プロジェクトへアクセスさせる。 |
| 認証 | 不要 |
| 利用権限 | 未認証ユーザー |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | サービスロゴ/名称 | 表示 | \- | AIプロジェクトマネージャー | ブランド表示 |
| 2 | メールアドレス | TextBox | ○ |  | email autocomplete |
| 3 | パスワード | Password | ○ |  | 認証方式で必要な場合 |
| 4 | ログイン | Button | \- |  | 主ボタン |
| 5 | エラーメッセージ | Alert | \- | 非表示 | 認証失敗時に表示 |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | ログイン | ログイン押下 | 入力検証後、認証APIを実行 | /dashboardへ遷移 | 認証エラーを画面内表示 |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| メール | 必須、メール形式 | メールアドレスを入力してください / 形式が正しくありません |
| パスワード | 認証方式の最小要件に従う | パスワードを入力してください |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| 認証処理中 | 入力とボタンを無効化、Spinner表示 | 待機 |
| 認証失敗 | 入力値のうちメールは保持 | 修正して再実行 |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 認証 | POST | /api/auth/... | Auth.js/Cognito等の認証処理。実装方式に合わせる |

# **SCR-010 ダッシュボード**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-010 |
| 画面名 | ダッシュボード |
| URL | /dashboard |
| 目的 | 参加プロジェクト、未完了タスク、直近会議を集約し、作業開始地点を提供する。 |
| 認証 | 必須 |
| 利用権限 | ログインユーザー |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | ページタイトル | 表示 | \- | ダッシュボード |  |
| 2 | 参加プロジェクト | Card/List | \- | アクセス可能プロジェクト | クリックでプロジェクト詳細 |
| 3 | 自分の未完了タスク | List | \- | assignee=current user | 期限・優先度を表示 |
| 4 | 直近/予定会議 | List | \- | 直近開催順 | 会議詳細へ |
| 5 | 新規プロジェクト | Button | \- |  | 権限がある場合 |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | プロジェクトを開く | カード押下 | projectIdを保持して遷移 | SCR-031 | 404/403を表示 |
| 2 | タスクを開く | 行押下 | ticketIdで遷移 | SCR-042 | 404/403を表示 |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| 0件 | 空状態 \+ 「プロジェクトを作成」または「招待を待つ」説明 | 作成/戻る |
| 一部取得失敗 | 取得できたセクションは表示し、失敗部分に再読込 | 再試行 |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 参加プロジェクト | GET | /api/projects | ユーザーがアクセス可能なプロジェクト取得 |
| チケット概要 | GET | /api/projects/:projectId/tickets | 必要に応じ件数/直近タスク取得 |
| 会議概要 | GET | /api/projects/:projectId/meetings | 直近会議取得 |

# **SCR-020 組織一覧**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-020 |
| 画面名 | 組織一覧 |
| URL | /organizations |
| 目的 | 所属組織を一覧表示し、組織詳細へ遷移または新規組織を作成する。 |
| 認証 | 必須 |
| 利用権限 | ログインユーザー |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 組織一覧 | Card/List | \- | name / role | 選択で詳細 |
| 2 | 新規組織作成 | Button | \- |  | 作成ダイアログ表示 |
| 3 | 組織名 | TextBox | ○ |  | 作成ダイアログ内 |
| 4 | 作成 | Button | \- |  | 作成実行 |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 組織を開く | カード押下 | organizationIdで遷移 | SCR-021 | 権限エラー表示 |
| 2 | 新規組織 | 作成押下 | POST実行 | 一覧へ追加しSCR-021へ | 入力/サーバーエラー表示 |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| 組織名 | 1〜200文字、前後空白除去 | 組織名を入力してください / 200文字以内で入力してください |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 一覧取得 | GET | /api/organizations | 所属組織一覧 |
| 新規作成 | POST | /api/organizations | 組織作成 |

# **SCR-021 組織詳細・メンバー管理**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-021 |
| 画面名 | 組織詳細・メンバー管理 |
| URL | /organizations/:organizationId |
| 目的 | 組織情報・所属メンバー・ロールを確認し、ownerが管理する。 |
| 認証 | 必須 |
| 利用権限 | owner / member |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 組織名 | TextBox/表示 | ○ | organization.name | ownerのみ編集可 |
| 2 | メンバー一覧 | Table | \- | name/email/role |  |
| 3 | ロール | Select/Badge | ○ | owner/member | ownerのみ変更可 |
| 4 | 保存 | Button | \- |  | 変更時のみ活性 |
| 5 | プロジェクト一覧 | List | \- | 組織配下プロジェクト | プロジェクト詳細へ |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 保存 | 保存押下 | 差分PATCH | 更新Toast | 400/403/409表示 |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| 組織名 | 1〜200文字 | 必須/最大長エラー |
| ロール | owner/memberのみ | 選択値エラー |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| member閲覧 | 編集UIを非表示または読取専用 | 閲覧のみ |
| 最後のowner | owner解除不可 | 説明を表示 |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 詳細 | GET | /api/organizations/:id | 組織詳細 |
| 更新 | PATCH | /api/organizations/:id | 組織名等更新 |
| メンバー | GET | /api/organizations/:id/members | メンバー一覧（API実装時追加可） |

## **設計補足**

* MVPで招待APIを未実装の場合、メンバー追加UIは非表示または「今後対応」とし、実在しない操作を置かない。

# **SCR-030 プロジェクト一覧**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-030 |
| 画面名 | プロジェクト一覧 |
| URL | /projects |
| 目的 | アクセス可能なプロジェクトを一覧表示し、作成・検索・選択を行う。 |
| 認証 | 必須 |
| 利用権限 | organization member |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 組織フィルタ | Select | \- | 全組織/選択組織 | 複数組織所属時 |
| 2 | 検索 | SearchBox | \- |  | 名称検索 |
| 3 | 状態フィルタ | Select | \- | active | active/archived |
| 4 | プロジェクト一覧 | Table/Card | \- | name/status/updatedAt |  |
| 5 | 新規プロジェクト | Button | \- |  | 作成ダイアログ |
| 6 | 名称 | TextBox | ○ |  |  |
| 7 | 説明 | TextArea | \- |  |  |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 検索/絞込 | 入力変更 | 条件で再取得またはクライアント絞込 | 一覧更新 | 再読込導線 |
| 2 | 新規作成 | 作成押下 | POST | SCR-031へ | 入力エラー表示 |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| 名称 | 1〜200文字 | プロジェクト名を入力してください |
| 説明 | 任意、上限2000文字程度を推奨 | 入力可能文字数を超えています |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 一覧 | GET | /api/projects | アクセス可能プロジェクト |
| 作成 | POST | /api/projects | 新規プロジェクト |

# **SCR-031 プロジェクト詳細**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-031 |
| 画面名 | プロジェクト詳細 |
| URL | /projects/:projectId |
| 目的 | プロジェクトの概要と主要機能へのハブを提供する。 |
| 認証 | 必須 |
| 利用権限 | project owner/member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | プロジェクト名 | 表示/TextBox | ○ | name | owner/memberのみ編集 |
| 2 | 説明 | 表示/TextArea | \- | description |  |
| 3 | ステータス | Badge/Select | ○ | active/archived |  |
| 4 | チケットサマリ | Card | \- | todo/in\_progress/done件数 | 一覧へ |
| 5 | 直近会議 | List | \- | meeting\_date降順 | 会議詳細へ |
| 6 | チケット一覧 | Button/Link | \- |  | SCR-040 |
| 7 | カンバン | Button/Link | \- |  | SCR-041 |
| 8 | 会議一覧 | Button/Link | \- |  | SCR-050 |
| 9 | 新規会議 | Button | \- |  | 会議作成ダイアログ |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 編集保存 | 保存押下 | PATCH | Toast \+ 表示更新 | 400/403表示 |
| 2 | チケット一覧 | リンク押下 | 遷移 | SCR-040 |  |
| 3 | 新規会議 | 作成押下 | POST /meetings | SCR-052 | 入力エラー |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| プロジェクト名 | 1〜200文字 | 必須/最大長 |
| ステータス | active/archived | 選択値エラー |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 詳細 | GET | /api/projects/:id | プロジェクト詳細 |
| 更新 | PATCH | /api/projects/:id | プロジェクト更新 |
| チケット | GET | /api/projects/:projectId/tickets | サマリ表示 |
| 会議 | GET | /api/projects/:projectId/meetings | 直近会議 |

# **SCR-040 チケット一覧**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-040 |
| 画面名 | チケット一覧 |
| URL | /projects/:projectId/tickets |
| 目的 | プロジェクトのチケットを検索・絞込・作成し、詳細へ遷移する。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 検索 | SearchBox | \- |  | title/description |
| 2 | ステータス | MultiSelect | \- | 全て | todo/in\_progress/done/blocked |
| 3 | 担当者 | Select | \- | 全員 | project member |
| 4 | 優先度 | MultiSelect | \- | 全て | low/medium/high/urgent |
| 5 | 期限 | DateFilter | \- |  | 期限範囲 |
| 6 | チケット一覧 | Table | \- | title/type/status/priority/assignee/due | 行選択で詳細 |
| 7 | 新規チケット | Button | \- |  | viewerは非表示 |
| 8 | 表示切替 | Tabs/Link | \- | 一覧 | 一覧/カンバン |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 絞込 | 条件変更 | クエリをURLへ反映しGET | 一覧更新 | フィルタ保持 \+ エラー |
| 2 | チケット選択 | 行押下 | ticketIdで遷移 | SCR-042 | 404/403 |
| 3 | 新規作成 | 保存押下 | POST | 作成後SCR-042 | 400/403 |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| タイトル | 1〜300文字 | タイトルを入力してください |
| 期限 | 有効な日付 | 日付を確認してください |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| 0件 | 条件に応じた空状態。フィルタ中は解除導線 | 新規作成/フィルタ解除 |
| viewer | 新規作成・編集導線を非表示 | 閲覧のみ |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 一覧 | GET | /api/projects/:projectId/tickets | 検索・filter・pagination |
| 作成 | POST | /api/projects/:projectId/tickets | 手動チケット作成 |

# **SCR-041 カンバンボード**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-041 |
| 画面名 | カンバンボード |
| URL | /projects/:projectId/board |
| 目的 | チケットをステータス別に視覚化し、進捗を更新する。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | フィルタ | FilterBar | \- | 担当者/優先度 | 一覧画面と共通条件 |
| 2 | TODO列 | BoardColumn | \- | status=todo |  |
| 3 | 進行中列 | BoardColumn | \- | status=in\_progress |  |
| 4 | 完了列 | BoardColumn | \- | status=done |  |
| 5 | ブロック列 | BoardColumn | \- | status=blocked |  |
| 6 | チケットカード | Card | \- | title/assignee/priority/due | クリックで詳細 |
| 7 | 新規チケット | Button | \- |  | viewer非表示 |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | ステータス変更 | Drag & Drop | optimistic update後PATCH | 移動確定 | 元位置へrollback \+ Toast |
| 2 | カードを開く | クリック | ticketIdで遷移 | SCR-042 |  |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| 更新中 | 対象カードのみ操作抑止 | 待機 |
| viewer | ドラッグ無効 | 閲覧のみ |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 一覧 | GET | /api/projects/:projectId/tickets | status別取得 |
| 更新 | PATCH | /api/tickets/:id | ドラッグ後status更新 |

## **設計補足**

* ドラッグ&ドロップだけに依存せず、キーボードまたは詳細画面からもstatus変更可能にする。

# **SCR-042 チケット詳細・編集**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-042 |
| 画面名 | チケット詳細・編集 |
| URL | /tickets/:ticketId |
| 目的 | チケット内容、進捗、担当、期限、会議由来の根拠、コメントを確認・編集する。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | タイトル | TextBox/Heading | ○ | title |  |
| 2 | 説明 | TextArea | \- | description |  |
| 3 | タイプ | Select | ○ | type | task/issue/decision/followup |
| 4 | ステータス | Select | ○ | status |  |
| 5 | 優先度 | Select | ○ | priority |  |
| 6 | 担当者 | Select | \- | assignee | project member |
| 7 | 期限 | DatePicker | \- | due\_date |  |
| 8 | 元会議 | Link | \- | source\_meeting\_id | 存在時のみ |
| 9 | AI根拠 | SourcePanel | \- | candidate/transcript | 発言時刻・根拠を表示 |
| 10 | コメント | Timeline | \- | createdAt昇順 |  |
| 11 | コメント入力 | TextArea | \- |  | viewerは非表示 |
| 12 | 保存 | Button | \- |  | 変更時のみ |
| 13 | 削除 | Button | \- |  | 確認ダイアログ |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 保存 | 保存押下 | PATCH | Toast \+ dirty解除 | フィールド/サーバーエラー |
| 2 | 削除 | 確認後実行 | DELETE | チケット一覧へ | 403/409/500 |
| 3 | 元会議 | リンク押下 | meetingIdで遷移 | SCR-052 |  |
| 4 | 根拠発言 | 根拠クリック | 会議詳細/議事録の該当時刻へ | 該当位置表示 | 存在しない場合説明 |
| 5 | コメント投稿 | 投稿押下 | POST | Timelineへ追加 | 入力エラー |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| タイトル | 1〜300文字 | タイトルを入力してください |
| タイプ | task/issue/decision/followup | 選択値エラー |
| ステータス | todo/in\_progress/done/blocked | 選択値エラー |
| 優先度 | low/medium/high/urgent | 選択値エラー |
| コメント | 空白のみ不可 | コメントを入力してください |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| AI由来 | 「会議から生成」Badge \+ 根拠パネル | 元発言確認 |
| viewer | 編集・削除・コメント投稿不可 | 閲覧のみ |
| 削除済み | 通常URLでは404相当または削除済み表示 | 一覧へ戻る |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 詳細 | GET | /api/tickets/:id | チケット詳細 |
| 更新 | PATCH | /api/tickets/:id | 編集保存 |
| 削除 | DELETE | /api/tickets/:id | 論理削除 |
| コメント取得/追加 | GET/POST | /api/tickets/:id/comments | コメント表示・追加 |

# **SCR-050 会議一覧**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-050 |
| 画面名 | 会議一覧 |
| URL | /projects/:projectId/meetings |
| 目的 | プロジェクト内の会議を一覧表示し、作成・検索・状態確認を行う。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 検索 | SearchBox | \- |  | title検索 |
| 2 | 状態 | Select | \- | 全て | scheduled/recording/processing/completed/failed |
| 3 | 会議一覧 | Table | \- | title/date/status/createdBy |  |
| 4 | 新規会議 | Button | \- |  | viewer非表示 |
| 5 | 会議名 | TextBox | ○ |  | 作成ダイアログ |
| 6 | 開催日時 | DateTimePicker | ○ | 現在時刻/指定 |  |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 会議選択 | 行押下 | meetingIdで遷移 | SCR-052 |  |
| 2 | 会議作成 | 作成押下 | POST | SCR-052 | 入力エラー |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| 会議名 | 1〜200文字 | 会議名を入力してください |
| 開催日時 | 有効な日時 | 開催日時を確認してください |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 一覧 | GET | /api/projects/:projectId/meetings | 会議一覧 |
| 作成 | POST | /api/projects/:projectId/meetings | 会議作成 |

# **SCR-051 オンライン会議**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-051 |
| 画面名 | オンライン会議 |
| URL | /meetings/:meetingId/live |
| 目的 | WebRTC会議を実施し、録音・参加者・AI処理の入力データを生成する。 |
| 認証 | 必須 |
| 利用権限 | meeting participant |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 会議タイトル | Heading | \- | meeting.title |  |
| 2 | 参加者グリッド | VideoGrid | \- | 映像/名前 |  |
| 3 | マイク | ToggleButton | \- | ON |  |
| 4 | カメラ | ToggleButton | \- | ON/環境依存 |  |
| 5 | 画面共有 | Button | \- |  | 対応ブラウザのみ |
| 6 | 録音状態 | Indicator | \- | 未録音/録音中 |  |
| 7 | 参加者一覧 | Panel | \- | display\_name |  |
| 8 | 字幕/文字起こし | Panel | \- | リアルタイム発言 | P1/P2で段階実装可 |
| 9 | 退出 | Button | \- |  | 自分のみ退出 |
| 10 | 会議終了 | DangerButton | \- |  | hostのみ |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 入室 | 画面表示 | デバイス許可→SFU接続 | 会議参加 | 接続エラー表示 |
| 2 | 録音開始 | host操作 | recording開始 \+ status更新 | 録音中表示 | 開始失敗を表示 |
| 3 | 会議終了 | 確認後 | 録音停止→status=processing→AI処理起動 | SCR-052へ | 終了処理再試行 |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| scheduled | 入室可能。録音未開始 | 開始/待機 |
| recording | 録音中Indicator | 会議継続 |
| processing | 再入室不可、処理中案内 | 会議詳細へ |
| completed | 会議終了済み | 会議詳細へ |
| failed | 処理失敗案内 | 会議詳細から再処理 |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 会議情報 | GET | /api/meetings/:id | 会議状態取得 |
| 録音開始/終了 | POST | /api/meetings/:id/recordings/... | S3アップロードまたはSFU連携 |
| 文字起こし | POST | /api/meetings/:id/transcripts | 生成された発言を登録（実装方式に依存） |
| 会議更新 | PATCH | /api/meetings/:id | status更新 |

## **設計補足**

* MVPで外部SFU（例：LiveKit）を採用する場合、UIはSFU SDKの接続状態とmeeting.statusを分離して管理する。  
* ブラウザ終了だけで会議全体をcompletedにしない。hostの明示終了またはサーバー側判定を使用する。

# **SCR-052 会議詳細**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-052 |
| 画面名 | 会議詳細 |
| URL | /meetings/:meetingId |
| 目的 | 会議概要、参加者、録音、文字起こし、AI処理状況を集約し、議事録・候補確認へ遷移する。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 会議タイトル | Heading | \- | title |  |
| 2 | 開催日時 | Display | \- | meeting\_date |  |
| 3 | ステータス | Badge | \- | status |  |
| 4 | 参加者 | List | \- | participants |  |
| 5 | 録音 | Audio/Link | \- | recording | 権限に応じ再生 |
| 6 | 文字起こし | TranscriptList | \- | speaker/time/text | 時刻順 |
| 7 | 会議に参加 | Button | \- |  | scheduled/recordingのみ |
| 8 | AI議事録 | Button | \- |  | transcript存在時 |
| 9 | 再処理 | Button | \- |  | failed/completed時、権限あり |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 会議参加 | 押下 | 状態確認後遷移 | SCR-051 | 状態不整合を表示 |
| 2 | 議事録を開く | 押下 | minutes取得/なければ生成導線 | SCR-053 | 処理中表示 |
| 3 | 再生成 | 確認後 | generate-minutes | processing表示 | AIエラー表示 |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| processing | AI処理中Banner \+ 自動/手動再読込 | 待機 |
| failed | 失敗理由の一般化メッセージ \+ 再処理 | 再処理 |
| completed | 議事録/候補導線を強調 | 確認へ |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 詳細 | GET | /api/meetings/:id | 会議詳細 |
| 文字起こし | GET | /api/meetings/:id/transcripts | 発言一覧 |
| 議事録 | GET | /api/meetings/:id/minutes | 最新議事録 |
| 再処理 | POST | /api/ai/generate-minutes | AI議事録再生成 |

# **SCR-053 AI議事録確認**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-053 |
| 画面名 | AI議事録確認 |
| URL | /meetings/:meetingId/minutes |
| 目的 | AI生成された議事録を人が確認・修正し、確定版として保存する。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 要約 | TextArea | \- | summary |  |
| 2 | 決定事項 | EditableList | \- | decisions\[\] | 追加/削除/編集 |
| 3 | アクション | EditableList | \- | action\_items\[\] | 担当/期限含む |
| 4 | 課題 | EditableList | \- | issues\[\] |  |
| 5 | 保留事項 | EditableList | \- | pending\_items\[\] |  |
| 6 | AI生成表示 | Badge | \- | ai\_model/version |  |
| 7 | 保存 | Button | \- |  | draft/review保存 |
| 8 | 承認 | Button | \- |  | status=approved |
| 9 | 再生成 | Button | \- |  | 新version生成 |
| 10 | チケット候補生成 | PrimaryButton | \- |  | 承認済み推奨 |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 保存 | 保存押下 | PATCH | Toast | validation/409 |
| 2 | 承認 | 承認押下 | PATCH status=approved | 承認Badge | 権限/競合 |
| 3 | 再生成 | 確認後 | POST generate-minutes | 新version表示 | AIエラー |
| 4 | 候補生成 | 押下 | POST generate-tickets | SCR-054へ | AI/validationエラー |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| 各項目 | 空要素を除外、文字列長上限を設定 | 対象行にエラー |
| 担当者/期限 | 候補値は任意。存在するユーザーID・有効日付 | 担当者/日付を確認してください |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| draft | 編集可能 | 保存/承認 |
| approved | 確定表示。再編集時は新versionまたは明示的変更 | 候補生成 |
| AI生成中 | Skeleton/processing表示 | 待機 |
| AI失敗 | 既存版があれば保持 | 再生成 |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 取得 | GET | /api/meetings/:id/minutes | 最新議事録 |
| 生成 | POST | /api/ai/generate-minutes | transcriptから生成 |
| 更新 | PATCH | /api/meetings/:id/minutes/:minutesId | 人手修正/承認（API実装時の詳細に合わせる） |
| 候補生成 | POST | /api/ai/generate-tickets | 確定/選択minutesから候補生成 |

## **設計補足**

* AI出力をそのまま確定扱いにしない。ユーザーによる確認・修正を必須とする。  
* 再生成は既存versionを破壊せず、新しいversionとして保持する。

# **SCR-054 AIチケット候補確認**

| 項目 | 内容 |
| :---- | :---- |
| 画面ID | SCR-054 |
| 画面名 | AIチケット候補確認 |
| URL | /meetings/:meetingId/candidates |
| 目的 | AIが抽出したチケット候補を人が確認・修正・却下し、正式チケットへ登録する。 |
| 認証 | 必須 |
| 利用権限 | project member/viewer |

## **画面構成・表示項目**

| No. | UI要素 | 種別 | 必須 | 初期値/表示内容 | 操作・補足 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 候補件数 | Summary | \- | pending/approved/rejected |  |
| 2 | 候補選択 | Checkbox | \- | 未選択 | 一括操作 |
| 3 | タイトル | TextBox | ○ | candidate.title |  |
| 4 | 説明 | TextArea | \- | description |  |
| 5 | タイプ | Select | ○ | type |  |
| 6 | 優先度 | Select | \- | priority |  |
| 7 | 担当者 | Select | \- | assignee | project member |
| 8 | 期限 | DatePicker | \- | due\_date |  |
| 9 | AI信頼度 | Display | \- | confidence | 参考情報 |
| 10 | 根拠発言 | SourcePanel | \- | source\_transcript\_ids | 時刻・発言者・本文 |
| 11 | 承認 | Button | \- |  | candidate.status=approved |
| 12 | 却下 | Button | \- |  | candidate.status=rejected |
| 13 | 承認済みを登録 | PrimaryButton | \- |  | 正式Ticket作成 |

## **操作仕様**

| No. | 操作 | 契機 | 処理 | 成功時 | 失敗時 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | 候補編集 | フィールド変更 | ローカルdirty化→保存時PATCH | 候補更新 | validation |
| 2 | 承認 | 押下 | PATCH status=approved | 承認表示 | 403/409 |
| 3 | 却下 | 押下 | PATCH status=rejected | 一覧で折りたたみ/表示更新 | 403/409 |
| 4 | 正式登録 | 一括登録押下 | 承認候補をtransactionでTicket化 | registered表示 \+ Ticket link | 一部失敗を原則発生させずrollback |
| 5 | 根拠確認 | source押下 | 該当transcriptへscroll/highlight | 根拠表示 | 欠損時説明 |

## **入力・バリデーション**

| 対象 | ルール | エラー表示 |
| :---- | :---- | :---- |
| タイトル | 1〜300文字 | タイトルを入力してください |
| タイプ | task/issue/decision/followup | タイプを選択してください |
| 担当者 | project所属ユーザーのみ | 担当者を確認してください |
| 期限 | 有効な日付 | 期限を確認してください |

## **状態別表示**

| 状態 | 表示仕様 | ユーザー操作 |
| :---- | :---- | :---- |
| pending | 編集・承認・却下可能 | レビュー |
| approved | 登録対象。編集時は承認維持/再確認方針を統一 | 登録 |
| rejected | 正式登録対象外 | 必要ならpendingへ戻す |
| registered | 編集不可、正式Ticketリンク表示 | Ticket確認 |

## **API連携**

| 用途 | Method | Endpoint | 主な処理 |
| :---- | :---- | :---- | :---- |
| 一覧 | GET | /api/meetings/:id/ticket-candidates | 候補取得 |
| 更新 | PATCH | /api/ticket-candidates/:id | 候補修正/承認/却下 |
| 一括登録 | POST | /api/tickets/bulk | 承認候補を正式Ticketへ登録 |
| 詳細根拠 | GET | /api/meetings/:id/transcripts | source transcript確認 |

## **設計補足**

* この画面が本サービスの品質ゲート。AIの候補を直接ticketsへ挿入しない。  
* 根拠表示はMeeting → Transcript → Candidate → Ticketのトレーサビリティをユーザーに見せる重要UI。

# **7\. 共通バリデーション一覧**

| 項目 | 制約 | 表示タイミング |
| :---- | :---- | :---- |
| 名称系 | 前後空白を除去し、空文字不可。DB最大長以下。 | blur \+ submit |
| メール | 標準的なemail形式 | blur \+ submit |
| 日付 | 実在日付。期限は過去日も既存データ編集では許容し、警告に留める設計可。 | 選択時 \+ submit |
| UUID参照 | URL/Request上のID形式と所属関係をサーバーで検証 | API response |
| Enum | UI選択肢とAPI Schemaを一致 | submit前 \+ server |
| 自由文 | XSSを避けるためHTMLとして直接描画しない | 表示時 |
| AI JSON | Zod/JSON Schemaでサーバー検証 | AI処理時 |

# **8\. 画面権限制御**

| 機能 | owner | member | viewer |
| :---- | :---- | :---- | :---- |
| プロジェクト閲覧 | ○ | ○ | ○ |
| プロジェクト編集 | ○ | ○ | × |
| チケット作成/編集 | ○ | ○ | × |
| チケット削除 | ○ | ○※ | × |
| 会議作成 | ○ | ○ | × |
| AI議事録生成/編集 | ○ | ○ | 閲覧のみ |
| AI候補承認/登録 | ○ | ○ | 閲覧のみ |
| 組織ロール管理 | 組織ownerのみ | × | × |

※ 削除権限は運用ポリシーによりowner限定へ変更可能。API詳細設計と実装時に最終確定する。

# **9\. 画面/API対応一覧**

| 画面 | 主要API | 用途 |
| :---- | :---- | :---- |
| SCR-010 | GET /api/projects、各Projectのtickets/meetings | ホーム集約 |
| SCR-020 | GET/POST /api/organizations | 組織一覧/作成 |
| SCR-021 | GET/PATCH /api/organizations/:id | 組織詳細/更新 |
| SCR-030 | GET/POST /api/projects | 一覧/作成 |
| SCR-031 | GET/PATCH /api/projects/:id | 詳細/更新 |
| SCR-040 | GET/POST /api/projects/:projectId/tickets | 一覧/作成 |
| SCR-041 | GET tickets、PATCH /api/tickets/:id | ボード/状態変更 |
| SCR-042 | GET/PATCH/DELETE /api/tickets/:id、comments | 詳細/編集 |
| SCR-050 | GET/POST /api/projects/:projectId/meetings | 会議一覧/作成 |
| SCR-051 | meeting/recording/transcript APIs | オンライン会議 |
| SCR-052 | GET meeting/transcripts/minutes | 会議集約 |
| SCR-053 | generate-minutes / minutes update / generate-tickets | AI議事録 |
| SCR-054 | candidate GET/PATCH / tickets bulk | 候補レビュー/正式登録 |

# **10\. エラー表示設計**

| HTTP/状態 | 画面表示 | 主な対応 |
| :---- | :---- | :---- |
| 400 | 項目エラーまたはフォーム上部Alert | 入力修正 |
| 401 | ログイン画面へ遷移 | 再認証 |
| 403 | 「この操作を行う権限がありません」 | 前画面へ |
| 404 | 対象データが存在しない/削除済み | 一覧へ戻る |
| 409 | 他ユーザー更新・状態競合 | 再読込して最新状態を確認 |
| 429 | 処理が集中しています | 一定時間後に再試行 |
| 500 | 一般化したエラー \+ Request IDがあれば表示 | 再試行/問い合わせ |
| AI\_FAILED | AI処理失敗。元データは保持 | 再生成 |
| NETWORK | 通信エラー。入力内容は可能な限り保持 | 再試行 |

# **11\. Loading / Empty / Dirty状態**

| 状態 | 仕様 |
| :---- | :---- |
| 初期Loading | 一覧はSkeleton row、詳細はSkeleton block。全画面Spinnerだけにしない。 |
| ボタンLoading | 対象操作ボタン内にSpinner。二重送信禁止。 |
| Empty | 0件理由を説明し、作成権限があればCTAを表示。 |
| Dirty | 編集済み・未保存状態を管理し、画面離脱時に確認。 |
| Optimistic Update | カンバンstatus変更など局所的でrollback可能な操作のみ採用。 |
| AI processing | 処理が長い場合はmeeting.statusを利用し、画面再訪後も状態を復元可能にする。 |

# **12\. 画面受入条件**

* 未認証ユーザーはログイン画面以外の保護画面へアクセスできない。  
* Organization/Projectを跨いだURL直接入力で他テナント情報を閲覧できない。  
* viewerは閲覧可能だが、作成・編集・承認・削除を実行できない。  
* チケット一覧・会議一覧から詳細画面へ一貫した遷移ができる。  
* AI議事録は生成後に人が編集・承認でき、再生成で旧版を破壊しない。  
* AIチケット候補はpendingのまま正式チケットにならず、人が承認した候補だけ登録できる。  
* 正式チケットから元会議・根拠発言へ到達できる。  
* API失敗時に入力内容が不必要に失われず、再試行できる。  
* 主要フォームに必須・最大長・Enum等の入力検証が存在する。  
* 主要画面はPCブラウザでレイアウト崩れなく利用できる。

# **13\. フロントエンド実装順序**

| 順序 | 対象 | 理由 |
| :---- | :---- | :---- |
| 1 | 共通レイアウト・認証・権限ガード | 全画面の土台 |
| 2 | Organization / Project | テナント・作業文脈を確立 |
| 3 | Ticket一覧・詳細・Kanban | 通常PM機能を先に成立 |
| 4 | Meeting一覧・詳細 | AI入力の管理 |
| 5 | Transcript表示 | AI根拠の基盤 |
| 6 | AI議事録確認 | AI出力の人手レビュー |
| 7 | AIチケット候補確認・一括登録 | 中核価値を完成 |
| 8 | オンライン会議 | SFU/録音連携の複雑性が高いため段階導入 |

# **14\. コンポーネント分割案**

| 分類 | コンポーネント例 |
| :---- | :---- |
| 共通 | AppShell / SideNav / Header / Breadcrumb / Toast / ConfirmDialog / ErrorAlert |
| 一覧 | DataTable / FilterBar / SearchBox / Pagination / EmptyState |
| チケット | TicketStatusBadge / PriorityBadge / TicketCard / TicketForm / AssigneeSelect |
| 会議 | MeetingStatusBadge / ParticipantList / TranscriptList / RecordingPlayer |
| AI | MinutesEditor / CandidateCard / SourceEvidencePanel / ConfidenceDisplay |
| フォーム | FormField / DatePicker / UserSelect / EnumSelect / SaveBar |

# **15\. Next.js画面配置案**

| app/├── login/page.tsx├── dashboard/page.tsx├── organizations/page.tsx├── organizations/\[organizationId\]/page.tsx├── projects/page.tsx├── projects/\[projectId\]/page.tsx├── projects/\[projectId\]/tickets/page.tsx├── projects/\[projectId\]/board/page.tsx├── projects/\[projectId\]/meetings/page.tsx├── tickets/\[ticketId\]/page.tsx└── meetings/\[meetingId\]/    ├── page.tsx    ├── live/page.tsx    ├── minutes/page.tsx    └── candidates/page.tsx |
| :---- |

# **16\. 画面テスト観点**

| 分類 | 観点 |
| :---- | :---- |
| 表示 | 初期表示、0件、最大長、長文、長いユーザー名、日付表示 |
| 操作 | 作成、編集、削除、承認、却下、再生成、連打防止 |
| 遷移 | 正常遷移、戻る、直接URL、削除済みURL、権限なしURL |
| 権限 | owner/member/viewerごとのボタン・API挙動 |
| 通信 | 400/401/403/404/409/429/500/timeout/offline |
| 状態競合 | 別ユーザー更新、候補登録済み、会議status変化 |
| AI | 空出力、schema不正、低confidence、再生成、重複候補 |
| レスポンシブ | 1280/1024/768付近、表・カンバン・会議画面 |
| アクセシビリティ | tab移動、label、focus、dialog、色以外の状態表現 |

# **17\. 設計上の重要判断**

* AI議事録とAIチケット候補は「生成結果を見せる画面」ではなく「人が品質を確定するレビュー画面」として設計する。  
* チケット詳細には元会議・根拠発言への導線を持たせ、AIによる抽出理由を追跡可能にする。  
* 通常のプロジェクト管理機能とAI機能を分離しすぎず、Project詳細からチケット・会議の両方へ短距離で遷移できる構成にする。  
* 非同期AI処理は画面滞在中だけのLoading stateに依存せず、DBのmeeting.status等から再構築できるようにする。  
* オンライン会議は技術的複雑性が高いため、Meeting/Transcript/Minutes/Candidateの業務フローを先に成立させてから統合できる構成とする。

# **18\. 次工程への引継ぎ事項**

* Figmaまたは実装モックで各画面の最終レイアウト、余白、コンポーネントサイズを確定する。  
* API詳細設計の最終エンドポイント名と画面API対応を一致させる。  
* AI議事録・チケット候補のJSON Schemaを確定し、MinutesEditor/CandidateCardの型へ反映する。  
* Auth.js/Cognitoの採用方式確定後、SCR-001とRoute Guard仕様を確定する。  
* オンライン会議のSFU/録音方式確定後、SCR-051のデバイス・接続・録音状態設計を詳細化する。  
* デザインシステム（色、typography、spacing、component states）を実装前に最小限定義する。