# 作業一覧

- [x] 完了
- [ ] 未着手

最終更新: 2026-08-12

---

## Phase 0: 基盤

- [x] Next.js 16 + App Router + TypeScript (strict) の初期化
- [x] `noUncheckedIndexedAccess` を有効化
- [x] Tailwind CSS v4 の設定と配色（慶應の濃紺 + 行動を示すアクセント）
- [x] shadcn/ui 風の部品（Button / Card / Field / Badge）
- [x] Lucide Icons
- [x] date-fns と Asia/Tokyo の扱い（`lib/datetime.ts`）
- [x] Supabase クライアント（browser / server / admin）
- [x] Cloudflare R2 接続設定（`ObjectStorage` 抽象と `CloudflareR2Storage`）
- [x] 環境変数の検証（`lib/env.ts`、公開値とサーバー値を型で分離）
- [x] `.env.example`
- [x] ESLint（`any` 禁止を含む）
- [x] Prettier
- [x] Vitest + React Testing Library
- [x] Playwright
- [x] Docker / docker-compose（standalone 出力）
- [x] GitHub Actions（アプリ / データベースの2ジョブ）
- [x] エラー処理（`error.tsx` / `not-found.tsx`）
- [x] 設定の自己診断ページ（`/setup-check`）
- [x] README
- [ ] ログ出力の基盤（現在は console。監視サービスへの送信は未着手）
- [ ] Recharts を使ったグラフ（Phase 9 の成長表示で使う）

## Phase 1: 認証・チーム・権限

- [x] `proxy.ts`（Next.js 16 で middleware から改称）
- [x] セッション更新と未ログイン時の振り分け
- [x] ログイン画面
- [x] ログアウト
- [x] パスワード再設定の要求
- [x] メールリンクの受け取り（`/auth/confirm`）
- [x] Team / Profile / TeamMember のテーブル
- [x] Role（system_admin / coach / manager / player）
- [x] Permission 基盤（role_permissions + member_permissions）
- [x] `hasPermission()`（TypeScript）
- [x] `app.has_permission()`（SQL）
- [x] `requireSession()` / `requirePermission()` / `can()`
- [x] RLS 全テーブル適用
- [x] RLS テスト（14項目）
- [x] モバイル下部ナビゲーション + PC 横ナビゲーション
- [x] 名簿画面（在籍中 / 卒業・退部の切り替え）
- [x] 設定画面（自分の権限が見える）
- [ ] 招待メールの送信（現在は Supabase 管理画面 + SQL で対応）
- [ ] 招待リンクの受け取り画面（`team_invitations` テーブルは作成済み）
- [ ] プロフィール編集画面
- [ ] プロフィール画像のアップロード
- [ ] 管理者による Role / Permission の変更画面

## Phase 2: 過去データ移行

- [x] `import_sessions` / `import_rows` / `import_mappings` / `import_record_links`
- [x] 貼り付け（Tab 区切り）の解析
- [x] CSV の解析（RFC 4180、引用符・改行・BOM・CRLF）
- [x] 区切り文字の自動判別
- [x] 行数・容量の上限
- [x] 列マッピングの自動推測（表記ゆれ対応）
- [x] 列マッピングの手動修正
- [x] 必須項目・二重割り当ての検出
- [x] 日付の正規化（複数形式、曖昧なら警告）
- [x] 学年の正規化
- [x] ポジションの正規化
- [x] 背番号・メール・入学年度の正規化
- [x] 学年と入学年度の突き合わせ（警告のみ）
- [x] 選手照合（external_id → email → 氏名 → 補助情報）
- [x] 同姓同名の候補表示
- [x] プレビュー（総件数・正常・警告・エラー・新規・更新・スキップ）
- [x] 行ごとの詳細表示
- [x] エラー行を除いた実行
- [x] Upsert モード3種（既定は insert_only）
- [x] 選手プロフィールの取り込み
- [x] Import Session の記録
- [x] ロールバック（この回で作った行を削除）
- [x] 監査ログ（実行・取り消し）
- [x] 権限制御（`import.execute`、CSV の team_id を信用しない）
- [x] 単体テスト（解析・正規化・マッピング・照合・全体）
- [ ] シーズン / 週 / 練習予定の取り込み
- [ ] 日報の取り込み
- [ ] トレーニング記録の取り込み
- [ ] スキル進捗・スキル申請履歴の取り込み
- [ ] 測定結果の取り込み
- [ ] CSV テンプレートのダウンロード
- [ ] 旧ホッケー部スプレッドシート専用 Importer（実データ構造の確認後）

