# セキュリティ

扱っているのは学生の個人情報と、本人が公開したくない記録です。
「他の人に見られない」が壊れると、選手は正直な日報を書かなくなり、
システムそのものが意味を失います。

## 1. 守ると決めたこと（62章）

| 守ること                               | どう守るか                           | 確認方法             |
| -------------------------------------- | ------------------------------------ | -------------------- |
| 他選手の非公開日報を見られない         | RLS `daily_reports_*`                | `rls_test.sql`       |
| 他選手の非公開動画を見られない         | RLS `files_select` / `videos_select` | 同上                 |
| 他選手のフィードバック依頼を見られない | RLS `feedback_requests_select`       | 同上                 |
| 別チームの情報を見られない             | 全テーブルの `app.is_team_member()`  | `rls_test.sql`       |
| 別チームの R2 URL を発行できない       | `isKeyOwnedByTeam()` + RLS           | `storage.test.ts`    |
| URL 直打ちでも回避できない             | RLS はクエリ単位で効く               | `auth-guard.spec.ts` |
| 選手が管理画面を見られない             | `requirePermission()` + RLS          | `rls_test.sql`       |
| 削除済みファイルを通常閲覧できない     | `deleted_at is null` を全ポリシーに  | ポリシー定義         |

## 2. 二重に守る

```
アプリ側（requirePermission）   → 理由を伝えられる。UX のため。
データベース側（RLS）           → 最後の砦。実装漏れがあっても守る。
```

どちらか片方だけでは不十分です。

- RLS だけ → 0件返るだけで利用者に理由が分からない
- アプリだけ → 実装漏れ、URL 直打ち、将来の新しい画面で漏れる

## 3. 鍵の扱い

| 鍵                              | 置き場所                 | ブラウザに渡すか            |
| ------------------------------- | ------------------------ | --------------------------- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 環境変数                 | ○（RLS で守られる前提の鍵） |
| `SUPABASE_SERVICE_ROLE_KEY`     | 環境変数（サーバーのみ） | **絶対に渡さない**          |
| `R2_SECRET_ACCESS_KEY`          | 環境変数（サーバーのみ） | **絶対に渡さない**          |

- `NEXT_PUBLIC_` を付けた値はすべてブラウザに配られます。秘密情報を入れてはいけません
- `src/lib/env.ts` で公開値とサーバー専用値を型の上で分けています
- サーバー専用値は使う時に検証します（ビルドやテストで落ちないように）

### service role を使う場所

RLS を迂回するので、使う場所を限定しています。

| 場所                 | 理由                                              | 代わりに守っていること                               |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| データ移行の書き込み | `profiles` に `team_id` が無く RLS で表現できない | 事前の権限確認、team_id はサーバーが入れる、監査ログ |

詳しくは [ADR-0003](decisions/0003-import-write-path.md)。

## 4. 認証

- パスワードは Supabase Auth が管理する（自前でハッシュしない）
- サーバーでは `getUser()` を使う。`getSession()` は Cookie を信じるだけなので使わない
- パスワードは8文字以上。記号必須などの複雑な規則は課さない
  （覚えられずメモされるほうが危険）

### 情報を漏らさないエラー文

「そのメールアドレスは登録されていません」と返すと、
誰が部員かを外部から調べられてしまいます。

```
× そのメールアドレスは登録されていません
○ メールアドレスかパスワードが違います
```

パスワード再設定も、登録の有無に関わらず同じ文言を返します。

## 5. 入力の検証

- すべての Server Action で Zod により検証する
- クライアント側の検証は親切のため。サーバー側の検証が本体
- 遷移先（`next`）は `/` で始まるものだけを許す（オープンリダイレクト対策）

```ts
function safeNextPath(next: FormDataEntryValue | null): string {
  if (typeof next !== 'string') return '/today';
  if (!next.startsWith('/') || next.startsWith('//')) return '/today';
  return next;
}
```

