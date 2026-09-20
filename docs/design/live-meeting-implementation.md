# Phase 10 LiveKit / Online Meeting

Phase 10仕様を優先する。Viewerは視聴専用、開始・終了はowner/member。録音・STT・AIを自動起動しない。既存の手動会議とオンライン会議は開始履歴で区別する。

## SDK / Service

- Server SDK 2.19.0を維持。Client 2.22.3、React Components 2.9.24、Styles 1.2.0を追加。インストール済み型定義と公式資料を確認し、既存SDKの更新はしない。
- `LiveMeetingProvider`がensureRoom / endRoom / hasParticipant / createParticipantTokenを提供する。RoomServiceClientは10秒timeout、地域間failover無効。未設定でもimport/build時に接続しない。
- Roomは`meeting_<meeting UUID>`、Identityは`user_<user UUID>`。名前・Emailを識別子へ入れない。表示名は認証ユーザーのDB情報から設定。
- Tokenは既定1800秒、設定範囲900〜3600秒。roomJoin/subscribeを許可し、owner/memberに音声・カメラ・画面共有のpublishを許可。viewerのpublishはfalse。Room管理・データ送信・自分のmetadata変更を許可しない。
- Token/SecretはDB・監査・localStorageへ保存しない。SDK Client/React診断ログはsilent。API keyの独立した応答フィールドはなく、JWTの標準issuerにはLiveKit仕様上のkey識別子が入る。

