**AIプロジェクトマネージャー**  
**API詳細設計書**

Version 1.0 / MVP

対象：Next.js Route Handlers / Vercel Functions / Neon PostgreSQL / Amazon Bedrock

# **1\. 文書概要**

本書は、AIプロジェクトマネージャーのMVP実装に必要なREST APIの詳細仕様を定義する。要件定義書・基本設計書・DB設計書を前提とし、Frontend（Next.js）からVercel上のAPIを経由してNeon、Amazon Bedrock、Amazon S3およびオンライン会議基盤へアクセスする。

| 項目 | 内容 |
| :---- | :---- |
| API方式 | REST / JSON |
| 実装 | Next.js App Router Route Handlers |
| Base Path | /api |
| 認証 | Auth.js または Amazon Cognito。APIでは認証済みuserIdを取得 |
| DB | Neon PostgreSQL \+ Drizzle ORM |
| AI | Amazon Bedrock（初期候補：Amazon Nova Lite） |
| ストレージ | Amazon S3 |
| 日時 | ISO 8601。DBはUTC保存、表示時にユーザーTZへ変換 |
| APIバージョン | MVPはURLバージョンなし。破壊的変更時に /api/v2 を検討 |

# **2\. API設計原則**

* ブラウザからNeon、Bedrock、S3へ直接アクセスさせず、必ずVercel APIを経由する。  
* Organizationをテナント境界とし、全APIでユーザー所属とProject権限を検証する。  
* AI生成結果は構造化JSONとして検証し、AIチケット候補を人間が承認するまで正式Ticketへ登録しない。  
* Meeting → Transcript → Minutes → Ticket Candidate → Ticket のトレーサビリティをAPIレスポンスでも保持する。  
* 一覧APIはページング・絞り込み・ソートを共通化する。  
* クライアントへ内部例外、SQL、Bedrockの生エラーを露出しない。

# **3\. 共通HTTP仕様**

| 項目 | 仕様 |
| :---- | :---- |
| Content-Type | application/json; charset=utf-8 |
| Authorization | CookieセッションまたはBearer token。方式は認証基盤確定時に固定 |
| Correlation | X-Request-Id。未指定時はサーバー採番 |
| Idempotency | AI生成、bulk登録等の再送リスクがあるPOSTは Idempotency-Key を推奨 |
| 成功レスポンス | 単体：{ "data": ... } / 一覧：{ "data": \[...\], "meta": {...} } |
| 日時形式 | 2026-09-08T00:00:00Z |
| ID形式 | UUID文字列 |
| 未知フィールド | 原則無視せずRequest Schemaでreject |
| 最大Body | 通常API 1MB目安。録音本体はS3直接アップロード |

## **3.1 共通成功レスポンス**

{  
  "data": {  
    "id": "7f6b...",  
    "name": "Project Alpha"  
  }  
}

## **3.2 共通エラーレスポンス**

{  
  "error": {  
    "code": "VALIDATION\_ERROR",  
    "message": "入力内容を確認してください。",  
    "details": \[  
      { "field": "title", "reason": "required" }  
    \]  
  },  
  "requestId": "req\_..."  
}

| HTTP | error.code | 用途 |
| :---- | :---- | :---- |
| 400 | VALIDATION\_ERROR | 入力値・JSON Schema不正 |
| 401 | UNAUTHENTICATED | 未認証 |
| 403 | FORBIDDEN | 権限不足・他テナントアクセス |
| 404 | NOT\_FOUND | 対象なし、または存在を隠すべき越境参照 |
| 409 | CONFLICT | 重複、状態遷移不正、二重登録 |
| 413 | PAYLOAD\_TOO\_LARGE | Body上限超過 |
| 429 | RATE\_LIMITED | AI生成等のレート制限 |
| 500 | INTERNAL\_ERROR | 予期しないサーバーエラー |
| 502 | UPSTREAM\_ERROR | Bedrock/S3/SFU等外部サービス失敗 |
| 503 | SERVICE\_UNAVAILABLE | 一時的利用不可 |

# **4\. 認証・認可**

| Project Role | 参照 | Ticket更新 | 会議作成/編集 | メンバー管理 |
| :---- | :---- | :---- | :---- | :---- |
| owner | ○ | ○ | ○ | ○ |
| member | ○ | ○ | ○ | × |
| viewer | ○ | × | × | × |

