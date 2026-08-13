# 慶應ホッケーハブ（Keio Hockey Hub）

慶應義塾大学 女子フィールドホッケー部のための、チームマネジメントシステムです。

Notion や Google スプレッドシートで分かれている運営を1つにまとめ、
**選手が「今日何をすればいいか」で迷わない**ことを最優先に作っています。

```
シーズン目標 → 今週のテーマ → 今日の練習 → 練習前の準備 → 練習・試合
   → 日報 → トレーニング記録 → 動画による質問 → コーチのフィードバック
   → 次回の個人課題 → スキル進捗・承認 → 次の練習へ
```

この循環をシステム上でつなげることが目的です。

---

## いまどこまでできているか

| Phase   | 内容                                                           | 状態    |
| ------- | -------------------------------------------------------------- | ------- |
| Phase 0 | 基盤（Next.js / TypeScript / Tailwind / テスト / CI / Docker） | ✅ 完了 |
| Phase 1 | 認証・チーム・ロール・権限・RLS・モバイルナビ                  | ✅ 完了 |
| Phase 2 | データ移行（選手プロフィール）Import Center                    | ✅ 完了 |
| Phase 3 | シーズン・週・イベント・今日のダッシュボード                   | ✅ 完了 |
| Phase 4 | コンディション・個人目標・日報・トレーニング記録・提出状況     | ✅ 完了 |
| Phase 5 | YouTube動画・仮想クリップ・質問投稿                            | ✅ 完了 |
| Phase 6 | コーチ回答・再質問・チーム共有・通知（**循環が閉じた**）       | ✅ 完了 |
| Phase 7 | R2 への動画投稿・署名付き URL での再生・削除                   | ✅ 完了 |
| Phase 8 | スキル階層・申請・根拠の添付・コーチの審査・承認履歴           | ✅ 完了 |
| Phase 9 | お知らせ一覧・保存容量の集計と掃除・操作の記録・CSV 書き出し   | ✅ 完了 |
| 追加    | 測定の記録と推移（自己ベスト・前回比・折れ線）                 | ✅ 完了 |
| 追加    | スキル定義の管理・役割と権限の変更（SQL 不要で運用できる）     | ✅ 完了 |
| 追加    | 消したものを戻す（動画は30日以内、記録は期限なし）             | ✅ 完了 |
| 追加    | 招待リンク（新入部員が自分でアカウントを作れる）               | ✅ 完了 |
| 追加    | 日報へのコーチのコメント（動画を使わない、短い往復）           | ✅ 完了 |
| 追加    | 「出したこと」と「中身」を分ける（自分だけの日報も提出済み）   | ✅ 完了 |

進め方の詳細は [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)、
細かい作業一覧は [TASKS.md](TASKS.md) にあります。

**いま動くこと**

依頼書66章の「最初の到達点」と、67章の「次の到達点」まで通しで動きます。

```
管理者: ログイン → Google Sheets から選手をコピペ登録
        → シーズン作成 → 今週のテーマ作成 → 練習予定作成
        → 提出状況の確認

選手:   ログイン → 今日のダッシュボード → 今週のテーマ → 今日の練習予定
        → 練習前コンディション → 今日の個人目標
        → 練習 → 日報 → トレーニング結果
        → 練習動画から見てもらいたい場面を指定 → コーチへ質問
        → または自主練をその場で撮って投稿 → そのまま質問
        → コーチの回答を確認 → その「次回の課題」が明日の個人目標になる
        → できるようになったらスキルを申請 → 承認されて記録に残る

コーチ: 未回答の質問を確認（3日以上お待たせしているものが先頭）
        → 担当する → 回答する → 必要ならチーム共有を提案
        → スキル申請を審査する（承認 / 根拠を足してもらう / 見送る）
        → 提出状況からその日の日報を開いて、ひとこと返す
```

**依頼書の循環が一周つながりました。**
コーチの回答に書いた「次回の課題」は、選手の次の練習の個人目標の候補として
そのまま出てきます（`practice_goals.source_feedback_id` に出どころを残します）。
回答にスキルを結び付けておくと、選手はその回答を根拠にそのまま申請できます。

積み上がったものは「今日」の画面に到達度として出ます。
記録が形として残ることが、続ける支えになります。

測定の記録は、項目ごとに推移を折れ線で見られます。
50m走のように**小さいほど良い項目でも、線は良い方向が上**になります。
自己ベストを更新すると「今日」の画面に出ます。

記録は CSV で取り出せます（「書き出し」）。
出るのは自分に見えているものだけで、選手が押せば自分の記録、
コーチが押せば見える範囲すべてが出ます。
Excel でも Google スプレッドシートでも開けます。

