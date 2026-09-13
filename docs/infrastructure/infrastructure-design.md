**AIプロジェクトマネージャー**  
**インフラ構築設計書**

Version 1.0 / MVP

対象: Vercel / Neon PostgreSQL / AWS Bedrock / S3 / LiveKit / GitHub Actions

# **1\. 文書概要**

本書は、AIプロジェクトマネージャーMVPを構築・運用するためのインフラ設計を定義する。対象はVercel、Neon PostgreSQL、AWS Bedrock、Amazon S3、LiveKit、GitHub Actions、DNS、Secret、IAM、監視、バックアップ、環境分離、構築手順およびIaC方針である。

| 項目 | 方針 |
| :---- | :---- |
| ホスティング | Vercel \+ Next.js |
| DB | Neon PostgreSQL |
| AI | Amazon Bedrock |
| Storage | Amazon S3 |
| Online Meeting | LiveKit |
| CI/CD | GitHub Actions \+ Vercel |
| 環境 | Local / Preview / Staging / Production |
| IaC | MVPでは設定手順＋コード管理。拡張時にTerraform/CDKを採用 |

# **2\. 全体インフラ構成**

Internet  
   │  
   ▼  
DNS / Custom Domain  
   │  
   ▼  
Vercel  
┌──────────────────────────────┐  
│ Next.js                      │  
│ \- Web UI                     │  
│ \- Route Handlers             │  
│ \- Server Functions           │  
│ \- Auth                       │  
└──────────────────────────────┘  
   │        │        │       │  
   │        │        │       └────► LiveKit  
   │        │        └────────────► Amazon S3  
   │        └─────────────────────► Amazon Bedrock  
   └──────────────────────────────► Neon PostgreSQL

GitHub  
   └─ GitHub Actions  
       ├─ Lint / Typecheck / Test / Build  
       ├─ Migration Check  
       ├─ Preview / Staging validation  
       └─ Release

Monitoring  
   ├─ Vercel Logs  
   ├─ Neon Metrics  
   ├─ AWS CloudWatch  
   └─ Application Structured Logs

# **3\. 環境分離設計**

| 項目 | Local | Preview | Staging | Production |
| :---- | :---- | :---- | :---- | :---- |
| 用途 | 開発 | PR確認 | 統合/受入 | 本番 |
| Vercel | Local | Preview Deploy | Staging Project/Domain | Production Project |
| DB | Dev DB | Dev/Preview DB | Staging DB | Production DB |
| AWS | Dev account/role | Dev | Staging | Production |
| S3 | Dev Bucket | Dev Bucket/prefix | Staging Bucket | Production Bucket |
| LiveKit | Dev | Dev | Staging | Production |
| データ | ダミー | ダミー | テスト/匿名化 | 実データ |

* Production CredentialをPreview/Stagingへ流用しない。  
* DB、S3、LiveKitは環境ごとに分離する。  
* StagingはProductionに近い構成とし、リリース前検証に使う。

# **4\. Vercel構築設計**

| 設定項目 | 設計 |
| :---- | :---- |
| Project | GitHub Repositoryと接続 |
| Framework | Next.js |
| Production Branch | main |
| Preview | Pull Request単位 |
| Environment Variables | Development / Preview / Productionで分離 |
| Region | DB/AWS利用Regionとのレイテンシを考慮 |
| Function Timeout | AI/API特性に合わせ明示設定 |
| Custom Domain | Productionのみ正式Domain |

* BrowserからDB/Bedrockへ直接接続しない。  
* Server-sideのみでDATABASE\_URL、AWS Credential、LiveKit Secretを参照する。  
* AI長時間処理がVercel実行制約へ近づく場合はSQS/Lambda等へ分離する。

# **5\. Vercel環境変数**