Organization ownerはOrganization設定・メンバー管理が可能。Project APIでは、Projectが属するorganizationIdを取得後、organization\_membersおよびproject\_membersを確認してから処理する。存在を推測させたくない越境アクセスは404を返す。

# **5\. API一覧**

| ID | Method | Path | 概要 | 権限 |
| :---- | :---- | :---- | :---- | :---- |
| ORG-001 | GET | /api/organizations | 所属組織一覧 | 認証済 |
| ORG-002 | POST | /api/organizations | 組織作成 | 認証済 |
| ORG-003 | GET | /api/organizations/{organizationId} | 組織詳細 | member |
| ORG-004 | PATCH | /api/organizations/{organizationId} | 組織更新 | owner |
| ORG-005 | GET | /api/organizations/{organizationId}/members | 組織メンバー一覧 | member |
| ORG-006 | POST | /api/organizations/{organizationId}/members | 組織メンバー追加 | owner |
| PRJ-001 | GET | /api/projects | プロジェクト一覧 | 認証済 |
| PRJ-002 | POST | /api/projects | プロジェクト作成 | org member |
| PRJ-003 | GET | /api/projects/{projectId} | プロジェクト詳細 | viewer+ |
| PRJ-004 | PATCH | /api/projects/{projectId} | プロジェクト更新 | owner/member |
| PRJ-005 | GET | /api/projects/{projectId}/members | PJメンバー一覧 | viewer+ |
| PRJ-006 | POST | /api/projects/{projectId}/members | PJメンバー追加 | owner |
| TKT-001 | GET | /api/projects/{projectId}/tickets | チケット一覧 | viewer+ |
| TKT-002 | POST | /api/projects/{projectId}/tickets | チケット作成 | owner/member |
| TKT-003 | GET | /api/tickets/{ticketId} | チケット詳細 | viewer+ |
| TKT-004 | PATCH | /api/tickets/{ticketId} | チケット更新 | owner/member |
| TKT-005 | DELETE | /api/tickets/{ticketId} | チケット論理削除 | owner/member |
| TKT-006 | GET | /api/tickets/{ticketId}/comments | コメント一覧 | viewer+ |
| TKT-007 | POST | /api/tickets/{ticketId}/comments | コメント投稿 | owner/member |
| MTG-001 | GET | /api/projects/{projectId}/meetings | 会議一覧 | viewer+ |
| MTG-002 | POST | /api/projects/{projectId}/meetings | 会議作成 | owner/member |
| MTG-003 | GET | /api/meetings/{meetingId} | 会議詳細 | viewer+ |
| MTG-004 | PATCH | /api/meetings/{meetingId} | 会議更新 | owner/member |
| MTG-005 | POST | /api/meetings/{meetingId}/room-token | 会議ルームToken発行 | project member |
| TRN-001 | GET | /api/meetings/{meetingId}/transcripts | 文字起こし取得 | viewer+ |
| TRN-002 | POST | /api/meetings/{meetingId}/transcripts | 文字起こし登録 | system/member |
| REC-001 | POST | /api/meetings/{meetingId}/recordings/upload-url | S3アップロードURL発行 | owner/member |
| AI-001 | POST | /api/ai/generate-minutes | AI議事録生成 | owner/member |
| MIN-001 | GET | /api/meetings/{meetingId}/minutes | 議事録取得 | viewer+ |
| MIN-002 | PATCH | /api/minutes/{minutesId} | 議事録編集・承認 | owner/member |
| AI-002 | POST | /api/ai/generate-tickets | AIチケット候補生成 | owner/member |
| CAN-001 | GET | /api/meetings/{meetingId}/ticket-candidates | 候補一覧 | viewer+ |
| CAN-002 | PATCH | /api/ticket-candidates/{candidateId} | 候補編集/承認/却下 | owner/member |
| CAN-003 | POST | /api/ticket-candidates/bulk-register | 承認済候補を一括登録 | owner/member |

# **6\. 一覧API共通仕様**

| Query | 型 | 既定値 | 説明 |
| :---- | :---- | :---- | :---- |
| page | integer | 1 | 1以上 |
| limit | integer | 20 | 1〜100 |
| sort | string | createdAt |  |
| order | asc|desc | desc | 昇順/降順 |
| q | string | \- | 名称・タイトル等の部分一致検索 |

