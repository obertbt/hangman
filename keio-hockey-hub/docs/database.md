# データベース

## 1. 中心にある形

```
シーズン
└── 週
    └── イベント（練習・試合）
        ├── 練習前（コンディション・個人目標）
        ├── 練習中
        ├── 練習直後（日報）
        └── 帰宅後（トレーニング記録・動画質問）
```

この形が崩れると、他の機能もつながらなくなります。
`seasons` → `weeks` → `events` は最初に作り、後から変えにくい部分です。

## 2. ER図（中心部分）

```mermaid
erDiagram
  teams ||--o{ team_members : "所属"
  profiles ||--o{ team_members : "人"
  roles ||--o{ team_members : "役割"
  roles ||--o{ role_permissions : ""
  permissions ||--o{ role_permissions : ""
  team_members ||--o{ member_permissions : "個別の上書き"

  teams ||--o{ seasons : ""
  seasons ||--o{ season_goals : ""
  seasons ||--o{ milestones : ""
  seasons ||--o{ competitions : ""
  seasons ||--o{ weeks : ""
  weeks ||--o{ events : ""
  events ||--o{ event_participants : ""
  team_members ||--o{ event_participants : ""

  events ||--o{ daily_conditions : ""
  events ||--o{ practice_goals : ""
  events ||--o{ daily_reports : ""
  team_members ||--o{ daily_reports : "書いた人"
  daily_reports ||--o{ report_feedbacks : ""

  team_members ||--o{ training_records : ""
  training_records ||--o{ training_exercises : ""
  training_exercises ||--o{ training_sets : ""

  teams {
    uuid id PK
    text display_name
    text slug UK
  }
  profiles {
    uuid id PK
    uuid user_id FK "null = 未ログイン"
    text full_name
    text email
  }
  team_members {
    uuid id PK
    uuid team_id FK
    uuid profile_id FK
    text role_code FK
    text status "active/inactive/graduated/leave"
    int jersey_number
    int grade
    text external_id "移行元のID"
  }
  seasons {
    uuid id PK
    date start_date
    date end_date
    text goal
    text status
  }
  weeks {
    uuid id PK
    date start_date
    date end_date
    text theme "今週のテーマ"
  }
  events {
    uuid id PK
    date event_date
    time start_time
    text event_type
    text menu
  }
  daily_reports {
    uuid id PK
    date report_date
    text visibility "private/staff/team"
    text status "draft/submitted"
  }
```

## 3. ER図（動画・フィードバック・スキル）

```mermaid
erDiagram
  files ||--o{ upload_sessions : ""
  files ||--o{ file_relations : ""
  files ||--o| videos : "R2 の動画"
  videos ||--o{ video_clips : "仮想クリップ"

  videos ||--o{ feedback_requests : ""
  video_clips ||--o{ feedback_requests : ""
  team_members ||--o{ feedback_requests : "質問した人"
  feedback_requests ||--o{ feedback_responses : "回答（追記のみ）"
  feedback_requests ||--o{ feedback_messages : "再質問"
  feedback_requests ||--o{ feedback_status_histories : "状態の履歴"
  feedback_requests ||--o{ feedback_share_requests : "チーム共有の依頼"

  skill_categories ||--o{ skills : ""
  skills ||--o{ skills : "中目標→小目標"
  skills ||--o{ player_skills : ""
  team_members ||--o{ player_skills : ""
  skills ||--o{ skill_applications : ""
  skill_applications ||--o{ skill_application_items : "根拠の動画"
  skill_applications ||--o{ skill_reviews : ""
  player_skills ||--o{ skill_status_histories : ""

  files {
    uuid id PK
    text storage_provider
    text storage_key UK "氏名を含めない"
    bigint size_bytes
    text upload_status
    text visibility
    timestamptz deleted_at
  }
  videos {
    uuid id PK
    text provider "youtube/r2/..."
    text provider_video_id
    uuid file_id FK
    numeric duration_seconds
  }
  video_clips {
    uuid id PK
    numeric start_seconds
    numeric end_seconds "元動画を超えない"
  }
  feedback_requests {
    uuid id PK
    text status "9種類"
    text visibility "既定 private_staff"
    text question_type
  }
  player_skills {
    uuid id PK
    text status "not_started/applied/feedback/approved"
  }
```

