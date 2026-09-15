# Phase 5 Meeting / Participant / Transcript 実装補足

## 対象・配置

- Meeting: `lib/services/meeting-service.ts`、`lib/validators/meeting.ts`、`app/api/projects/[id]/meetings/`、`app/api/meetings/[id]/route.ts`。
- Participant: `lib/services/meeting-participant-service.ts`、対応Validator、participants API。自分の参加・退出は`participants/me/join`・`leave`。
- Transcript: `lib/services/meeting-transcript-service.ts`、対応Validator、transcripts単件・bulk・子ID API。
- 共通処理: `meeting-common.ts`、既存Resource/Project Permission、Phase 4のProject状態ロック、Auth API・JSON/Origin検証・業務エラー・Auditを再利用。
- AI入力: `lib/services/meeting-ai-context.ts`。
- UI: `app/(protected)/projects/[id]/meetings/`、`app/(protected)/meetings/[id]/`、`components/meetings/forms.tsx`、`lib/utils/meeting-time.ts`。
- Tests: `tests/helpers/meeting-suite.ts`をIntegration/Securityで共用、`tests/unit/meeting.test.ts`、`e2e/meeting.spec.ts`。既存DBテストを新制約に対応。

Meeting/Participant/Transcriptの手動管理まで。音声認識、録音Upload、LiveKit、Bedrock、AI生成・Review UIは実装しない。

## 認可・入力

一覧はrequireProjectViewer、詳細と子リソースはrequireMeetingAccessでMeeting→Project→Organization/Project membershipを確認。owner/memberは変更可能、viewerは閲覧のみ。Participantのhost roleはアプリのProject権限を付与しない。

ClientからMeetingのprojectId/createdBy/status（作成時）、ParticipantのmeetingId/identity変更、TranscriptのmeetingId/createdAtは受け付けない。Zod strictで未知フィールドを422にする。不正JSONは共通400、本文上限は共通1MB。Cookie WriteにはAUTH_URLと一致するOriginが必要。応答は共通data/error/requestId/no-store。

Meeting名trim後1〜200文字、meetingDateはoffset付きISO 8601。作成はscheduledで固定し、DBのcurrent userの名前をhost表示名にする。
Internal ParticipantとspeakerUserIdは、対象ProjectとOrganization双方のMembershipを検証。ExternalはuserId=NULL、displayName必須、アプリ認証権限なし。ParticipantのuserIdは登録後変更できない。joinedAt/leftAtは専用APIでcurrent userの行だけをサーバー時刻で更新する。

TranscriptはspeakerName 1〜100文字、text trim後1〜10000文字、startedAtは0〜999999999.999秒で小数3桁まで、endedAtはNULLまたはstartedAt以上。sequenceNoは1〜2147483647。PATCHはDB上の現在値とマージした状態を再検証する。

## 状態遷移と削除

許可遷移:

- scheduled → recording / completed（手動会議の完了）
- recording → processing / failed
- processing → completed / failed
- failed → processing
- completedは終端。同じstatusの再送は許容する。

Phase 5は手動状態管理としてowner/memberが共通Service経由で遷移可能。UIのStartは状態変更のみで、録音開始やLiveKit接続ではない。processingも状態を記録するだけでAIジョブは起動しない。

processing/completedでは会議メタデータ・Participant・Transcriptの編集を拒否。failedは入力修正してからprocessingへ再試行できる。archived Projectは全変更を拒否して閲覧のみとする。

Meeting DELETEは編集可能状態で、Participant以外の関連データが一切ない場合のみ物理削除する。Transcript/Recording/Minutes/Candidate/source Ticket（論理削除済みも含む）があれば409 MEETING_NOT_EMPTY。Participantを明示削除した後にMeetingを削除し、監査履歴は保持する。CASCADEを導入しない。

Transcript DELETEは編集可能状態かつMinutes/Candidateなしなら物理削除。EvidenceがあるMeetingは追加・更新・削除を409 TRANSCRIPT_REFERENCEDで拒否し、既存Evidenceを壊さない。seqは削除後も再採番せず、欠番を許容する。復元や履歴Tableは今回導入しない。

## Transaction / 同時実行 / Audit

- Meeting作成＋host登録＋auditを一括確定。
- Participant・Transcript変更もauditと同じTransaction。
- 全Meeting変更でProject共有ロック→Meeting排他ロックの順に取得する。最後のhostの削除/降格確認、status判定、子データ変更と会議削除を直列化する。
- Bulkは1〜500件、全件成功または全件rollback。話者所属は一括で取得したProject member集合で検証し、発言ごとのQueryを避ける。
- 同一user参加者の重複は409 PARTICIPANT_EXISTS。同一Meeting内sequence重複はDB制約違反を409 TRANSCRIPT_SEQUENCE_CONFLICTへ変換。