{  
  "data": \[ ... \],  
  "meta": {  
    "page": 1,  
    "limit": 20,  
    "total": 57,  
    "totalPages": 3  
  }  
}

# **7\. Organization / Project API詳細**

## **7.1 ORG-002 組織作成**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/organizations |
| 必要権限 | 認証済 |
| 目的 | 新しいOrganizationを作成し、作成者をownerとして所属登録する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| name | string | ○ | 1〜200文字 |

{  
  "name": "開発チーム"  
}

### **Response**

{  
  "data": { "id": "org\_uuid", "name": "開発チーム", "role": "owner" }  
}

### **処理・注意事項**

* organizations INSERT と organization\_members(owner) INSERT は同一Transaction。

## **7.2 PRJ-002 プロジェクト作成**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/projects |
| 必要権限 | Organization member |
| 目的 | Organization配下にProjectを作成する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| organizationId | uuid | ○ | 所属済みOrganization |
| name | string | ○ | 1〜200文字 |
| description | string | \- | 最大5000文字 |

{  
  "organizationId": "org\_uuid",  
  "name": "AI PM MVP",  
  "description": "MVP開発"  
}

### **Response**

{  
  "data": { "id": "project\_uuid", "name": "AI PM MVP", "status": "active", "role": "owner" }  
}

### **処理・注意事項**

* projects INSERT と project\_members(owner) INSERT は同一Transaction。

## **7.3 PRJ-004 プロジェクト更新**

| 項目 | 内容 |
| :---- | :---- |
| Method | PATCH |
| Path | /api/projects/{projectId} |
| 必要権限 | owner / member |
| 目的 | 名称・説明・状態を更新する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| name | string | \- | 1〜200文字 |
| description | string|null | \- | 最大5000文字 |
| status | string | \- | active / archived |

{  
  "status": "archived"  
}

### **Response**

{  
  "data": { "id": "project\_uuid", "status": "archived", "updatedAt": "..." }  
}

### **処理・注意事項**

* archived Projectは新規Ticket/Meeting作成不可。再開はownerのみを推奨。

# **8\. Ticket API詳細**

## **8.1 TKT-001 チケット一覧**

| 項目 | 内容 |
| :---- | :---- |
| Method | GET |
| Path | /api/projects/{projectId}/tickets |
| 必要権限 | viewer+ |
| 目的 | Project内のチケットを一覧取得する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| status | string | \- | todo/in\_progress/done/blocked。カンマ区切り可 |
| assigneeId | uuid | \- | 担当者 |
| priority | string | \- | low/medium/high/urgent |
| type | string | \- | task/issue/decision/followup |
| dueFrom | date | \- | 期限下限 |
| dueTo | date | \- | 期限上限 |
| q | string | \- | title/description検索 |

### **Response**

{  
  "data": \[  
    {  
      "id": "ticket\_uuid",  
      "title": "API仕様を確定する",  
      "status": "todo",  
      "priority": "high",  
      "assignee": { "id": "user\_uuid", "name": "田中" },  
      "dueDate": "2026-09-15",  
      "sourceMeetingId": "meeting\_uuid"  
    }  
  \],  
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }  
}

## **8.2 TKT-002 チケット作成**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/projects/{projectId}/tickets |
| 必要権限 | owner / member |
| 目的 | 手動で正式Ticketを作成する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| title | string | ○ | 1〜300文字 |
| description | string | \- | 最大10000文字 |
| type | string | ○ | task/issue/decision/followup |
| status | string | \- | 既定todo |
| priority | string | \- | 既定medium |
| assigneeId | uuid|null | \- | Project memberのみ |
| dueDate | date|null | \- | YYYY-MM-DD |
| sourceMeetingId | uuid|null | \- | 同一Project内 |

{  
  "title": "API仕様を確定する",  
  "type": "task",  
  "priority": "high",  
  "assigneeId": "user\_uuid",  
  "dueDate": "2026-09-15"  
}

### **Response**

{  
  "data": { "id": "ticket\_uuid", "title": "API仕様を確定する", "status": "todo" }  
}

### **処理・注意事項**

* sourceCandidateIdは一般クライアントから直接指定不可。AI候補登録処理のみ設定する。

## **8.3 TKT-004 チケット更新**