## Phase 3: 時間軸

- [x] `seasons` / `season_goals` / `milestones` / `competitions`
- [x] `weeks`
- [x] `events` / `event_participants`
- [x] シーズンの作成
- [x] 週（今週のテーマ）の作成
- [x] 練習予定の作成
- [x] イベント日から週・シーズンを自動で結び付け
- [x] 予定一覧（4週間ぶん、日付ごと）
- [x] 予定の詳細（メニュー・持ち物・注意事項）
- [x] 選手向け「今日」のダッシュボード
- [x] コーチ向け「今日」のダッシュボード
- [x] 「残っていること」の判定（練習前 / 中 / 後で変わる）
- [x] 未公開（下書き）はスタッフだけに見せる
- [x] 単体テスト（今日やることの判定、入力検証）
- [ ] シーズン・週・イベントの編集と削除
- [ ] 週の一括作成（シーズン期間から自動生成）
- [ ] 出欠の登録
- [ ] 練習メニューの定型化（`practice_menus`）

## Phase 4: 日報・トレーニング

- [x] `daily_conditions` / `practice_goals` / `daily_reports` / `report_feedbacks`
- [x] `training_records` / `training_exercises` / `training_sets`
- [x] RLS（本人 / staff / team の3段階）
- [x] 練習前コンディションの入力画面（1〜5の大きなタップ領域、痛みの申告）
- [x] 今日の個人目標の入力画面（前回の「次回取り組むこと」を引き継ぐ）
- [x] 日報の入力画面（下書き保存、公開範囲の既定は staff）
- [x] 日報の深掘り項目を畳んでおく（原因・改善・再発防止・対処）
- [x] 空の日報は提出させない（下書きにはできる）
- [x] トレーニング記録の入力画面（種別ごとに項目が変わる）
- [x] 実施時間を開始・終了時刻から自動計算
- [x] ペースを距離と時間から自動計算
- [x] ウェイトの種目・重量・回数・セット数
- [x] コーチ向け提出状況の一覧（未提出者を上に並べる）
- [x] 過去の日報・トレーニングの閲覧
- [x] 「今日」から各記録への導線（入力済みが一目で分かる）
- [x] 単体テスト（入力検証、実施時間、ペース、セット展開）
- [x] 自主練動画からフィードバック依頼を作る導線（Phase 7 で実装）
- [ ] 日報へのコーチコメント（`report_feedbacks` テーブルは作成済み）
- [ ] 記録の編集・削除の画面（`deleteTrainingRecord` は実装済み、画面が未接続）
- [ ] 出席していない日に記録を求めない（出欠と連動させる）

## Phase 5: YouTube 動画

- [x] `videos` / `video_clips` / `video_tags`
- [x] `VideoProvider` 抽象と `YouTubeVideoProvider`
- [x] YouTube URL からの動画ID抽出（watch / youtu.be / embed / live / shorts）
- [x] 埋め込み URL の組み立て（開始・終了位置つき）
- [x] クリップ範囲の検証（アプリ側とDB側の両方）
- [x] 動画の登録画面（URL を貼るだけ。動画IDを取り出す）
- [x] 同じ動画の二重登録を防ぐ
- [x] 動画一覧（サムネイル付き）
- [x] プレイヤー画面（埋め込み再生）
- [x] 場面を指定してクリップを作る UI（12:34 の形で入力）
- [x] クリップを選ぶとその範囲だけ再生する
- [x] クリップからの質問投稿（26章のテンプレート、公開範囲の既定は private_staff）
- [x] 質問の一覧（回答待ちなどの状態を表示）
- [x] 別チームの動画・クリップを参照できないようにする（0011）
- [x] 単体テスト（URL解析、埋め込みURL、長さ、クリップ範囲、質問）
- [x] DBテスト（動画・クリップ・質問の書き込みと RLS）
- [x] 動画の削除（Phase 7。論理削除 → 30日 → 物理削除）
- [ ] 動画の編集（題名・公開範囲の変更）
- [ ] クリップの削除（`soft_delete_video_clip` は実装済み、画面が未接続）
- [ ] 動画にタグを付ける（`video_tags` は作成済み）

## Phase 6: 動画フィードバック