Auditはmeeting.create/update/delete/status.change、meeting.participant.add/update/remove、meeting.transcript.create/bulk_create/update/delete。statusはfrom/to、bulkは件数、編集は変更フィールド名、projectId/meetingIdと対象resource IDを保存。本文・話者名・Tokenの複製はしない。Bulkは1イベントとし、単件createはそのTranscript IDを記録する。

## Pagination / Query / 時刻

Meeting一覧はstatus/from/to、sort=meetingDate/createdAt/updatedAtとasc/desc、page/limit。既定30・最大100件、metaにtotal/totalPages。from/toは日本時間の日付境界で、toの日付全体を含む。作成者はJOIN、参加人数は集約JOIN。行と件数はread only / repeatable readの同一スナップショットで取得。

Transcript APIはsequenceNo ASC、fromSequence（指定値を含む）とlimit（既定100・最大500）。limit+1件で次ページの有無を判定し、meta.nextSequenceを返す。numericはDBで小数3桁、APIではnumber。時刻表示はHH:MM:SS。

会議の表示・日時入力はAsia/Tokyo。ISO offsetを付けて送信し、DBはtimestamptzで保持。日時編集でも既存秒・ミリ秒を保持する。

## AI Context

`loadMeetingAIContext(userId, meetingId)`はserver-onlyで、current userのUUIDをサーバー認証から渡す。member以上を認可した後、同一DBスナップショットからmeeting/project/projectMembers/participants/transcriptsを取得する。Client入力によるContext組立ては行わず、このServiceを公開するAPIも設けない。

Transcriptは全件をsequence順に取得し、UI Paginationに影響されない。projectMembersはid/name/roleのみ。Participant/speakerの内部userIdがProject/Organization所属と不整合ならINVALID_AI_CONTEXTで失敗する。削除・脱退などで古い参照が残る場合は、Contextの整合確認が必要。

Bedrock呼出し、Prompt組立て、生成結果保存はPhase 6以降。Phase 6はprocessingへの遷移とこのContext取得を組み合わせ、AI処理中の入力編集を防ぐ。

## DB Migration

`drizzle/migrations/0002_phase_05_meeting_constraints.sql`:

1. `uq_participant_user`: (meeting_id, user_id) WHERE user_id IS NOT NULLのPartial Unique Index。
2. `meeting_transcripts_time_order_check`: ended_at IS NULL OR ended_at >= started_at。
3. `meeting_transcripts_sequence_positive_check`: sequence_no >= 1。

既存のmeetings(project_id, meeting_date)、meeting_transcripts(meeting_id, sequence_no) UNIQUE、meeting_participants(meeting_id) Indexを再利用する。

Test DBへ適用して確認。開発DBへ適用する際、既存データに重複・不正時刻・非正sequenceがあればMigrationが失敗し、自動削除や自動補正はしない。データ修正は別途根拠を確認して行う。Productionへの適用・接続・変更は実施していない。

## UI / 検証境界

Project詳細→会議一覧→作成→詳細。owner/memberには会議編集・許可された状態遷移、参加者追加/編集/削除、自分のJoin/Leave、Transcript追加/編集/削除を表示する。Transcriptは次ページへ移動可能。viewerには変更操作を表示しない。
フォームは処理中disabledと多重送信ガード、Error、削除確認を持つ。共通Loading/Empty/404を用意し、本文はReactのテキストとして描画する。

テストは隔離した一時PostgreSQL。E2Eは一時TLS DBと署名済みSession Mockを使う。実Google OAuth、実クラウド、音声認識は未接続。Production・Secret・課金対象サービスは変更しない。

## 最終実行結果

2026-09-16、Node 24.11.1、隔離ローカルPostgreSQLで確認。

| Command | 結果 |
| --- | --- |
| npm run lint | 成功 |
| npm run typecheck | 成功 |
| npm run test:run | 78件成功 |
| npm run test:integration | 180件成功 |
| npm run test:security | 84件成功 |
| npm run test:e2e | 15件成功 |
| npm run build | 成功 |

MTG-T01〜08、PRT-T01〜05、TRN-T01〜07、TRN-B01〜04相当と、複数接続でのhost同時削除・sequence同時挿入を検証。Bulk 100件、重複時の全件rollback、Audit失敗時のMeeting+host/Bulk rollback、AI Context全Transcript取得を確認した。

既存DBテストのSET NULL確認は内部参加者のみを変更するよう更新し、新しい参加者重複禁止制約との矛盾を解消した。E2Eで見つかった既存本文付き編集欄のラベル検索問題はaria-labelの明示で修正し、再実行で成功。会議情報編集時の日時精度保持もE2Eで確認済み。

未実施は実Google OAuth、クラウド接続、大規模負荷試験、Phase 6以降の機能。Phase 5必須範囲の未解決事項はない。