| 項目 | 内容 |
| :---- | :---- |
| Method | PATCH |
| Path | /api/tickets/{ticketId} |
| 必要権限 | owner / member |
| 目的 | Ticketの編集・状態変更を行う。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| title | string | \- | 1〜300文字 |
| description | string|null | \- | 最大10000文字 |
| type | string | \- | 許容値のみ |
| status | string | \- | todo/in\_progress/done/blocked |
| priority | string | \- | low/medium/high/urgent |
| assigneeId | uuid|null | \- | Project member |
| dueDate | date|null | \- | YYYY-MM-DD |

{  
  "status": "in\_progress",  
  "assigneeId": "user\_uuid"  
}

### **Response**

{  
  "data": { "id": "ticket\_uuid", "status": "in\_progress", "updatedAt": "..." }  
}

### **処理・注意事項**

* 監査対象：status、assigneeId、dueDate、priorityの変更。

## **8.4 TKT-005 チケット削除**

| 項目 | 内容 |
| :---- | :---- |
| Method | DELETE |
| Path | /api/tickets/{ticketId} |
| 必要権限 | owner / member |
| 目的 | Ticketを論理削除する。 |
| 成功HTTP | 204 |

### **処理・注意事項**

* HTTP 204。AI由来Ticketでもsource Candidateは削除しない。  
* DB設計書への差分：tickets.deleted\_at timestamptz NULL を追加し、通常検索はdeleted\_at IS NULLを条件にする。

## **8.5 TKT-007 コメント投稿**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/tickets/{ticketId}/comments |
| 必要権限 | owner / member |
| 目的 | Ticketへコメントを登録する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| content | string | ○ | 1〜5000文字 |

{  
  "content": "対応開始します。"  
}

### **Response**

{  
  "data": { "id": "comment\_uuid", "content": "対応開始します。", "user": { "id": "...", "name": "..." } }  
}

# **9\. Meeting / Transcript / Recording API詳細**

## **9.1 MTG-002 会議作成**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/projects/{projectId}/meetings |
| 必要権限 | owner / member |
| 目的 | Project配下に会議を作成する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| title | string | ○ | 1〜200文字 |
| meetingDate | datetime | ○ | ISO 8601 |

{  
  "title": "週次開発定例",  
  "meetingDate": "2026-09-09T10:00:00+09:00"  
}

### **Response**

{  
  "data": { "id": "meeting\_uuid", "title": "週次開発定例", "status": "scheduled" }  
}

## **9.2 MTG-004 会議更新**

| 項目 | 内容 |
| :---- | :---- |
| Method | PATCH |
| Path | /api/meetings/{meetingId} |
| 必要権限 | owner / member |
| 目的 | 会議情報または状態を更新する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| title | string | \- | 1〜200文字 |
| meetingDate | datetime | \- | ISO 8601 |
| status | string | \- | scheduled/recording/processing/completed/failed |

{  
  "status": "completed"  
}

### **Response**

{  
  "data": { "id": "meeting\_uuid", "status": "completed", "updatedAt": "..." }  
}

### **処理・注意事項**

* 通常のクライアント操作では状態遷移を制限し、processing/completed/failedはサーバー処理からの更新を基本とする。

## **9.3 MTG-005 会議ルームToken発行**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/meetings/{meetingId}/room-token |
| 必要権限 | Project member |
| 目的 | LiveKit等SFUへ接続するための短期Tokenを発行する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| displayName | string | ○ | 1〜100文字 |

{  
  "displayName": "田中"  
}

### **Response**

{  
  "data": {  
    "provider": "livekit",  
    "roomName": "meeting\_meeting\_uuid",  
    "token": "\<short-lived-token\>",  
    "expiresAt": "..."  
  }  
}

### **処理・注意事項**

* token有効期限は短くする。provider secretをクライアントへ返さない。

## **9.4 TRN-001 文字起こし取得**

| 項目 | 内容 |
| :---- | :---- |
| Method | GET |
| Path | /api/meetings/{meetingId}/transcripts |
| 必要権限 | viewer+ |
| 目的 | 会議発言を発言順に取得する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| fromSequence | integer | \- | 指定番号以降 |
| limit | integer | \- | 最大500 |

### **Response**

{  
  "data": \[  
    {  
      "id": "transcript\_uuid",  
      "speakerName": "田中",  
      "startedAt": 132.420,  
      "endedAt": 139.120,  
      "text": "API仕様は金曜までに確定します。",  
      "sequenceNo": 42  
    }  
  \]  
}