- [x] `feedback_requests` / `feedback_responses` / `feedback_messages`
- [x] `feedback_status_histories` / `feedback_share_requests`
- [x] 状態遷移の制約（トリガ）と履歴の自動記録
- [x] 質問テンプレート（26章の8種類）
- [x] 質問投稿の画面（Phase 5 で実装済み）
- [x] 参照先のチーム一致をトリガで保証（0011）
- [x] コーチの回答画面（28章の構造化された項目。必須は結論だけ）
- [x] 担当の割り当て
- [x] 再質問（follow_up へ戻る）
- [x] 選手の確認（acknowledged）
- [x] チーム共有の提案と選手の承認（承認できるのは本人だけ）
- [x] 3日以上未回答の抽出（一覧の先頭と今日の画面に出す）
- [x] 通知（アプリ内。notifications へ記録）
- [x] 回答は上書きせず追記（55章）
- [x] 状態遷移の表を1か所にまとめ、画面のボタンをそこから作る
- [x] 単体テスト（遷移・権限・待ち日数 25件）
- [x] DBテスト（質問→回答→確認→再質問→共有→次回課題 16件）
- [ ] 通知の一覧画面（Phase 9）
- [ ] 選ばれた人だけに公開（selected_members）の運用

## Phase 7: R2 動画投稿

- [x] `files` / `upload_sessions` / `file_relations` / `file_deletion_jobs`
- [x] `ObjectStorage` 抽象と `CloudflareR2Storage`
- [x] storage key の組み立て（氏名を含めない、チームで区切る）
- [x] 受け入れ判定（形式・容量・長さ・1日の本数）
- [x] 単体テスト
- [x] Upload Session の作成（1日の本数は申告ではなく DB を見て数える）
- [x] Presigned PUT URL の発行（DB には保存しない）
- [x] ブラウザからの直接アップロード（進み具合の表示つき）
- [x] アップロード後の実物確認（容量と種別を R2 に問い合わせる）
- [x] Signed GET URL の発行（開くたびに発行、既定15分）
- [x] 動画メタデータの記録（`files` → `videos`、既定は private_staff）
- [x] 公開範囲を「見てよい人」の判定に効かせる（0012）
- [x] 削除（論理削除 → 30日 → 物理削除の予約。0013 の関数を通す）
- [x] 投稿画面 `/videos/upload` と、動画一覧・詳細からの導線
- [x] 自主練動画からフィードバック依頼を作る導線
- [x] DBテスト（アップロードの一周と公開範囲 18件）
- [ ] 一時アップロードの掃除（24時間）
- [ ] `file_deletion_jobs` を実際に実行する仕組み（Phase 9）

## Phase 8: スキル

- [x] `skill_categories` / `skills`（大分類 → 中目標 → 小目標）
- [x] `player_skills` / `skill_applications` / `skill_application_items`
- [x] `skill_reviews` / `skill_status_histories`
- [x] 初期の大分類8種（seed）
- [x] スキル一覧・進捗表示（大分類ごとと全体。数えるのは小目標だけ）
- [x] スキル申請（根拠が0件でも出せる）
- [x] 根拠（動画・クリップ・フィードバック・補足）の添付
- [x] コーチの審査（承認・差し戻し・見送り。差し戻しと見送りは理由が必須）
- [x] 承認と履歴（承認者と時刻はトリガが入れる）
- [x] フィードバック回答からスキル申請への導線
- [x] 選手が自分で自分を承認できないようにする（0014）
- [x] 別チームの動画・質問を根拠にできないようにする（0014）
- [x] 差し戻された申請を「今日」に出す
- [x] 単体テスト（状態遷移・進捗の集計・次に取り組むもの 22件）
- [x] DBテスト（申請→差し戻し→承認、履歴、通知 28件）
- [ ] スキル定義（大分類・目標）をコーチが画面から編集する
- [ ] コーチが選手ごとのスキル進捗を見る画面
- [ ] 承認済みスキルの取り消し（DB では審査担当だけ可能。画面が未接続）

## Phase 9: 運用管理

- [x] `audit_logs` / `app_settings` / `storage_usage_snapshots`
- [x] `measurement_events` / `measurement_items` / `measurement_results`
- [x] `notifications` / `notification_targets`
- [ ] Storage 使用量の集計と表示
- [ ] 容量警告（70% / 85% / 95%）
- [ ] CSV エクスポート
- [ ] 監査ログの閲覧画面
- [ ] 測定結果の入力と推移表示
- [ ] 通知一覧画面
- [ ] バックアップ手順の自動化
- [ ] 卒業・退部の一括処理

## ドキュメント

