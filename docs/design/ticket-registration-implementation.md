# Phase 8 Candidate → Ticket Registration 実装補足

## APIと入力

- `POST /api/ticket-candidates/:id/register`: 空JSON `{}`のみを受け付ける。初回201、既登録の再送200。`data`にcandidateId/ticketId/status/existing/deleted、レスポンスにrequestIdを返す。
- `POST /api/ticket-candidates/bulk-register`: `{ candidateIds: UUID[] }`のみ。最大50件、重複不可、同一Project。成功201で`data.registered`に対応一覧を返す。
- 正式登録の認可はowner/member。viewerは403、非所属・別Tenantは既存方針の404。Origin検証・認証・strict入力検証を既存基盤と共用する。
- 一括の件数・重複・余剰Field違反は422 `BULK_REGISTRATION_INVALID`。単体の余剰Fieldや不正JSONは共通方針の400。古いAPI設計の100件上限ではなく、Phase 8推奨の50件を採用する。

## 前提・Mapping

候補のProject/Meeting/Minutes整合、approved状態、登録先未設定、タイトル・type・期限・担当者、根拠Transcript実在をTransaction内で確認する。元Minutesも承認済みであることを確認する。優先度NULLは422 `TICKET_PRIORITY_REQUIRED`とし、medium等へ補完しない。

title/description/type/priority/assigneeId/dueDateはDBの候補から取得し、status=todo、createdBy=操作したHuman User、sourceCandidateId/sourceMeetingId=候補のDB値とする。Phase 4 Ticket用SchemaとPhase 7候補Schemaを再利用する。ClientからTicket本文・作成者・出典を受け取らない。AIや外部サービスは呼び出さない。

担当者のProject/Organization Membershipを再検証し、該当Membership行を共有ロックして登録中の削除と競合しないようにする。Projectは既存`lockActiveProject`を使い、archivedへの登録を禁止する。

## Transaction・競合・冪等性

1. 要求中の全Candidateを認可し、同一Projectを確認。
2. Project共有ロックを取得。
3. Candidate ID昇順で`FOR UPDATE`。
4. 全Candidateの最終状態・所属・必須値・根拠を検証。
5. Ticket INSERT、Candidateのregistered/registeredTicketId更新、Auditを同じTransactionで実行。
6. どこかで失敗すればすべてRollback。

一括は検証を全件終えるまでINSERTしない。単体・一括で同じロック順を使う。一括は既登録が1件でも含まれれば409として全件登録しない。個別の既登録判定はCandidate状態・registeredTicketIdだけでなく、TicketのsourceCandidateId、sourceMeetingId、projectIdとの相互整合も検証する。不整合は409とし、無条件に追加作成しない。

単体の自然な冪等キーはCandidate ID。ネットワーク再送では既存Ticket IDを返す。登録先Ticketが論理削除済みでも同じIDとdeleted=trueを返し、Candidateはregisteredのまま保持する。削除後の再登録・復元機能は追加しない。

既存の`UNIQUE(tickets.source_candidate_id)`はNULL以外の同一候補からの複数TicketをDBで防止する。`ticket_candidates.registered_ticket_id`にも既存FK・UNIQUEがあるため、追加Migrationは不要。Unique違反・deadlock・serialization failureは安全な409、その他の内部登録失敗は本文を含まない500へ変換する。

## 画面・Traceability

approved候補にowner/member向け「正式チケットとして登録」を表示する。処理中は操作を無効化し、失敗時は安全なメッセージと再試行可能なボタンを表示する。registered候補は閲覧専用とし、正式Ticketへのリンクを表示する。一覧にはapproved候補の選択チェックボックスと一括登録を追加する。優先度未設定の候補は一括選択不可。

pendingレビュー時に優先度の設定を案内する。既に優先度NULLで承認された候補は登録APIで422となる。承認済み候補の直接編集は引き続き禁止し、再生成した候補で優先度を設定して承認する案内を表示する。承認を取り消す新たな状態遷移は追加しない。

Ticketは通常の一覧・Kanbanのtodoへ表示される。Ticket詳細には「会議から作成」の説明と、元Meeting・Candidate・Minutes Versionへのリンクを表示する。EvidenceはCandidate画面から元Transcriptへ辿り、Ticketへ複製しない。

Ticket詳細APIの`source`は出典候補を別途認可し、相互リンクと所属を照合してから返す。手動Ticketはsource=null。通常Ticket作成/更新APIは出典Fieldの変更を引き続き拒否する。

## Audit・Monitoring

各候補について`ticket_candidate.register`を記録する。userIdは登録実行者、metadataはcandidateId/ticketId/meetingId/minutesId/requestId。Auditを業務Transactionに含め、監査記録のない登録を防ぐためAudit失敗でもRollbackする。再送で同じ登録監査を重複作成しない。

安全な構造化ログにrequestId/candidateId/ticketId/projectId/result/durationMs/idempotentHit/conflictを出力する。Candidate本文、Ticket description、SQL、DB error全文は記録しない。

## 検証

- REG-T01〜07: Field Mapping、Human actor、pending/rejected拒否、担当者再検証、Ticket INSERT/Candidate UPDATE/Audit障害時のRollback、再送。
- REG-CON-01〜04: 隔離PostgreSQLへ最大12接続のpoolを開き、2/10並列登録、Approve/Register、Register/Reject、逆順で重複するBulkを検証。
- BULK-T01〜05: 3件登録、pending混在、別Project混在、重複ID、既登録混在。後半INSERT失敗で前半のTicketと監査もRollbackすることを確認。
- Security: viewer・別Tenant・CSRF・Mass Assignment・承認後の所属変更・出典参照・論理削除後の再送。
- E2E: 議事録承認→候補レビュー→登録→Ticket詳細→Minutes/Candidate/Transcript追跡、通常Ticket一覧とKanbanへの反映、一括登録。

テストは隔離した一時PostgreSQLのみ使用する。E2Eの前提AI生成もローカルBedrock Mock。Production接続・Migration・Secret変更・Deployは行わない。

## Phase 9への引継ぎ

Candidateから正式Ticketへの経路と出典は完成している。録音Upload・LiveKit・音声認識・通知・復元機能は追加していない。将来の処理でもsourceCandidateIdの一意性と登録履歴を保持すること。