## **9.5 TRN-002 文字起こし登録**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/meetings/{meetingId}/transcripts |
| 必要権限 | system / owner/member |
| 目的 | 音声認識結果を保存する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| items | array | ○ | 1〜500件/Request |
| items\[\].speakerName | string | ○ | 1〜100文字 |
| items\[\].speakerUserId | uuid|null | \- | 紐付く場合のみ |
| items\[\].startedAt | number | ○ | 0以上の秒 |
| items\[\].endedAt | number|null | \- | startedAt以上 |
| items\[\].text | string | ○ | 1〜10000文字 |
| items\[\].sequenceNo | integer | ○ | 会議内一意 |

{  
  "items": \[  
    { "speakerName": "田中", "startedAt": 132.42, "endedAt": 139.12, "text": "API仕様は金曜までに確定します。", "sequenceNo": 42 }  
  \]  
}

### **Response**

{  
  "data": { "inserted": 1 }  
}

### **処理・注意事項**

* (meeting\_id, sequence\_no)にUNIQUE制約を追加することを推奨。重複送信はupsertまたは409で制御。

## **9.6 REC-001 録音アップロードURL発行**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/meetings/{meetingId}/recordings/upload-url |
| 必要権限 | owner / member |
| 目的 | 録音ファイルをS3へ直接PUTする署名付きURLを発行する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| fileName | string | ○ | 表示用ファイル名 |
| contentType | string | ○ | 許可MIMEのみ |
| fileSize | integer | ○ | 上限チェック |

{  
  "fileName": "meeting.webm",  
  "contentType": "audio/webm",  
  "fileSize": 12345678  
}

### **Response**

{  
  "data": {  
    "recordingId": "recording\_uuid",  
    "uploadUrl": "\<presigned-url\>",  
    "s3Key": "organizations/.../meeting.webm",  
    "expiresAt": "..."  
  }  
}

### **処理・注意事項**

* S3 keyはサーバー生成。クライアント指定不可。  
* アップロード完了通知APIはP1。MVPは処理開始時にS3 HEADで存在確認してもよい。

# **10\. AI議事録 API詳細**

## **10.1 AI-001 AI議事録生成**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/ai/generate-minutes |
| 必要権限 | owner / member |
| 目的 | Meeting TranscriptをBedrockへ渡し、構造化議事録を生成してmeeting\_minutesへ保存する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| meetingId | uuid | ○ | 対象Meeting |
| regenerate | boolean | \- | 既定false。trueで新Version生成 |

{  
  "meetingId": "meeting\_uuid",  
  "regenerate": false  
}

### **Response**

{  
  "data": {  
    "minutesId": "minutes\_uuid",  
    "meetingId": "meeting\_uuid",  
    "version": 1,  
    "status": "review",  
    "summary": "API仕様と期限について確認した。",  
    "decisions": \[ { "text": "API仕様は金曜までに確定する", "sourceTranscriptIds": \["tr\_42"\] } \],  
    "actionItems": \[ { "text": "API仕様を確定する", "assigneeName": "田中", "dueDate": "2026-09-11", "sourceTranscriptIds": \["tr\_42"\] } \],  
    "issues": \[\],  
    "pendingItems": \[\]  
  }  
}

### **処理・注意事項**

* Transcriptが0件の場合は409 TRANSCRIPT\_NOT\_READY。  
* Bedrock出力をZod/JSON Schema検証し、不正なら最大1回程度の修正生成を行う。  
* 生成開始前後でmeeting.statusをprocessing/completedまたはfailedへ更新する。  
* 同一Idempotency-Keyの再送では同一結果を返す。

## **10.2 MIN-001 議事録取得**

| 項目 | 内容 |
| :---- | :---- |
| Method | GET |
| Path | /api/meetings/{meetingId}/minutes |
| 必要権限 | viewer+ |
| 目的 | 会議の議事録Versionを取得する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| version | integer | \- | 未指定時は最新 |

### **Response**

{  
  "data": { "id": "minutes\_uuid", "version": 1, "status": "review", "summary": "...", "decisions": \[\], "actionItems": \[\], "issues": \[\], "pendingItems": \[\] }  
}

## **10.3 MIN-002 議事録編集・承認**