| 変数例 | 公開範囲 | 用途 |
| :---- | :---- | :---- |
| DATABASE\_URL | Server only | Neon接続 |
| AUTH\_SECRET | Server only | Auth.js |
| AUTH\_TRUST\_HOST | Server | Auth設定 |
| AWS\_REGION | Server | Bedrock/S3 Region |
| AWS\_ACCESS\_KEY\_ID / Role | Server only | AWS認証 |
| AWS\_SECRET\_ACCESS\_KEY | Server only | AWS認証 |
| S3\_BUCKET\_NAME | Server | 録音Bucket |
| BEDROCK\_MODEL\_ID | Server | AI Model選択 |
| LIVEKIT\_URL | Server/Public depending SDK | LiveKit endpoint |
| LIVEKIT\_API\_KEY | Server only | Token発行 |
| LIVEKIT\_API\_SECRET | Server only | Token発行 |
| NEXT\_PUBLIC\_APP\_URL | Public | UIの公開URL |

*NEXT\_PUBLIC\_接頭辞の値はBrowserへ公開されるためSecretを設定しない。*

# **6\. Neon PostgreSQL構築設計**

| 項目 | 設計 |
| :---- | :---- |
| Project | 環境ごとに分離 |
| Database | PostgreSQL |
| Connection | TLS必須 |
| Connection Pool | Serverless接続に適したPool設定 |
| ORM | Drizzle ORM |
| Migration | drizzle-kitでGit管理 |
| Backup | Provider PITR/Backup機能を利用 |
| Monitoring | 接続数、Latency、Storage、Slow query |

* Application用Credentialと管理作業用Credentialを分離する。  
* PreviewからProduction DBへ接続できないようSecretを分離する。  
* MigrationはStaging適用後にProductionへ反映する。

# **7\. DB接続構成**

Next.js Route Handler  
   │  
   ▼  
lib/db/client.ts  
   │  
   ▼  
Drizzle ORM  
   │  
   ▼ TLS  
Neon PostgreSQL

Rules:  
\- 1 requestごとに無制限なConnection生成をしない  
\- Serverless向けConnection方式を使用  
\- Raw SQLは例外扱い  
\- Queryにorganization/project条件を含める

# **8\. AWSアカウント・Region設計**

| 項目 | 方針 |
| :---- | :---- |
| AWS Account | 可能ならProductionと非Productionを分離 |
| Region | Bedrock利用可否、S3、ユーザー地域を考慮し統一 |
| Credential | 長期Access KeyよりIAM Role/OIDCを優先 |
| CloudTrail | 重要なAWS操作の追跡に利用 |
| CloudWatch | Bedrock/S3/将来Lambda等の監視 |

*Bedrockの利用可能モデル・Regionは変更される可能性があるため、Model IDとRegionは設定化する。*

# **9\. Amazon Bedrock構築設計**

| 項目 | 設計 |
| :---- | :---- |
| Model | MVP第一候補: Amazon Nova Lite。Model IDは環境変数化 |
| Access | Vercel ServerからAWS SDK経由 |
| IAM | Bedrock Invokeに必要な最小権限 |
| Timeout | 明示設定 |
| Retry | 429/5xx/一時障害のみ指数バックオフ |
| Application Retry | Schema失敗再生成とは別管理 |
| Logging | model\_id/prompt\_version/resultのみ。全文を安易に記録しない |

Vercel Function  
   │ AWS SDK  
   ▼  
Bedrock Runtime  
   │  
   ▼  
Model  
   │  
   ▼  
JSON Response  
   │  
   ├─ JSON parse  
   ├─ Zod / JSON Schema  
   ├─ ID/Evidence validation  
   └─ DB save

# **10\. Bedrock IAM最小権限**

Conceptual policy:  
\- Allow:  
  \- bedrock:InvokeModel  
  \- bedrock:InvokeModelWithResponseStream (使用時のみ)  
\- Resource:  
  \- 使用するModel/Profileに限定可能なら限定  
\- Deny:  
  \- 不要なAWSサービス操作

Productionと非ProductionでRole/Credentialを分離する。

# **11\. Amazon S3構築設計**

| 項目 | 設計 |
| :---- | :---- |
| 用途 | Meeting Recording等 |
| Bucket | 環境ごとに分離 |
| Public Access | Block Public Access |
| Encryption | Server-side encryption |
| Access | Presigned PUT/GET URL |
| Versioning | 削除復旧要件に応じ有効化 |
| Lifecycle | 録音保持期間に応じ自動削除/移行 |
| CORS | 必要Origin/Methodのみに限定 |