## 6. ファイル

- Bucket は Private。恒久公開 URL を作らない
- 署名付き URL を DB に保存しない
- storage key に氏名を入れない
- key のチームを検算してから URL を発行する
- MIME と容量と長さをサーバー側で確認してから Presigned URL を出す

## 7. 監査ログ（63章）

| 記録する操作                                      | 状態        |
| ------------------------------------------------- | ----------- |
| Import 実行 / Import 取り消し                     | ✅ 実装済み |
| Role 変更 / Permission 変更                       | ⬜ Phase 9  |
| スキル承認                                        | ⬜ Phase 8  |
| 動画アップロード / 削除 / 公開範囲変更 / 共有承認 | ⬜ Phase 7  |
| フィードバック回答                                | ⬜ Phase 6  |
| 容量設定変更 / R2 物理削除                        | ⬜ Phase 9  |

**秘密鍵や署名付き URL そのものはログに残しません。**
残すのは「誰が・いつ・何に対して・何をしたか」だけです。

監査ログは `authenticated` から `insert/update/delete` を剥奪しています。
書き込みはサーバー経由だけです。

## 8. RLS だけでは足りなかった例（実際に見つかった穴）

Phase 5 のテストを書いていて、次の穴が見つかりました。

`video_clips` のポリシーはこうなっていました。

```sql
with check (created_by = app.current_profile_id() and app.is_team_member(team_id))
```

「作成者が自分」「team_id が自分のチーム」は見ていますが、
**参照先の `video_id` がどのチームの動画かを見ていません**。

そのため、別チームの動画のUUIDを知っていれば、
その動画を指すクリップを自分のチームの行として作れてしまいました。
同じことが `feedback_requests` でも起こり得ました。

### なぜ RLS で防ぎきれなかったか

RLS は「その行を書いてよいか」を見る仕組みです。
**「その行が指している別の行が、同じチームのものか」までは自動では見ません。**

外部キー制約もチームの一致までは見ません。

### 対処（0011_cross_team_reference_guard.sql）

チームの一致は権限ではなく**データの整合性**の問題なので、
RLS ではなくトリガで守ることにしました。
こうすると service role を含め、どの経路から書いても守られます。

```sql
if v_team_id <> new.team_id then
  raise exception '別のチームの動画は参照できません';
end if;
```

対象: `video_clips` → `videos` /
`feedback_requests` → `videos`, `video_clips`, `events`, `daily_reports`, `team_members` /
`videos` → `files`, `events`

### 教訓

**他のテーブルを指す列（外部キー）を足したら、
その参照先のチームが一致するかを必ず確かめること。**

新しいテーブルを足すときのチェック項目に加えました（下記）。

## 9. RLS のよくある落とし穴

### 無限再帰

`team_members` のポリシーの中で `team_members` を読むと再帰します。
そのため判定は `security definer` の関数（`app.*`）に逃がしています。

### search_path

`security definer` の関数は `set search_path = public, pg_temp` を必ず付けます。
付けないと、呼び出し側がスキーマを差し替えて関数の中身を乗っ取れます。

### 新しいテーブルを足したとき

`0010_grants.sql` で `alter default privileges` を設定していますが、
**RLS の有効化とポリシーの作成は自動ではありません。**
テーブルを足したら必ず次を行ってください。

1. `alter table ... enable row level security;`
2. ポリシーを書く
3. **他のテーブルを指す列があれば、参照先のチームが一致するかをトリガで確かめる**（上記の穴）
4. `rls_test.sql` か `video_test.sql` に確認を足す

RLS を有効にしてポリシーを書かないと、そのテーブルは**誰からも見えなくなります**
（安全側に倒れるので、漏れるよりはましです）。

## 10. 確認のしかた

```bash
pnpm db:test    # RLS と制約
pnpm test       # 権限判定、storage key、入力検証
pnpm test:e2e   # 未ログイン時の振り分け
```
