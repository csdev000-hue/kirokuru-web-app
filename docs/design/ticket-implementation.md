# Phase 4 Ticket / Comments / Kanban 実装補足

## 実装範囲と配置

Ticketの一覧・手動作成・詳細・更新・論理削除、コメント一覧・投稿、検索・Filter・Sort・Pagination、Kanbanの状態変更を実装した。

- API: `app/api/projects/[id]/tickets/route.ts`、`app/api/tickets/[id]/route.ts`、`app/api/tickets/[id]/comments/route.ts`。
- Service: `lib/services/ticket-service.ts`、`ticket-comment-service.ts`。
- Validator: `lib/validators/ticket.ts`、`ticket-comment.ts`。
- UI: `app/(protected)/projects/[id]/tickets/`、`board/`、`app/(protected)/tickets/[id]/`、`components/tickets/`。
- 共通変更: `lib/permissions/resource.ts`のDB型をTransactionでも使えるselectインターフェイスに限定、`lib/api/errors.ts`へ業務エラーを追加、`lib/security/audit.ts`へコメント作成・変更フィールド・projectIdを追加。
- Tests: `tests/helpers/ticket-suite.ts`をIntegration/Securityで共用。`tests/unit/ticket-ui.test.tsx`、`e2e/ticket.spec.ts`。

Comment編集・削除は任意範囲のため公開しない。他人のCommentを変更できるAPIもUIもない。Meeting/AI/通知/外部連携は未実装。

## 設計判断

Phase 4仕様を優先し、手動作成時のstatusはtodo、sourceMeetingId/sourceCandidateIdはNULLをサーバーで固定する。旧API設計で許可されていたsourceMeetingIdの入力も今回は拒否する。

Ticketのtypeは必須。priority未指定時はDB既定medium。タイトルtrim後1〜300文字、説明最大10000文字、コメントtrim後1〜5000文字。期限はYYYY-MM-DDの実在日付でNULL可。PATCHは空オブジェクトと未知フィールドを拒否する。担当者解除・期限解除はNULLを使用する。

通常入力エラー400、コメント内容不正422、担当者不正422 INVALID_ASSIGNEE。共通認証・Origin検証・JSON Body上限・no-store・requestId・内部エラー秘匿をPhase 3から再利用する。

## Authorization / Tenant Isolation

Project一覧取得はrequireProjectViewer。Ticket操作はrequireTicketAccessでTicket→DB Project→Project/Organization Membershipを確認する。owner/memberが作成・変更・削除・コメント投稿でき、viewerは参照のみ。Clientのrole/projectId/createdBy等を認可根拠にしない。

assigneeは対象ProjectとそのOrganization双方のMembershipを確認し、他Project/他Tenantのユーザーを拒否する。取得後にClientでTenant filterする処理はない。

archived Projectは参照のみとし、新規Ticketに加え、既存Ticket変更・削除・コメント投稿も409 PROJECT_ARCHIVEDで拒否する。操作中はProject行を共有ロックし、Phase 3のarchive更新と競合しても状態確認を維持する。ownerがProjectを再開すると編集できる。

Ticket削除はdeleted_at設定のみ。通常一覧・詳細・コメントを404/非表示にする。コメントやAI source情報を物理削除しない。コメント投稿はTicket行の共有ロック取得後にdeleted_atを再確認する。

## Query / Performance

対象Project IDとdeleted_at IS NULLを必須SQL条件にする。assigneeとcreatedByはusersのaliasをJOINし、Ticket単位の追加Queryは発行しない。コメント投稿者もJOINする。

- Filter: status/type/priority/assigneeIdの単一値を組み合わせる。dueFrom/dueToの期限範囲も対応。
- Search: title/descriptionのILIKE。値はDrizzleのパラメーターとして渡す。検索中の%、_、バックスラッシュはリテラル文字扱い。
- Sort: updatedAt/createdAt/dueDate/priorityのWhitelistとasc/desc。priorityはlow→medium→high→urgentの順位でソート。NULL期限は末尾、同値はid ASCで安定化。
- Pagination: page/limit、既定50件・最大100件。pageは1〜100000。API詳細設計に合わせ`meta: { page, limit, total, totalPages }`を返す。
- 行と件数はread only / repeatable read Transactionで同じスナップショットから取得する。

