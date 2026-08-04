# Hearth Growth

親しい人だけで、勉強・運動・読書・仕事などの日々の努力を共有するクローズドなライフログです。
不特定多数への公開やフォロワー獲得は目的にしません。他人との比較より、自分の継続を大切にします。

> このディレクトリは、リポジトリのルートにある Discord Bot（`hearth-life`）とは別のプロダクトです。
> 依存も設定も混ざらないよう `hearth-growth/` 配下で完結しています。

## 現在の状態

**Phase 0（基盤構築）まで完了。** 画面はまだ枠だけで、各画面に「どのフェーズで何を実装するか」を表示しています。

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | プロジェクト基盤・DB スキーマ・RLS・共通レイアウト・テスト環境 | 完了 |
| 1 | 認証とプロフィール | 未着手 |
| 2 | グループと招待 | 未着手 |
| 3 | カテゴリーとタイマー | 未着手 |
| 4 | 活動記録と公開範囲 | 未着手 |
| 5 | タイムラインと活動中メンバー | 未着手 |
| 6 | リアクションとコメント | 未着手 |
| 7 | ダッシュボード（集計・連続記録・目標） | 未着手 |
| 8 | 品質向上（RLS テスト・E2E・PWA・アクセシビリティ） | 未着手 |

設計の詳細は [`docs/DESIGN.md`](docs/DESIGN.md)、
RLS の一覧は [`supabase/policies/README.md`](supabase/policies/README.md) にあります。

## 技術構成

Next.js 16 (App Router) / React 19 / TypeScript (strict) / Tailwind CSS v4 /
Zod / React Hook Form / Supabase (PostgreSQL・Auth・RLS) / Vitest + React Testing Library

## セットアップ

### 1. 依存関係

```bash
cd hearth-growth
npm install
```

### 2. 環境変数

```bash
cp .env.example .env.local
```

`.env.local` に Supabase プロジェクトの URL と anon key を設定します。
未設定のまま起動すると、どの変数が足りないかを表示して起動時に停止します。

> service role key は使いません。RLS を迂回する経路を作らないためです。

### 3. データベース

[Supabase CLI](https://supabase.com/docs/guides/cli) を使う場合:

```bash
supabase start          # ローカルの Postgres を起動
npm run db:reset        # migrations と seed.sql を流し直す
```

ホストされた Supabase プロジェクトを使う場合は、
`supabase/migrations/` の SQL を番号順に SQL Editor で実行してください。

| ファイル | 内容 |
|---|---|
| `0001_initial_schema.sql` | テーブル・制約・インデックス・トリガー |
| `0002_rls_policies.sql` | RLS の有効化と全ポリシー |
| `0003_rpc.sql` | 招待の受理など、RLS では表現しない手続き |

`seed.sql` はローカル専用です（テストユーザー 2 名とグループを 1 つ作ります）。

### 4. 起動

```bash
npm run dev
```

http://localhost:3000 を開きます。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド（環境変数が必要） |
| `npm run test` | Vitest |
| `npm run test:watch` | Vitest（監視） |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run db:reset` | ローカル DB をマイグレーションから作り直す |
| `npm run db:types` | ローカル DB から型定義を再生成する |

## ディレクトリ構成

```
hearth-growth/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/          login, signup, reset-password, invite/[token]
│  │  ├─ (app)/           home, timeline, timer, activities, groups, profile, settings
│  │  └─ layout.tsx       ルートレイアウト（フォント・PWA メタデータ）
│  ├─ components/
│  │  ├─ ui/              汎用の部品
│  │  └─ layout/          ナビゲーション・ヘッダー
│  ├─ features/           機能ごとのデータ取得と更新（Phase 1 以降）
│  ├─ lib/
│  │  ├─ supabase/        client / server / session（proxy 用）
│  │  ├─ date/            活動時間の表示・タイムゾーン・連続記録
│  │  ├─ validations/     Zod スキーマ
│  │  ├─ permissions/     公開範囲の表示情報
│  │  └─ utils/
│  ├─ types/              DB の型
│  ├─ tests/              横断的なテスト
│  └─ proxy.ts            認証セッションの更新とリダイレクト
└─ supabase/
   ├─ migrations/
   ├─ policies/           RLS の対応表
   └─ seed.sql
```

## 設計上の約束

実装を進めるときに崩さない前提です。

- **権限判定は RLS が唯一の正。** 画面側の出し分けは体験のためであり、権限ではありません。
- **service role key をクライアントへ置かない。**
- **サーバーでは `getUser()` を使う。** `getSession()` は Cookie を検証しません。
- **`user_id` をクライアントから受け取らない。** 常に `auth.uid()` を使います。
- **タイマーの秒数を画面側で保持しない。** 表示は常に `started_at` からの再計算です。
  ブラウザを閉じても再読み込みしても、同じ計算で復元できます。
- **削除は原則として論理削除。**
- **入力値は必ず Zod で検証する。**
- **1回の活動時間は 24 時間まで。** 12 時間を超えて続いているタイマーは、
  自動終了させずに次回ログイン時へ確認を出します。

## テスト

現時点で検証しているのは、フェーズをまたいで壊れると困る部分です。

- 活動時間の表示規則（`45分` / `1時間25分`）
- 経過時間の計算（一時停止・再開・再読み込み・端末時計のずれ）
- タイムゾーン基準の「今日」「今週」と、夏時間の切り替え日
- 連続記録日数
- 環境変数の検証
- RLS の付け忘れ検出（全テーブルで有効化とポリシーの存在を確認）
- 下部ナビゲーションの現在地表示

実際のポリシー挙動（グループ外から投稿が見えないこと等）を DB に対して確認する統合テストと、
Playwright による E2E は Phase 8 で追加します。
