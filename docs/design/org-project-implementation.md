# Phase 3 Organization / Project 実装補足

## 対象とファイル

- API: `app/api/organizations/`、`app/api/projects/`。各一覧・作成・詳細・更新・DELETE・Member一覧。
- 画面: `app/(protected)/organizations/`、`app/(protected)/projects/`。共通フォームと一覧は `components/management/`。
- 業務処理: `lib/services/organization-service.ts`、`project-service.ts`。
- 検証: `lib/validators/organization.ts`、`project.ts`。共通JSON処理は `lib/api/request.ts`。
- 既存 `lib/permissions/`、`lib/auth/api.ts`、`lib/security/audit.ts` を拡張して再利用。
- 検証コード: `tests/helpers/crud-suite.ts` をIntegration/Securityから実行。単体Validation、`e2e/org-project.spec.ts` を追加。

Member操作は一覧のみ。招待・追加・降格・削除、Ticket/Meeting/AI機能は対象外。

## 認可と設計優先順位

Phase 3仕様に従いProject設定更新・archiveはownerのみ。古いAPI/画面設計のowner/member表記より優先する。
Organization owner/memberはProjectを作成できる。作成者だけをProject ownerに登録する。
Organization ownerもProject非所属なら参照できない。Project所属とそのOrganization所属の両方をDBで確認する。
不正UUID・非所属・削除済みは404、所属はあるがrole不足なら403。
一覧はJOINのSQL条件で絞り、OrganizationはcreatedAt DESC、ProjectはupdatedAt DESC（同値はid DESC）。Project一覧はarchivedを含める。任意のorganizationIdフィルタを受け付け、組織所属を検証する。件数制限・ページングは現Phaseでは設けない。

## 削除とMigration

`drizzle/migrations/0001_phase_03_organization_soft_delete.sql` により、`organizations.deleted_at timestamptz NULL` を追加する。既存行はNULLで有効なまま。

既存audit_logs.organization_idはNOT NULLかつON DELETE RESTRICTであり、Organizationの物理削除は監査履歴と両立しない。そのためDELETEは論理削除、成功時204とする。Membership・Auditを保持し、一覧・共通Permissionでdeleted_at IS NULLを必須にする。復元APIは提供しない。
配下にProjectが1件でも存在すれば、archivedを含め409 ORGANIZATION_NOT_EMPTY。Project作成とOrganization削除は同じOrganization行をFOR UPDATEでロックし、ロック取得後に有効状態と子Projectを確認する。

Project DELETEはstatus=archivedに変更し204。Ticket・Meeting・その他の関連行は保持する。詳細参照とownerによるPATCH status=activeで再開が可能。物理削除やCASCADEは実装しない。

Migrationは隔離したローカルTest DBにのみ適用済み。開発用DBで利用する場合も、このMigration適用後に起動する。Productionへの接続・変更・Deployは実施していない。

## Transactionと監査

Organization/Projectの作成は本体・owner membership・auditを同じTransactionで確定する。更新・論理削除・archiveもauditと同一Transaction。監査INSERTが失敗すれば業務変更もrollbackする。
記録するactionはorganization.create/update/delete、project.create/update/archive。Project DELETEも実態に合わせproject.archiveを記録する。project.deleteは許可actionとして定義するが、物理削除を行わないため発行しない。
metadataは変更フィールド名のみ。入力本文・email・資格情報・Tokenは監査へ複製しない。

## 入力・レスポンス・CSRF

Zod strictで未知フィールドを400にする。名称trim後1〜200文字、説明最大5000文字でnull可。作成時statusはactiveをサーバー指定。Project PATCHはname/description/statusのみかつ空オブジェクト不可。createdBy/role/organizationId等を更新できない。

認証→入力検証→Service→共通Permission→DB/Auditの構成。Serviceでも入力を検証する。
通常レスポンスはdata、エラーはerror.code/messageとルート直下requestId。内部例外は500の固定メッセージへ変換する。レスポンスはno-storeとX-Request-Idを付ける。
Cookieを使う業務Write APIはOriginとサーバー側AUTH_URLのoriginが完全一致することを要求し、Originなし・cross-siteを403にする。Auth.js自体のCSRF保護は変更しない。JSON以外は400、ストリーム読取が1MBを超えた時点で413。CORS許可は追加しない。

## UIとTest

作成・編集フォームは処理中disabledと多重送信ガード、入力制約、サニタイズしたエラー、削除確認を備える。サーバー側でroleを取得しownerだけ設定フォームを表示する。Loading、Empty、404、再試行表示を用意する。
E2EはPhase 2と同じ署名済みSession Mockと一時TLS PostgreSQLで、ログイン画面→組織作成→Project作成→更新→archive→非空組織の削除拒否→空組織の論理削除→404まで実行する。実Google OAuthへは接続しない。

実行結果: lint/typecheck/build成功、Unit 69件、Integration 114件、Security 46件、E2E 12件成功。
初回Integrationの監査順序の期待値はORDER BY欠落を修正。型生成とbuildの出力先競合は逐次実行で解消した。

## Phase 4への引継ぎ

Ticket CRUDから同じCurrentUser/Permissionを利用する。archived Projectの新規Ticket/Meeting作成禁止は当該機能の実装時に適用する。今回のProject Viewer/Member helperは閲覧を含むためarchived自体を一律拒否しない。
Organization論理削除と監査保持、owner限定Project設定、Write APIのOrigin要件を維持する。