| 項目 | 内容 |
| :---- | :---- |
| Method | PATCH |
| Path | /api/minutes/{minutesId} |
| 必要権限 | owner / member |
| 目的 | AI議事録を人間が修正し、approvedへ変更する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| summary | string | \- | 要約 |
| decisions | array | \- | 構造化項目 |
| actionItems | array | \- | 構造化項目 |
| issues | array | \- | 構造化項目 |
| pendingItems | array | \- | 構造化項目 |
| status | string | \- | review / approved |

{  
  "status": "approved"  
}

### **Response**

{  
  "data": { "id": "minutes\_uuid", "status": "approved", "updatedAt": "..." }  
}

### **処理・注意事項**

* approved後も編集は可能だが、AIチケット再生成時は新しいCandidate群として生成し旧候補を保持する。

# **11\. AIチケット候補 API詳細**

## **11.1 AI-002 AIチケット候補生成**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/ai/generate-tickets |
| 必要権限 | owner / member |
| 目的 | 確定またはレビュー中のMinutesを元にTicket Candidateを生成する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| meetingId | uuid | ○ | 対象Meeting |
| minutesId | uuid | \- | 未指定時は最新Minutes |
| regenerate | boolean | \- | 既定false |

{  
  "meetingId": "meeting\_uuid",  
  "minutesId": "minutes\_uuid",  
  "regenerate": false  
}

### **Response**

{  
  "data": {  
    "candidates": \[  
      {  
        "id": "candidate\_uuid",  
        "title": "API仕様を確定する",  
        "description": "週次定例で決定したAPI仕様を確定する。",  
        "type": "task",  
        "priority": "high",  
        "assignee": { "id": "user\_uuid", "name": "田中" },  
        "dueDate": "2026-09-11",  
        "confidence": 0.92,  
        "status": "pending",  
        "source": {  
          "meetingId": "meeting\_uuid",  
          "transcriptIds": \["tr\_42"\],  
          "startedAt": 132.42,  
          "sourceQuote": "API仕様は金曜までに確定します。"  
        }  
      }  
    \]  
  }  
}

### **処理・注意事項**

* 担当者はProject memberのname/emailとの照合に成功した場合のみassigneeIdを設定する。曖昧ならNULL。  
* dueDateはAIが推測できない場合NULL。推測で作らない。  
* sourceTranscriptIdsは可能な限り必須とし、根拠が弱い候補はconfidenceを下げる。  
* AI結果を直接ticketsへINSERTしない。

## **11.2 CAN-002 候補編集・承認/却下**

| 項目 | 内容 |
| :---- | :---- |
| Method | PATCH |
| Path | /api/ticket-candidates/{candidateId} |
| 必要権限 | owner / member |
| 目的 | AI候補を修正し、承認または却下する。 |
| 成功HTTP | 200 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| title | string | \- | 1〜300文字 |
| description | string|null | \- | 最大10000文字 |
| type | string | \- | 許容値 |
| priority | string|null | \- | 許容値 |
| assigneeId | uuid|null | \- | Project member |
| dueDate | date|null | \- | YYYY-MM-DD |
| status | string | \- | pending / approved / rejected |

{  
  "title": "API詳細設計を確定する",  
  "status": "approved"  
}

### **Response**

{  
  "data": { "id": "candidate\_uuid", "status": "approved", "title": "API詳細設計を確定する" }  
}

### **処理・注意事項**

* registered状態のCandidateは編集不可。409 CANDIDATE\_ALREADY\_REGISTERED。

## **11.3 CAN-003 承認済候補一括登録**

| 項目 | 内容 |
| :---- | :---- |
| Method | POST |
| Path | /api/ticket-candidates/bulk-register |
| 必要権限 | owner / member |
| 目的 | approved Candidateを正式Ticketへ一括登録する。 |
| 成功HTTP | 201 |

### **Request**

| 項目 | 型 | 必須 | 制約/説明 |
| :---- | :---- | :---- | :---- |
| candidateIds | uuid\[\] | ○ | 1〜100件 |

{  
  "candidateIds": \["candidate\_1", "candidate\_2"\]  
}

### **Response**

{  
  "data": {  
    "registered": \[  
      { "candidateId": "candidate\_1", "ticketId": "ticket\_1" },  
      { "candidateId": "candidate\_2", "ticketId": "ticket\_2" }  
    \]  
  }  
}

