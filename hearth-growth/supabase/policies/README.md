# RLS ポリシー一覧

実体は [`../migrations/0002_rls_policies.sql`](../migrations/0002_rls_policies.sql) にあります。
このファイルは「誰が何をできるか」を人間が読んで確認するための対応表です。
ポリシーを変更したときは、必ずこの表も更新してください。

## 判定用ヘルパー関数

`group_members` を参照するポリシーをそのまま書くと、`group_members` 自身のポリシー評価が
再帰するため、判定は `SECURITY DEFINER` 関数に切り出しています。
いずれも `search_path` を固定し、`anon` からの実行権限は剥奪しています。

| 関数 | 判定内容 |
|---|---|
| `is_group_member(group_id, user_id?)` | そのグループのメンバーか |
| `is_group_admin(group_id, user_id?)` | owner / admin か |
| `shares_group_with(user_id, viewer_id?)` | 相手と同じグループに所属しているか |
| `can_view_post(post_id, user_id?)` | private / group / selected を踏まえて投稿を閲覧できるか |
| `is_post_owner(post_id, user_id?)` | 投稿の作成者か |

## テーブル別ポリシー

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | 自分 or 同じグループのメンバー | 自分の行のみ | 自分の行のみ | 不可（アカウント削除は `auth.users` のカスケード） |
| `groups` | メンバーのみ | `owner_id = auth.uid()` | owner / admin | owner のみ |
| `group_members` | 同グループのメンバー | グループ作成者が自分を owner として登録する場合のみ | owner / admin（owner 行は不可） | 自分（退会）or 管理者（owner 行は不可） |
| `group_invitations` | owner / admin | owner / admin かつ `invited_by = auth.uid()` | owner / admin（失効） | owner / admin |
| `categories` | 自分の個人カテゴリー or 所属グループのカテゴリー | 個人は本人、グループは管理者 | 同上 | 同上 |
| `activity_sessions` | 本人のみ | 本人のみ | 本人のみ | 本人のみ |
| `activity_posts` | 本人 / group 公開かつメンバー / selected かつ許可ユーザー（`deleted_at is null`） | 本人。group 公開は所属グループのみ | 本人。group 公開は所属グループのみ | 本人 |
| `post_allowed_users` | 投稿者 or 自分が対象の行 | 投稿者 | 投稿者 |
| `reactions` | 元投稿を閲覧できる人 | 本人 かつ 元投稿を閲覧できる | 本人 | 本人 |
| `comments` | 元投稿を閲覧できる人（非表示コメントは本人と投稿者のみ） | 本人 かつ 元投稿を閲覧できる | 本人 | 本人 or 投稿者 |
| `daily_goals` / `weekly_goals` | 本人のみ | 本人のみ | 本人のみ | 本人のみ |

## RLS では表現しない操作（RPC）

行単位の許可では足りない処理だけを `SECURITY DEFINER` 関数にしています。
実装は [`../migrations/0003_rpc.sql`](../migrations/0003_rpc.sql) です。

| 関数 | 理由 |
|---|---|
| `create_group(name, description)` | グループ作成と owner 登録を1トランザクションにするため |
| `get_invitation_preview(token)` | ログイン前にグループ名だけを見せる。招待テーブル自体は管理者しか読めない |
| `accept_invitation(token)` | 期限・失効・利用上限の検証と `used_count` の加算を原子的に行うため |
| `get_active_group_members()` | セッション行は本人のみ閲覧可。ホーム画面に必要な列（カテゴリー・開始時刻）だけを返す。`title` / `note` は返さない |
| `set_comment_hidden(comment_id, hidden)` | 投稿者にコメントの非表示だけを許可し、本文の書き換えは許可しないため |

## 設計上の注意

- サービスロールキーはブラウザに置きません。RLS を迂回する経路を作らないでください。
- `auth.uid()` はポリシー内で `(select auth.uid())` と書いています。
  こうすると初期化式として1回だけ評価され、行数の多いテーブルで計画が安定します。
- 公開範囲の判定はサーバー側 (`can_view_post`) を唯一の正とします。
  クライアント側のフィルタは表示上の都合であり、権限判定ではありません。