参考: [Token/Grantとrefresh](https://docs.livekit.io/frontends/reference/tokens-grants/)、[LiveKitRoom](https://docs.livekit.io/reference/components/react/component/livekitroom/)、[PreJoin](https://docs.livekit.io/reference/components/react/component/prejoin/)。Token有効期限は最初の接続に適用され、接続後のrefresh/reconnectはSDK/LiveKitが担当する。完全切断後の再参加はAPIで権限を再確認して新Tokenを発行する。

## API / Permissions

全APIはPOST `/api/meetings/:id/` 以下、Cookie認証・既存Origin検証・no-store/requestIdを使用する。

| 操作 | body | 権限 | 処理 |
|---|---|---|---|
| start | `{}` | owner/member | 同一Roomを準備、recordingへ |
| token | `{}` | viewer以上 | 開始済み・終了要求なし・active Projectのみ |
| join | `{}` | viewer以上 | Providerで本人の接続を確認後、参加履歴をupsert |
| leave | `{}` | viewer以上 | 本人の参加済み履歴へ退出時刻を記録 |
| end | `{}` | owner/member | 終了要求を先に永続化、Room削除、completedへ |
| connection-event | stateのみ | viewer以上 | reconnect/failed等の監視用。DB状態・権限には反映しない |

ClientのroomName/identity/role/canPublish/日時を受け取らない。認可はMeeting→Project→OrganizationのDB情報を使用。全操作にテナント認可。Token/start/end等はユーザー単位30操作/分をDB監査ログとユーザー行ロックで制限し、複数インスタンス間でも有効。

開始・Token・JoinはProjectのarchiveも検証。終了・退出はarchive／Feature Flag OFFでも後片付け可能。接続テレメトリーはClient申告であり、監視専用の非信頼情報として扱う。未知フィールド・生エラー・Tokenの添付は拒否する。

## Meeting / Participant / Migration

`0006_steep_alex_wilder.sql` でmeetingsへnullableな`live_started_at`と`live_ended_at`を追加する。後者は実切断時刻ではなく**終了要求日時**。

- scheduled→recording→completed。recordingはオンライン会議中という既存Schema上の意味で利用し、UIで録音していない旨を明示。
- Live開始済み会議の一般PATCHによる状態変更・DELETEを禁止。専用Endへ集約。
- 既存Meeting transition検証、Project/Meeting認可、会議行ロック、Auditを再利用。参加履歴は既存meeting_participantsを使用し、viewer自身の同期に限り専用Serviceを設ける（既存手動編集はmember専用）。
- Token取得だけでは参加扱いにしない。Join通知でProviderの本人identityを確認し、joined_atをサーバー時刻で記録。再Joinは既存参加者行を利用。Leave/Endは参加済み行だけ更新し、未参加者に退出履歴を捏造しない。
- Browser crash時にLeaveが届かない場合がある。接続中参加者の正はLiveKit、DB時刻は履歴。Webhook同期は本Phaseでは未実装。
- 同じUserは同じidentityとなるため、多重タブ・端末の独立参加履歴は扱わない。
- 会議中／終了処理中のAI Minutes生成を拒否。終了後にAIがprocessing/failedへ移した場合、End再送はその状態を上書きしない。

## 非Atomic処理

StartはMeetingロック中に同じRoom名でCreateRoomする。Provider失敗ならDBはscheduledのまま。Provider成功後のDB失敗は、同じRoom名でStart再試行可能。未参加RoomはemptyTimeout 300秒、最終退出後departureTimeout 60秒。Roomが自動消滅した場合はToken発行前にも同じ設定で準備する。

Endは終了要求を別Transactionで確定してからRoomを削除する。失敗中もToken/Join/Startを拒否。Room Delete失敗は履歴を保持し再試行、Room未存在は成功扱い。Room削除成功・DB失敗でもEnd再試行できる。成功後も再Endは安全にRoom削除を再確認する。

**発行済みJWTの完全な取り消しは実装していない。** 終了後の新しいToken発行は拒否するが、削除されたRoomへの有効JWTによる直接再接続・Room再作成、権限変更後の既存接続の失効はProviderの制御・運用が必要。短期TTLだけを即時失効とみなさない。終了後のRoom残存は再End／管理者照合で回収し、厳格な失効・Webhook/権限更新連携はPhase 11の評価対象とする。既存セッションのrefreshでTTL以上続く可能性も考慮する。

## UI / lifecycle

`/meetings/:id/live`で公式PreJoinとLiveKitRoomを使用する。PreJoinはマイク・カメラOFF開始、設定の永続保存なし。デバイス選択・映像プレビュー、音声のみ／視聴のみ参加に対応。拒否・未接続デバイスは安全な日本語エラーを表示。

LiveKitRoomがRoom生成・connect・unmount時disconnectを管理。optionsは安定参照、Roomをrenderごとに生成しない。GridLayout/ParticipantTile、RoomAudioRenderer、TrackToggle（Mic/Camera/ScreenShare）、StartAudioを使用。公式hookで参加者・接続状態・ブラウザ共有停止を同期。表示名はReact escape。adaptiveStream/dynacast有効、定員既定20名は小規模MVP向け設定値で負荷試験済み上限ではない。

LeaveとEndを分離。Endには全員退出の確認を表示。reconnecting表示と回数、接続時間を表示し、接続失敗・完全切断後はToken再取得による再参加を可能にする。接続テレメトリーは限定enumのみ送信し、UIから生SDK errorやTokenを送信しない。

## Infrastructure / Feature Flag

- `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`はServer設定。接続URLだけをToken応答で返す。公開Secret変数は作らない。
- `LIVE_MEETING_ENABLED=false`が既定。`LIVEKIT_TOKEN_TTL_SECONDS=1800`、`LIVEKIT_MAX_PARTICIPANTS=20`。
- Live画面のPermissions-Policyはcamera/microphone/display-captureをselfに限定。HTTPSまたはlocalhostを使用。
- 現状RepositoryにCSPはないため、今回connect-srcのワイルドカード追加や既存ポリシーの緩和はしていない。Phase 11でCSPを導入する場合、設定したLiveKitのwss/https originと必要なmedia blobだけを検討する。
- MediaはBrowser↔LiveKit SFU。Next.jsは中継しない。Flag OFFやLiveKit障害でもTicket・手動Transcript・会議履歴は利用可能。
- Production設定、Cloud資源、Secret、DBは変更していない。

## 検証環境と範囲

隔離PostgreSQL、Provider Mock、loopback Twirp serverを使用。実Server SDKが発行するJWTを検証し、Room作成・Participant照合・Room削除を確認。テスト用HTTP `/test/join` はtests/helpersのloopback Providerだけに存在し、アプリケーションには認証バイパス・Mock切替を組み込まない。

2つのブラウザContextでowner/viewerの認証・開始・Preview・Token・参加履歴・退出・終了・接続失敗UIを検証。SDKコンポーネントMockによるUIテストでは音声Renderer、参加者XSS、デバイス拒否、再参加、再接続表示、viewer controlsを確認する。

**実WebRTCの2者接続、音声・映像の送受信、画面共有、実ネットワーク再接続は未検証。** 開発用LiveKit資格情報・ローカルServer/コンテナ環境がなく、Productionへ接続せずMockで代替した。対応ブラウザ（Chrome/Edge/Safari）の実機試験、デバイス変更、画面共有のブラウザ停止、NAT/TURN、定員負荷は非Production環境で実施する。

## Phase 11への引継ぎ

Token/Room/Participant管理境界とPhase 9録音基盤は分離している。Egress・録画・STT・AI自動起動・Webhook・匿名ゲスト招待は未実装。Phase 11ではToken失効・接続中の権限変更・CSP・監視・実SFU試験を重点確認する。

## 実行結果

| コマンド | 結果 |
|---|---|
| npm run lint | 成功 |
| npm run typecheck | 成功 |
| npm run test:run | 162件成功 |
| npm run test:integration | 345件成功 |
| npm run test:livekit | 1件成功（Provider Mock、Integrationにも含む） |
| npm run test:security | 171件成功 |
| npm run test:e2e | 20件成功（LiveKitはProvider Mock） |
| npm run build | 成功 |

ビルド済みClient JavaScriptにLIVEKIT_API_KEY/LIVEKIT_API_SECRET/Server SDKの識別子がないことも確認した。Migrationの適用は隔離テストDBのみ。Productionは未変更。