### **処理・注意事項**

* 全Candidateが同一Projectか検証。  
* 1 Candidateごとではなく、要求単位でTransactionを張り、Ticket INSERT・candidate.status=registered・registered\_ticket\_id更新を原子的に行う。  
* approved以外や既登録が含まれる場合は409で全体ロールバックする。

# **12\. 状態遷移設計**

| 対象 | 遷移 | 補足 |
| :---- | :---- | :---- |
| Meeting | scheduled → recording → processing → completed | 失敗時はprocessing → failed。再処理でfailed → processing可 |
| Minutes | draft → review → approved | AI生成直後はreviewを推奨 |
| Candidate | pending → approved → registered | pending → rejected可。registeredは終端 |
| Ticket | todo → in\_progress → done | 任意状態からblocked可、blocked解除後はtodo/in\_progress |

# **13\. トランザクション・整合性**

| 処理 | Transaction範囲 |
| :---- | :---- |
| Organization作成 | organizations \+ organization\_members(owner) |
| Project作成 | projects \+ project\_members(owner) |
| AI候補正式登録 | tickets INSERT \+ ticket\_candidates更新 |
| メンバー削除 | 権限整合チェック \+ membership削除。最後のowner削除は禁止 |

* AI外部呼び出し中はDB Transactionを保持しない。外部呼び出し前後で状態を更新する。  
* 長時間処理は将来的にSQS/Lambdaへ移し、APIは202 Accepted \+ jobId方式へ拡張可能とする。  
* bulk-registerは同一Request内の部分成功をMVPでは許可しない。

# **14\. AI出力検証仕様**

Bedrockからの回答はMarkdownや説明文ではなくJSONのみを要求し、サーバー側でSchema validationする。検証前の値を業務テーブルへ反映しない。

// Ticket Candidate 概念Schema  
{  
  "title": "string (1..300)",  
  "description": "string|null",  
  "type": "task|issue|decision|followup",  
  "priority": "low|medium|high|urgent|null",  
  "assigneeName": "string|null",  
  "dueDate": "YYYY-MM-DD|null",  
  "sourceTranscriptIds": \["uuid"\],  
  "sourceQuote": "string|null",  
  "confidence": "number 0..1"  
}

# **15\. セキュリティ設計**

* 全Route Handler冒頭で認証を確認し、resource取得後にOrganization/Project membershipを検証する。  
* UUIDを知っていても他Organizationデータを参照できないことをテストする。  
* S3署名付きURLは短時間・対象Key限定・Content-Type制限付きで発行する。  
* Bedrock promptへ不要な個人情報を含めず、ログへTranscript全文・AI raw outputを平文出力しない。  
* Rate limit対象：generate-minutes、generate-tickets、room-token、upload-url。  
* CSRF対策は採用認証方式に合わせて実装し、Cookie認証時はSameSite/Secure/HttpOnlyを設定する。

# **16\. ログ・監査設計**

| 種別 | 記録内容 |
| :---- | :---- |
| Application Log | requestId, method, path, status, latency, userId(必要最小限) |
| AI Log | meetingId, model,処理時間,成功/失敗,token/usage取得可能なら使用量。本文は原則非記録 |
| Audit Log | Ticket重要項目変更、Minutes承認、Candidate承認/却下/登録、メンバー変更 |
| Error Log | 内部例外スタック。ユーザー向けResponseには露出しない |

# **17\. Next.js実装構成**

app/api/  
├── organizations/route.ts  
├── organizations/\[organizationId\]/route.ts  
├── organizations/\[organizationId\]/members/route.ts  
├── projects/route.ts  
├── projects/\[projectId\]/route.ts  
├── projects/\[projectId\]/members/route.ts  
├── projects/\[projectId\]/tickets/route.ts  
├── projects/\[projectId\]/meetings/route.ts  
├── tickets/\[ticketId\]/route.ts  
├── tickets/\[ticketId\]/comments/route.ts  
├── meetings/\[meetingId\]/route.ts  
├── meetings/\[meetingId\]/transcripts/route.ts  
├── meetings/\[meetingId\]/minutes/route.ts  
├── meetings/\[meetingId\]/ticket-candidates/route.ts  
├── meetings/\[meetingId\]/room-token/route.ts  
├── meetings/\[meetingId\]/recordings/upload-url/route.ts  
├── minutes/\[minutesId\]/route.ts  
├── ticket-candidates/\[candidateId\]/route.ts  
├── ticket-candidates/bulk-register/route.ts  
└── ai/  
    ├── generate-minutes/route.ts  
    └── generate-tickets/route.ts