「今日」の画面は、練習前・練習中・練習後で出す内容が変わります。
練習前に日報を求めたり、オフの日に記録を迫ったりはしません。

長い動画は YouTube に限定公開で置き、このシステムは
「どの動画の、どこからどこまでか」だけを覚えます（[docs/video-architecture.md](docs/video-architecture.md)）。

短い動画（既定で60秒・50MBまで）は Cloudflare R2 に置きます。
動画本体はこのシステムのサーバーを通らず、ブラウザから直接送られます。
再生用のリンクはその都度発行し、保存しません（[docs/storage.md](docs/storage.md)）。
投稿した動画は、はじめはコーチとスタッフだけが見られます。

---

## 動かし方

### 1. 必要なもの

- Node.js 22 以上
- pnpm 10 以上
- Supabase のプロジェクト（無料枠で始められます）
- Cloudflare R2（短い動画の投稿に必要。未設定でも他の機能は動きます）

### 2. 準備

```bash
cd keio-hockey-hub
pnpm install
cp .env.example .env.local
```

`.env.local` に Supabase の値を入れます。値は Supabase の
「Project Settings → API」から取得できます。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> `SUPABASE_SERVICE_ROLE_KEY` はサーバーだけで使う鍵です。
> `NEXT_PUBLIC_` を付けてはいけません（ブラウザに配られてしまいます）。

短い動画の投稿を使う場合は、Cloudflare R2 の値も入れます。
未設定でも他の機能は動きます（投稿画面だけが「まだ使えません」と出ます）。

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=https://<accountId>.r2.cloudflarestorage.com
STORAGE_LIMIT_BYTES=26843545600
```

> Bucket は Public Access を無効にしてください。
> ブラウザから直接 PUT するので、CORS の設定も要ります。
> 手順は [docs/storage.md](docs/storage.md) の8章にあります。

### 3. データベースを作る

Supabase の SQL Editor で、`supabase/migrations/` の中を **番号順に** 実行します。

```
0001_core.sql              チーム・プロフィール・所属・権限
0002_auth_helpers.sql      RLS から呼ぶ補助関数
0003_timeline.sql          シーズン・週・イベント
0004_daily.sql             コンディション・日報・トレーニング
0005_files_videos.sql      ファイル・動画・仮想クリップ
0006_feedback_skills.sql   動画フィードバック・スキル
0007_import_notifications.sql  データ移行・通知・測定
0008_rls.sql               Row Level Security
0009_master_data.sql       ロールと権限のマスタ（必須）
0010_grants.sql            テーブル権限
0011_cross_team_reference_guard.sql  別チームのレコードを参照させない
0012_video_visibility_fix.sql        公開範囲を「見てよい人」の判定に効かせる
0013_soft_delete_rpc.sql             動画の論理削除（RLS を通すための関数）
0014_skill_guards.sql                自分で自分を承認させない・履歴を自動で残す
0015_notification_insert.sql         通知を作れるようにする（ポリシーが無かった）
0016_storage_ops.sql                 容量の集計と掃除（関数を通す）
0017_measurement_guards.sql          測定の参照先チェックと、自分の記録の入力
0018_role_guards.sql                 役割を自分で上げられないようにする
0019_soft_delete_visibility.sql      消した記録が消した人からも見えないようにする
0020_restore.sql                     消したものを戻せるようにする
0021_invitations.sql                 招待リンク（生の値は保存しない）
0022_report_feedback.sql             日報のコメントを、日報の公開範囲に合わせる
0023_submission_status.sql           出したことと中身を分ける（RLS では書けないため）
```

Supabase CLI が使える場合は次でも構いません。

```bash
pnpm db:reset   # migration → seed をまとめて流す
```

開発用のサンプルデータが要るときは `supabase/seed.sql` も実行します。

> **SQL が要るのは最初の1人だけです。**
> 2人目以降は「招待」からリンクを渡せば、本人がアカウントを作れます。
> 役割の変更も画面から行えます（名簿 → 設定）。

### 4. 最初の管理者を作る

移行で作る選手は「まだログインしていない人」として登録されます（[ADR-0002](docs/decisions/0002-profile-identity.md)）。
最初の管理者だけは手で作ります。

1. Supabase の Authentication → Users → 「Add user」でメールとパスワードを登録する
2. SQL Editor で次を実行し、その利用者をチームの管理者にする

```sql
-- 1) チームを作る（すでにあれば飛ばす）
insert into public.teams (name, display_name, slug)
values ('keio-hockey', '慶應義塾大学 女子フィールドホッケー部', 'keio-hockey')
on conflict (slug) do nothing;