- [x] README.md
- [x] IMPLEMENTATION_PLAN.md
- [x] TASKS.md
- [x] docs/architecture.md
- [x] docs/database.md
- [x] docs/permissions.md
- [x] docs/workflows.md
- [x] docs/import.md
- [x] docs/migration-guide.md
- [x] docs/video-architecture.md
- [x] docs/storage.md
- [x] docs/capacity-planning.md
- [x] docs/security.md
- [x] docs/deployment.md
- [x] docs/decisions/0001-tech-stack.md
- [x] docs/decisions/0002-profile-identity.md
- [x] docs/decisions/0003-import-write-path.md
- [x] docs/decisions/0004-preview-before-write.md
- [x] docs/decisions/0005-normalization-policy.md

### Mermaid 図（依頼書73章）

- [x] System Architecture（architecture.md）
- [x] ER Diagram（database.md、3枚に分割）
- [x] Login Flow（workflows.md）
- [x] Daily Flow（workflows.md）
- [x] Import Flow（import.md）
- [x] Video Upload Flow（video-architecture.md）
- [x] Virtual Clip Flow（video-architecture.md）
- [x] Feedback Flow（workflows.md、状態遷移図とシーケンス図）
- [x] Skill Approval Flow（workflows.md）
- [x] File Lifecycle Flow（storage.md）

## テスト

- [x] 単体: 権限判定
- [x] 単体: storage key の組み立てと検算
- [x] 単体: アップロードの受け入れ判定（容量・長さ・MIME・1日の本数）
- [x] 単体: クリップ範囲の検証
- [x] 単体: タイムコードの相互変換
- [x] 単体: 貼り付け・CSV の解析
- [x] 単体: 日付・学年・ポジションなどの正規化
- [x] 単体: 列マッピングの自動推測
- [x] 単体: 選手照合
- [x] 単体: 取り込み全体の流れ
- [x] 単体: 今日やることの判定
- [x] 単体: 入力検証（シーズン・週・イベント）
- [x] 単体: 入力検証（コンディション・目標・日報）
- [x] 単体: 実施時間・ペース・ウェイトのセット展開
- [x] 単体: YouTube URL の解析と埋め込みURLの組み立て
- [x] 単体: 動画登録・クリップ範囲・質問の入力検証
- [x] 単体: フィードバックの状態遷移と、誰が何をできるか
- [x] 単体: 認証エラーの日本語化
- [x] DB: RLS（14項目）
- [x] DB: 状態遷移・クリップ・背番号の制約（10項目）
- [x] DB: 動画・クリップ・質問の書き込みと別チーム参照の禁止（16項目）
- [x] DB: フィードバックの一周（回答・確認・再質問・共有・次回課題 16項目）
- [x] DB: アップロードの一周と公開範囲・論理削除（18項目）
- [x] DB: スキルの申請・差し戻し・承認・履歴・通知（28項目）
- [x] 単体: スキルの状態遷移と進捗の集計
- [x] 単体: アップロードの計画・実物の検証・セッションの期限
- [x] E2E: 未ログイン時の振り分け
- [x] E2E: ログイン画面の入力欄
- [x] E2E: スマートフォン幅での崩れ・タップ領域・文字サイズ
- [x] E2E: Import の流れ（Supabase 必要）
- [x] E2E: 選手の1日 — 今日・コンディション・目標・日報・トレーニング（Supabase 必要）
- [x] E2E: 動画の流れ — 登録・場面指定・質問（Supabase 必要）
- [x] E2E: コーチ回答 → 選手確認 → 次回課題（Supabase 必要）
- [ ] E2E: R2 アップロード（実際の R2 を用意できる環境が要る。
      判定とセッションの扱いは単体テストと DB テストで押さえてある）
- [ ] 統合: Server Action レベルのテスト
- [ ] アクセシビリティの自動確認（axe）

## 積み残し・気になっていること

- [ ] `src/types/database.types.ts` を手書きから生成に切り替える
- [ ] ログを監視サービスへ送る
- [ ] 複数チームへの所属（データ構造は対応済み、画面が未対応）
- [ ] 通知の既読管理（テーブルはある）
- [ ] `import_rows` を実際に使う（現在は `import_record_links` のみ）
- [ ] 監査ログの自動削除（5年）
- [ ] 公開範囲を「自分だけ」にした日報が、コーチの提出状況では「未提出」に見える。
      RLS は行単位なので「あることは見せるが中身は見せない」が書けないため。
      ビューを作るか、提出の事実だけを別テーブルに持つかを検討する