| 共通モジュール | 責務 |
| :---- | :---- |
| lib/api/auth.ts | session取得、401処理 |
| lib/permissions/\* | Organization/Project認可 |
| lib/validation/\* | Zod Request/Response Schema |
| lib/api/errors.ts | AppError → HTTP変換 |
| lib/db/\* | Drizzle client/schema/query |
| lib/bedrock/\* | Bedrock client、prompt、JSON parse/validation |
| lib/s3/\* | presigned URL生成 |
| lib/audit/\* | audit\_logs記録 |

# **18\. DB設計書への反映差分**

| API詳細化により、DB設計書Version 1.0へ以下の小さな差分を反映することを推奨する。 |
| :---- |

| 対象 | 追加/変更 | 理由 |
| :---- | :---- | :---- |
| tickets | deleted\_at timestamptz NULL 追加 | DELETE APIを論理削除とするため |
| meeting\_transcripts | UNIQUE(meeting\_id, sequence\_no) | 重複文字起こし防止 |
| meeting\_minutes | UNIQUE(meeting\_id, version) | Version重複防止 |
| ticket\_candidates | registered\_ticket\_id UNIQUE（NULL除外）検討 | 1候補から複数Ticket生成を防止 |
| projects | status=archived運用を削除相当とする | Project DELETEをMVPで不要にする |

# **19\. APIテスト観点**

| 分類 | 主要確認 |
| :---- | :---- |
| 正常系 | CRUD、一覧、filter、pagination、AI生成、候補承認→正式登録 |
| 認証 | 未ログイン401 |
| 認可 | 別Organization UUID、viewer更新、memberによるowner操作 |
| 入力 | 必須、長さ、enum、UUID、日付、未知フィールド |
| 状態遷移 | registered Candidate再編集、archived Project新規作成、TranscriptなしAI生成 |
| 冪等性 | AI生成POST再送、bulk-register再送 |
| 外部障害 | Bedrock timeout/invalid JSON、S3失敗、SFU障害 |
| 性能 | Ticket 1,000件、Transcript長文、一覧p95 |
| 監査 | 重要操作がaudit\_logsへ記録される |

# **20\. MVP API実装順序**

| 順序 | 対象 | 理由 |
| :---- | :---- | :---- |
| 1 | 認証共通 \+ Organization \+ Project | 全APIのテナント境界を先に固定 |
| 2 | Ticket CRUD \+ Comments | 基本PM機能を成立 |
| 3 | Meeting \+ Transcript | AI入力データを成立 |
| 4 | AI議事録 \+ Minutes編集/承認 | Meeting→Minutesを成立 |
| 5 | AI Ticket Candidate \+ bulk-register | サービス中核フロー完成 |
| 6 | S3 Recording \+ Room Token | オンライン会議を統合 |
| 7 | 監査・Rate limit・障害処理強化 | リリース品質へ引き上げ |

# **21\. API受入条件**

* 異なるOrganization間でデータ越境が発生しない。  
* Project viewerは更新系APIを実行できない。  
* MeetingのTranscriptからAI議事録を生成できる。  
* AI議事録からTicket Candidateを生成し、根拠Transcriptを参照できる。  
* Candidateを編集・承認し、承認済みCandidateのみ正式Ticketへ登録できる。  
* 正式TicketからsourceMeetingId/sourceCandidateIdを通して元会議へ追跡できる。  
* AI/外部サービスエラー時に内部情報をResponseへ露出しない。  
* 主要Request/ResponseがZod等で検証され、OpenAPI化可能な構造になっている。

# **22\. 後続設計への引継ぎ**

| 後続成果物 | 確定する内容 |
| :---- | :---- |
| 画面詳細設計書 | 各画面から呼ぶAPI、loading/error/empty状態、フォーム項目 |
| AI Prompt・JSON Schema設計書 | Minutes/Candidateの厳密Schema、prompt、再試行/補正 |
| OpenAPI定義 | 各Schemaを機械可読化しFrontend/Backend型共有へ利用 |
| Codex実装指示 | Route Handler、Drizzle query、Zod schema、testの実装単位 |