## 4. ER図（データ移行）

```mermaid
erDiagram
  import_sessions ||--o{ import_rows : "1行ずつの解析結果"
  import_sessions ||--o{ import_mappings : "列の対応づけ"
  import_sessions ||--o{ import_record_links : "作った行の追跡"
  import_rows ||--o{ import_record_links : ""

  import_sessions {
    uuid id PK
    uuid team_id FK "サーバーが入れる"
    text import_type
    text source_type "paste/csv/..."
    text status
    text upsert_mode "既定 insert_only"
    int total_rows
    int error_rows
  }
  import_rows {
    uuid id PK
    int row_number
    jsonb raw_values
    jsonb normalized_values
    text status "valid/warning/error"
    text action "insert/update/skip"
    jsonb match_candidates "決められない時の候補"
  }
  import_record_links {
    uuid id PK
    text target_table
    uuid target_id
    text operation "insert/update"
    jsonb before_value "更新前の値"
  }
```

`import_record_links` があるおかげで「この取り込みを取り消す」ができます。

## 5. 決めごと

### 5.1 削除は論理削除

ほとんどのテーブルに `deleted_at` があります。
選手の記録は本人の成長の記録なので、簡単に消えてはいけません。

- 卒業・退部は `team_members.status` を変えるだけ。記録はそのまま残す（61章）
- 利用者の削除と過去記録の削除を直接つなげない

### 5.2 profiles と auth.users を分けている

`profiles.id` は `auth.users.id` と一致しません。
`profiles.user_id` が `auth.users` を指し、**null を許します**。

移行で登録した選手は、まだログインしていない状態から始まるためです。
詳しくは [ADR-0002](decisions/0002-profile-identity.md)。

### 5.3 team_id をほぼ全テーブルに持たせている

正規化だけを考えれば不要な列ですが、RLS のためにあえて持たせています。
毎回 join を辿らないと所属チームが分からないと、
ポリシーが複雑になり、複雑なポリシーは間違えます。

### 5.4 値の種類は enum ではなく CHECK 制約

Postgres の enum は後から値を足すのが面倒です。
状態の種類は今後増えると分かっているので、`text` + `CHECK` にしています。

TypeScript 側の型（`src/types/database.types.ts`）と対応させています。

### 5.5 状態の変更は履歴を残す

`feedback_status_histories` と `skill_status_histories` に、
誰がいつどの状態からどの状態へ変えたかを残します。
フィードバックについては**トリガで自動的に**記録されるので、
書き忘れが起きません。

## 6. DB 側で守っていること

アプリを直さなくても壊れないよう、データベース自身に守らせています。

| 守ること                             | どこで                               |
| ------------------------------------ | ------------------------------------ |
| クリップが元動画の長さを超えない     | `app.validate_video_clip()` トリガ   |
| フィードバックの不正な状態遷移を禁止 | `app.guard_feedback_status()` トリガ |
| 在籍中の背番号が重複しない           | 部分ユニークインデックス             |
| 週の開始日が重複しない               | 部分ユニークインデックス             |
| シーズン・週の終了日が開始日以降     | CHECK 制約                           |
| メールが（あれば）一意               | 部分ユニークインデックス             |

これらは `supabase/tests/constraints_test.sql` で確認しています。

```bash
pnpm db:test
```

## 7. マイグレーションの方針

- 番号順に、前に進むだけ。既存のファイルは書き換えない
- 破壊的な変更は「新しい列を足す → 移行する → 古い列を消す」の3手に分ける
- `0009_master_data.sql`（ロールと権限）は**アプリの動作に必須**なので seed ではなく migration に置いている