s3://\<bucket\>/  
  organizations/\<organizationId\>/  
    projects/\<projectId\>/  
      meetings/\<meetingId\>/  
        recordings/\<recordingId\>.\<ext\>

# **12\. S3 Presigned URLフロー**

1\. BrowserがUpload URL発行APIを呼ぶ。

2\. Vercel APIがSessionとMeeting/Project権限を検証する。

3\. Content-Type、想定Size、Object Keyを検証・生成する。

4\. AWS SDKで短期Presigned PUT URLを発行する。

5\. BrowserがS3へ直接Uploadする。

6\. 完了後にDBへRecording metadataを登録する。

7\. Download時も権限確認後に短期GET URLを発行する。

# **13\. LiveKit構築設計**

| 項目 | 設計 |
| :---- | :---- |
| Hosting | LiveKit CloudをMVP推奨 |
| Room | Meeting単位 |
| Token | Vercel Serverで発行 |
| TTL | 短時間 |
| Identity | Server側user\_idベース |
| Permissions | Join/Publish/Subscribeを必要範囲で設定 |
| Recording | MVP要件に合わせ有効化 |

Browser  
  │ POST /api/meetings/:id/token  
  ▼  
Vercel  
  ├─ Auth  
  ├─ Project authorization  
  └─ Generate short-lived LiveKit token  
        │  
        ▼  
     LiveKit Room

# **14\. DNS・ドメイン設計**

| 項目 | 方針 |
| :---- | :---- |
| Production Domain | 例: app.example.com |
| DNS | Vercel指定Recordを設定 |
| HTTPS | Vercel管理証明書 |
| Staging | staging.example.com等を利用可能 |
| Preview | Vercel Preview Domain |

* Auth Callback URLへProduction/Stagingの正しいDomainを登録する。  
* Cookie Domain/SameSite設定と矛盾しないようにする。

# **15\. GitHub構築設計**

| 項目 | 設計 |
| :---- | :---- |
| Repository | Private推奨 |
| main | 保護Branch |
| Pull Request | Review \+ CI必須 |
| Secrets | GitHub Actions Secret |
| Dependabot | 有効化推奨 |
| Actions | CI / Security / Release |

* Production SecretをRepository Variableへ平文登録しない。  
* mainへの直接Pushを禁止する。  
* CIでlint/typecheck/test/buildを必須化する。

# **16\. GitHub Actions構成**

.github/workflows/  
├─ ci.yml  
│  ├─ npm ci  
│  ├─ lint  
│  ├─ typecheck  
│  ├─ unit test  
│  └─ build  
├─ security.yml  
│  ├─ dependency audit  
│  └─ secret scan  
└─ release.yml  
   ├─ migration check  
   ├─ production deploy  
   └─ smoke test

# **17\. Secret管理設計**

| Secret種別 | 管理先 | 備考 |
| :---- | :---- | :---- |
| Vercel App Secret | Vercel Environment Variables | 環境ごとに分離 |
| GitHub CI Secret | GitHub Actions Secrets | PRへの露出に注意 |
| AWS Credential | IAM/OIDC推奨 | Access Key利用時はRotate |
| DB Credential | Neon | Application/Admin分離 |
| LiveKit Secret | Vercel Secret | Browser露出禁止 |

* .env.localをGitへCommitしない。  
* .env.exampleにはKey名のみ記載する。  
* Secret漏洩時は即Rotateできる構成とする。

# **18\. IAM / 権限設計**

| 主体 | 必要権限 |
| :---- | :---- |
| Vercel Application | Bedrock Invoke、対象S3 Bucketの限定操作 |
| Developer | 非Production中心。Production最小限 |
| Release Manager | Production Deploy/Migration権限 |
| System Admin | IAM/Secret/Provider管理 |
| GitHub Actions | CIに必要な権限。ProductionはRelease Workflowのみ |

*AWS IAMはLeast Privilegeを原則とし、S3は対象Bucket/Prefix、Bedrockは必要Actionに限定する。*