Kanbanも同じ一覧Serviceとページングを使用する。画面に全件数・ページ・1ページ上限を表示し、前後ページへ移動できる。各列は現在ページに含まれるTicketを表示する。

以下のIndexはPhase 1で存在し、Schema変更・追加Migrationは不要。

- tickets(project_id, status)
- tickets(project_id, assignee_id)
- tickets(project_id, deleted_at)
- tickets(due_date)
- ticket_comments(ticket_id)

部分一致検索の追加Indexは今回導入しない。大規模データでの検索性能測定は未実施。

## Audit / Transaction

作成・更新・論理削除・コメント投稿を監査記録と同じTransactionで確定する。監査INSERT失敗時は業務処理もrollbackする。

actionはticket.create/update/delete、ticket.comment.create。resourceType=ticket、resourceId=Ticket ID、organizationId/userIdとmetadata.projectIdを記録する。更新はchangedFieldsのみ追加し、旧値/新値/本文/Tokenは複製しない。コメントは投稿だけを提供するため、Auditもcreateだけ。

## UI / Kanban

Project詳細から一覧・Kanbanへ移動できる。フォームに担当者・期限・種類・優先度を表示する。FilterはURL queryへ反映し、ページ移動でも条件を保持する。
Kanbanは追加Libraryを導入せず、キーボードでも操作できるStatusメニューを採用。4列todo/in_progress/blocked/done、Cardに名称・優先度・担当者・期限・種類を表示する。
変更直後に列を移動し、失敗時は元statusに戻してErrorを表示する。成功時はAPI応答を反映し、サーバーデータを再取得する。tickets.statusが唯一の永続状態。

作成/保存/削除/投稿/状態変更は処理中表示と多重送信ガードを持つ。削除は確認後に実行する。Loading/Empty/404/Errorの表示を追加する。
期限切れはAsia/Tokyoの今日とdate値を比較し、doneは対象外。文字ラベルを付け、色だけに依存しない。
本文はReactの通常テキストとして描画し、HTMLを解釈しない。source情報用領域を用意し、後続Phaseの存在しないURLへのリンクは作らない。

## 検証と運用上の境界

テストは既存の一時PostgreSQLを使い、設定済みDATABASE_URLへ接続しない。E2Eは一時TLS DBと署名済みSession Mockで本番形式のローカルビルドを起動する。実Google OAuthへの接続は今回実施していない。
Productionへの接続・Migration・Deploy・Secret変更は実施しない。

Phase 5ではMeeting CRUDから共通認証・Permission・Audit・archived Project制限を再利用する。TicketのsourceMeetingId/sourceCandidateIdは一般APIから変更不可を維持し、後続AI登録Serviceだけが設定する。

## 最終実行結果

2026-09-16、Node 24.11.1、隔離ローカルTest DBで確認。

| Command | 結果 |
| --- | --- |
| npm run lint | 成功 |
| npm run typecheck | 成功 |
| npm run test:run | 73件成功 |
| npm run test:integration | 143件成功 |
| npm run test:security | 67件成功 |
| npm run test:e2e | 14件成功 |
| npm run build | 成功 |

初回の型チェックでTransaction設定のプロパティ名とページの閉じ括弧を修正。初回E2Eでは選択欄のラベル検索に失敗したため、aria-labelを明示して再ビルド・再実行し成功した。
TKT-T01〜10、CMT-T01〜04、KBN-T01〜04、FILTER-T01〜06相当を検証。Kanban失敗時のoptimistic rollbackとviewerの操作非表示はUI単体テスト、実ブラウザでは作成→検索→編集→コメント→Kanban変更→削除とXSS文字列の安全な描画を確認した。