-- 2) 作った auth ユーザーに紐づくプロフィールと所属を作る
with u as (
  select id, email from auth.users where email = 'ここに管理者のメール'
), t as (
  select id from public.teams where slug = 'keio-hockey'
), p as (
  insert into public.profiles (user_id, full_name, email)
  select u.id, '管理者の氏名', u.email from u
  returning id
)
insert into public.team_members (team_id, profile_id, role_code, status)
select t.id, p.id, 'system_admin', 'active' from t, p;
```

### 5. 起動する

```bash
pnpm dev
```

<http://localhost:3000> を開きます。
設定が正しいかどうかは <http://localhost:3000/setup-check> で確認できます
（設定済みかどうかだけを表示し、値そのものは表示しません）。

---

## 過去データの移行

Google スプレッドシートの選手名簿を、そのままコピー＆ペーストで取り込めます。

```
管理者でログイン → 「データ移行」
  → スプレッドシートで範囲を選んでコピー → 貼り付け
  → 列の対応づけを確認 → プレビューで件数と警告を確認 → 取り込む
```

- 「名前 / 氏名 / 選手名 / Player」などの表記ゆれは自動で対応づけます
- 「3 / 3年 / 3年生」「Forward / フォワード / FW」なども吸収します
- 判断できないものは**勝手に決めず**、警告やエラーとして 人に返します
- 既定では**既存データを上書きしません**
- 取り込んだあと、その回ぶんをまとめて**取り消せます**

詳しくは [docs/import.md](docs/import.md) と [docs/migration-guide.md](docs/migration-guide.md) を参照してください。

---

## 開発

```bash
pnpm dev           # 開発サーバー
pnpm type-check    # 型検査
pnpm lint          # ESLint
pnpm test          # 単体テスト（Vitest）
pnpm test:e2e      # E2E（Playwright）
pnpm build         # 本番ビルド
pnpm db:test       # Migration + RLS + 制約テスト（一時的な PostgreSQL を立てて実行）
pnpm check         # 型・Lint・単体テスト・ビルドをまとめて
```

### テストの構成

| 種類 | 場所                   | 何を守るか                                                                      |
| ---- | ---------------------- | ------------------------------------------------------------------------------- |
| 単体 | `src/**/*.test.ts`     | 権限判定、Import の解析・正規化・照合、容量・動画の制限、今日やることの判定     |
| DB   | `supabase/tests/*.sql` | RLS（他人の日報が見えないこと等）、状態遷移、制約、別チーム参照の禁止、公開範囲 |
| E2E  | `e2e/`                 | 未ログイン時の振り分け、入力欄、スマートフォン幅での崩れ                        |

`e2e/authenticated/` は Supabase を用意した環境でだけ動きます。

```bash
E2E_SUPABASE=1 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm test:e2e
```

### 型の生成

`src/types/database.types.ts` は現在手で書いています。
Supabase をローカルに用意できる環境では、生成に切り替えてください。

```bash
pnpm db:types
```

---

## ドキュメント

| 文書                                                     | 内容                                              |
| -------------------------------------------------------- | ------------------------------------------------- |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)         | 要件の理解・MVP・Phase 計画・技術的なリスク・前提 |
| [TASKS.md](TASKS.md)                                     | 作業のチェックリスト                              |
| [docs/architecture.md](docs/architecture.md)             | 全体構成、レイヤー、インフラの役割分担            |
| [docs/database.md](docs/database.md)                     | ER図とテーブルの説明                              |
| [docs/permissions.md](docs/permissions.md)               | ロールと権限、RLS の考え方                        |
| [docs/workflows.md](docs/workflows.md)                   | ログイン・1日の流れ・フィードバック・スキル承認   |
| [docs/import.md](docs/import.md)                         | Import Center の設計                              |
| [docs/migration-guide.md](docs/migration-guide.md)       | 実際の移行手順                                    |
| [docs/video-architecture.md](docs/video-architecture.md) | 3種類の動画の扱い、仮想クリップ                   |
| [docs/storage.md](docs/storage.md)                       | R2、Presigned URL、ファイルの一生                 |
| [docs/capacity-planning.md](docs/capacity-planning.md)   | 容量の見積もりと上限                              |
| [docs/security.md](docs/security.md)                     | 守ること、守り方                                  |
| [docs/deployment.md](docs/deployment.md)                 | 公開手順                                          |
| [docs/decisions/](docs/decisions/)                       | 設計判断の記録（ADR）                             |

---

## このリポジトリについて

このリポジトリには複数のプロジェクトが入っています。

- ルート: `hearth-life`（Discord ライフログ Bot / Python）
- `hearth-growth/`: 活動時間を共有する Web アプリ（Next.js + Supabase）
- `keio-hockey-hub/`: **このプロジェクト**

それぞれ独立していて、依存関係も設定も分かれています。