# **19\. ネットワーク・通信設計**

| 通信 | 保護 |
| :---- | :---- |
| Browser ↔ Vercel | HTTPS |
| Vercel ↔ Neon | TLS |
| Vercel ↔ AWS | HTTPS \+ AWS署名 |
| Browser ↔ S3 | HTTPS \+ Presigned URL |
| Browser ↔ LiveKit | TLS/WebRTC Secure Transport |

* MVPではVPC内閉域化よりマネージドサービスのTLS/IAM/Secret分離を優先する。  
* 企業要件でPrivate Networkingが必要になった場合は構成を再設計する。

# **20\. 監視・Observability**

| 対象 | 監視項目 |
| :---- | :---- |
| Vercel | 5xx、Function Error、Latency、Deploy Error |
| Neon | Connection、Latency、Storage、Long Query |
| Bedrock | Invocation Error、Throttle、Latency |
| S3 | 4xx/5xx、Upload失敗 |
| LiveKit | Token/Room/Connection失敗 |
| Business | AI success、Schema success、Ticket registration |

* request\_idでVercel Application Logと業務Errorを追跡可能にする。  
* 会議本文・SecretをLogへ出さない。

# **21\. バックアップ・DR**

| 対象 | 方式 | 復旧 |
| :---- | :---- | :---- |
| Neon | PITR/Provider Backup | Point-in-time Restore |
| S3 | Versioning/Lifecycle/保持設計 | Object Restore |
| Application | GitHub/Vercel Deployment履歴 | Rollback |
| Prompt/Schema | Git version | 前Versionへ戻す |
| Infra Config | 設定手順/将来IaC | 再構築 |

*MVPではRPO 24時間以内、RTO 4時間以内を暫定目標とし、契約要件確定後に再定義する。*

# **22\. コスト設計**

| サービス | 主因 | MVP対策 |
| :---- | :---- | :---- |
| Vercel | Function、帯域 | Polling抑制、Cache |
| Neon | Compute、Storage | Index、不要データ削減 |
| Bedrock | Input/Output量 | Chunk、Prompt最小化 |
| S3 | Recording容量 | Lifecycle、保持期間 |
| LiveKit | 接続/転送 | 会議終了制御 |

* 月次Budget/Cost Alertを設定する。  
* AI再実行回数を無制限にしない。  
* Recording保持期間を運用設計と同期させる。

# **23\. IaC方針**

| 段階 | 方針 |
| :---- | :---- |
| MVP初期 | Vercel/Neon/LiveKitは管理画面＋構築手順書。AWSはCLI/Consoleでも可 |
| MVP安定後 | AWS S3/IAM等をTerraformまたはAWS CDKへ移行 |
| 企業導入 | 環境差分をIaCで再現可能にし、Manual driftを減らす |

infra/  
├─ README.md  
├─ environments/  
│  ├─ dev/  
│  ├─ staging/  
│  └─ prod/  
└─ aws/  
   ├─ s3  
   ├─ iam  
   └─ monitoring

*IaC導入時もSecret値そのものはState/Repositoryへ安易に埋め込まない。*

# **24\. 構築順序**

1\. GitHub Repositoryを作成しBranch Protectionを設定する。

2\. Vercel ProjectをGitHubと接続する。

3\. Neon Dev/Staging/Production DBを作成する。

4\. Drizzle Migrationを適用しDB接続を確認する。

5\. Auth設定とCallback URLを構築する。

6\. AWS Region/Account/IAMを準備する。

7\. Bedrock Model AccessとInvoke権限を確認する。

8\. S3 Bucket、Encryption、Public Block、CORSを構築する。

9\. LiveKit Project/Environmentを作成する。

10\. Vercelへ環境別Secretを登録する。

11\. GitHub Actions CIを構築する。

12\. StagingでDB/AI/S3/LiveKit接続確認を行う。

13\. Production Domain/DNSを設定する。

14\. ProductionへMigration/DeployしSmoke Testを行う。

# **25\. 構築チェックリスト**

