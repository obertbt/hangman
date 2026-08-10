# データベースのテスト

`rls_test.sql` は、RLS が実際に意図どおり効いているかを PostgreSQL 上で確認します。
アプリのコードは通らないので、ポリシーだけを純粋に検証できます。

確認している内容:

- 登録時に profiles と初期カテゴリーが自動で作られる
- グループ外のユーザーには、グループ・メンバー・招待・プロフィール・投稿が一切見えない
- `private` / `group` / `selected` の公開範囲が守られる
- 他人の `user_id` では投稿を作れない／所属していないグループへは公開できない
- 論理削除した投稿が他のメンバーから見えなくなる
- コメントとリアクションが元投稿の公開範囲を超えない
- タイマーが二重に起動できない（`running` / `paused` は1件まで）
- 招待リンクの期限・失効・利用上限が効く
- 一般メンバーが管理者操作をできない／作成者を削除できない
- 記録に添えた写真が、記録本体と同じ範囲にしか見えない
- 写真は1件につき4枚まで／他人の記録には付けられない／他人の写真は消せない
- お知らせが本人にだけ届く／自分の行いは自分に通知されない
- 同じ記録への応援がまとまる／既読にしたあとは新しいお知らせになる
- お知らせを利用者側から作れない／オフにした種類は作られない

すべての変更は最後に `rollback` するため、データは残りません。

## 実行方法

### Supabase のローカル環境がある場合

```bash
supabase start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/tests/rls_test.sql
```

### 素の PostgreSQL で動かす場合

Supabase が用意している `auth` / `storage` スキーマが無いため、
最小限のスタブを先に流します（`_supabase_stub.sql`）。

```bash
createdb hearth_test
psql hearth_test -f supabase/tests/_supabase_stub.sql
psql hearth_test -f supabase/migrations/0001_initial_schema.sql
psql hearth_test -f supabase/migrations/0002_rls_policies.sql
psql hearth_test -f supabase/migrations/0003_rpc.sql
psql hearth_test -f supabase/migrations/0004_storage_avatars.sql
psql hearth_test -f supabase/migrations/0005_timer_rpc.sql
psql hearth_test -f supabase/migrations/0006_post_rpc.sql
psql hearth_test -f supabase/migrations/0007_active_members_paused_at.sql
psql hearth_test -f supabase/migrations/0008_summary.sql
psql hearth_test -f supabase/migrations/0009_activity_photos.sql
psql hearth_test -f supabase/migrations/0010_notifications.sql
psql hearth_test -c "grant all on all tables in schema public to anon, authenticated;
                     grant all on all sequences in schema public to anon, authenticated;"
psql hearth_test -f supabase/tests/rls_test.sql
```

最後に `すべての RLS テストに合格しました。` が出れば成功です。
どこかで失敗すると、その項目名とともに `FAILED:` を表示して止まります。

## 注意

- `_supabase_stub.sql` は**テスト専用**です。本番やステージングでは実行しないでください。
  Supabase が本来提供する `auth.users` などを、検証に必要な最小の形で作っているだけです。
- スタブでは `auth.uid()` を `request.jwt.claim.sub` から読むようにしています。
  テスト中はこの設定値を切り替えることで、ユーザーを入れ替えています。

## 埋め込み select の確認（PostgREST が要ります）

`profiles(...)` のような埋め込みは、行き先が2つ以上あると PostgREST が断ります
（`PGRST201`）。どの道を通れるかはデータベースの外部キーで決まるため、
**TypeScript の型検査でもビルドでも分かりません。**

実際、`post_allowed_users` が `activity_posts` と `profiles` を多対多で結んでいたせいで、
タイムラインの問い合わせはずっと失敗していました。
アプリ側が失敗を空配列に潰していたので、画面には「まだ投稿がありません」と出ていました。

テーブルや外部キーを足したときは、これを実行してください。

```bash
# 1. PostgREST を用意する（初回だけ）
curl -sSL -o /tmp/pgrst.tar.xz \
  https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
tar xf /tmp/pgrst.tar.xz -C /tmp

# 2. マイグレーションを流したデータベースを指して起動する
cat > /tmp/pgrst.conf <<'CONF'
db-uri = "postgres://postgres@127.0.0.1:5432/hearth_test"
db-schemas = "public"
db-anon-role = "anon"
server-port = 3999
CONF
/tmp/postgrest /tmp/pgrst.conf &

# 3. アプリが使っている埋め込み select を全部投げる
PGRST_URL=http://127.0.0.1:3999 node scripts/check-selects.mjs
```

`9 件すべて解決できました。` と出れば成功です。
RLS で0件が返るのは正常で、ここで見ているのは「解決できるか」だけです。

新しく埋め込みを書いたら、`scripts/check-selects.mjs` の一覧にも足してください。
