# 公開の手順

## 1. 必要なもの

| サービス                         | 用途               | 費用       |
| -------------------------------- | ------------------ | ---------- |
| Supabase                         | 認証とデータベース | 無料枠あり |
| Vercel（推奨）または自前サーバー | アプリの実行       | 無料枠あり |
| Cloudflare R2                    | 短編動画・画像     | 従量       |
| YouTube                          | 長時間動画         | 無料       |

## 2. Supabase の準備

1. <https://supabase.com> でプロジェクトを作る（リージョンは Tokyo を推奨）
2. Project Settings → API から次を控える
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`（**厳重に扱う**）
3. SQL Editor で `supabase/migrations/` を**番号順に**実行する
4. Authentication → Providers で Email を有効にする
5. Authentication → URL Configuration に本番のドメインを設定する
   - Site URL: `https://<本番のドメイン>`
   - Redirect URLs: `https://<本番のドメイン>/auth/confirm`

### 最初の管理者

README の「4. 最初の管理者を作る」を参照してください。

## 3. Vercel で公開する

1. GitHub リポジトリを Vercel に接続する
2. **Root Directory に `keio-hockey-hub` を指定する**（重要）
3. 環境変数を設定する

| 変数                            | 例                                 |
| ------------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_APP_NAME`          | 慶應ホッケーハブ                   |
| `NEXT_PUBLIC_APP_URL`           | https://keio-hockey-hub.vercel.app |
| `NEXT_PUBLIC_SUPABASE_URL`      | https://xxxx.supabase.co           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJ...                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | eyJ...（Sensitive にする）         |
| `R2_*`                          | 短編動画の投稿に必要（5章）        |

4. Deploy する
5. `https://<ドメイン>/setup-check` で設定が入っているか確認する

## 4. Docker で自前運用する

```bash
cd keio-hockey-hub
cp .env.example .env.local   # 値を埋める
docker compose up --build -d
```

- `output: 'standalone'` を使い、必要なものだけの小さなイメージにしています
- root では動かしません（`nextjs` ユーザー）
- 秘密情報はイメージに焼き込まず、実行時に `.env.local` から渡します
- `NEXT_PUBLIC_*` はビルド時に埋め込まれるため、build args で渡しています

## 5. Cloudflare R2（短編動画の投稿に必要）

1. Cloudflare ダッシュボード → R2 → Bucket を作る
2. **Public Access は無効のまま**にする
3. R2 API トークンを作る（その Bucket にだけ権限を持つもの）
4. 環境変数を設定する
5. CORS を設定する（[docs/storage.md](storage.md) 参照）

## 6. バックアップ

| 対象       | 方法                                                  | 頻度 |
| ---------- | ----------------------------------------------------- | ---- |
| PostgreSQL | Supabase の自動バックアップ（有料プラン）／ `pg_dump` | 日次 |
| R2         | 別 Bucket へのコピー、または rclone                   | 週次 |
| リポジトリ | GitHub                                                | 随時 |

無料プランでは自動バックアップが付かないことがあります。
その場合は `pg_dump` を定期実行してください。

```bash
pg_dump "$DATABASE_URL" -Fc -f "backup-$(date +%Y%m%d).dump"
```

**復元の手順を、実際に一度試しておいてください。**
試していないバックアップは、バックアップとは呼べません。

## 7. 公開前の確認

- [ ] `pnpm check`（型・Lint・単体テスト・ビルド）が通る
- [ ] `pnpm db:test`（RLS と制約）が通る
- [ ] `SUPABASE_SERVICE_ROLE_KEY` に `NEXT_PUBLIC_` が付いていない
- [ ] R2 の Bucket が Private になっている
- [ ] Supabase の Redirect URLs に本番ドメインが入っている
- [ ] `/setup-check` で必要な設定が「設定済み」になっている
- [ ] 管理者以外のアカウントで、管理画面に入れないことを確かめた
- [ ] スマートフォンの実機で、ログイン → 今日 の流れを確かめた
- [ ] バックアップからの復元を一度試した

## 8. 引き継ぎ

長く自分たちで運用するためのものです。
代替わりのときは次を引き継いでください。

- Supabase / Cloudflare / GitHub / Vercel のアカウントと権限
- 環境変数の値（パスワード管理ツールで共有する）
- この `docs/` 一式
- バックアップの置き場所と復元手順

**個人のアカウントで作らないでください。**
部として管理できるアカウントを使い、複数人が管理者になるようにしてください。