| No. | 確認項目 |
| :---- | :---- |
| INF-01 | GitHub main Branch Protection設定済み |
| INF-02 | Vercel Preview/Production分離済み |
| INF-03 | Neon Dev/Staging/Production分離済み |
| INF-04 | Production DBへPreviewから接続不可 |
| INF-05 | AWS Bedrock Invoke権限が最小権限 |
| INF-06 | S3 Public Access Block有効 |
| INF-07 | S3 Presigned URLでUpload/Download可能 |
| INF-08 | LiveKit SecretがBrowserへ露出していない |
| INF-09 | SecretがGit Repositoryへ存在しない |
| INF-10 | CIでlint/typecheck/test/build成功 |
| INF-11 | 監視ログが取得可能 |
| INF-12 | Backup/Restore方法を確認 |
| INF-13 | Custom Domain/HTTPS正常 |
| INF-14 | Staging Smoke Test成功 |
| INF-15 | Production Smoke Test成功 |

# **26\. インフラテスト**

| ID | 試験 | 期待結果 |
| :---- | :---- | :---- |
| INF-T01 | PreviewからProduction DB接続 | 接続不可 |
| INF-T02 | S3 ObjectへPublic URL直アクセス | 拒否 |
| INF-T03 | 権限なしでPresigned URL要求 | 403 |
| INF-T04 | Bedrock権限なしRoleでInvoke | 拒否 |
| INF-T05 | LiveKit他Project Token要求 | 403 |
| INF-T06 | Production SecretのClient bundle確認 | 含まれない |
| INF-T07 | DB接続失敗時 | 安全な5xx \+ request\_id |
| INF-T08 | Bedrock一時障害 | retry/failed処理 |
| INF-T09 | Deploy rollback | 直前Versionへ戻せる |
| INF-T10 | DB Backup Restore手順 | 復旧手順を実施可能 |

# **27\. 障害時のインフラ縮退**

| 障害 | 縮退方針 |
| :---- | :---- |
| Bedrock | AI機能OFF。手動Minutes/Ticket継続 |
| LiveKit | オンライン会議OFF。Meeting履歴継続 |
| S3 | 録音OFF。Project/Ticket/Meeting継続 |
| Neon | 書込停止/Maintenance |
| Vercel | Provider復旧またはRollback |

*単一外部サービス障害がProject/Ticket全体停止へ波及しないようFeature Flagを用意する。*

# **28\. Codex実装への引継ぎ**

infra/  
├─ README.md  
├─ setup-checklist.md  
├─ env-matrix.md  
└─ aws/  
   ├─ iam-policy.json  
   ├─ s3-cors.json  
   └─ lifecycle.json

.github/  
└─ workflows/  
   ├─ ci.yml  
   ├─ security.yml  
   └─ release.yml

scripts/  
├─ check-env.ts  
├─ health-check.ts  
├─ smoke-test.ts  
└─ verify-secrets.ts

* インフラ設定値をコードへ直書きしない。  
* Production SecretをCodexへ直接埋め込まない。  
* 環境差分はenv-matrix.mdとVercel/Provider設定に一致させる。  
* IaC導入前でも構築手順をREADMEへ必ず残す。

# **29\. インフラDefinition of Done**

* Local / Preview / Staging / Productionが分離されている。  
* VercelからNeonへ安全に接続できる。  
* VercelからBedrockを最小権限で呼び出せる。  
* S3が非公開で、Presigned URL経由のみアクセスできる。  
* LiveKit Tokenをサーバー側で安全に発行できる。  
* Production SecretがClient/Git/CI Logへ露出していない。  
* CI/CDがmain保護と連動している。  
* 監視・Backup・Rollback・Smoke Testが定義されている。  
* 環境構築手順を再現できる。

# **30\. 設計上の重要判断**

MVPではKubernetesや独自VPCなどの重い基盤を最初から持たず、Vercel、Neon、Bedrock、S3、LiveKitのマネージドサービスを組み合わせる。インフラの複雑さより、環境分離、最小権限、Secret管理、監視、再構築可能性を優先する。AI処理やオンライン会議の負荷が増えた段階で、SQS/Lambda等の非同期基盤やTerraform/CDKによるIaCへ段階的に拡張する。