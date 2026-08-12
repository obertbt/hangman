# ADR-0002: profiles を auth.users と分ける

- 状態: 採用
- 日付: 2026-08-12

## 背景

Supabase の一般的な作り方では、`profiles.id` を `auth.users.id` と
同じ値にする（1対1）。単純で分かりやすい。

しかしこのシステムでは、**Phase 2（過去データ移行）が
Phase 3 以降より先に来る**。移行の時点で、選手はまだ誰もログインしていない。

```
Phase 1: 認証・チーム
Phase 2: 過去データ移行  ← ここで選手を登録する（ログイン前）
Phase 3: シーズン・週・イベント
```

依頼書の66章「最初の到達点」も、
「管理者が Google Sheets からコピペで選手を登録する」が
「選手がログインする」より前にある。

## 問題

`profiles.id = auth.users.id` にすると、
**ログインしていない人を登録できない**。

回避策として考えられたのは:

- (A) 移行時に全員ぶんの `auth.users` を作る
- (B) 移行データを別テーブルに置き、ログイン時に結合する
- (C) `profiles` を `auth.users` から独立させる

## 判断

**(C) を採用する。**

```sql
create table public.profiles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,  -- null 可
  ...
);
```

`user_id` が `null` の行は「登録されているが、まだログインしていない選手」。

## 却下した案

### (A) 移行時に auth.users を作る

- 本人が知らないうちにアカウントができる。招待メールも飛びかねない
- メールアドレスが必須になる。持っていない・分からない選手を登録できない
- 使われないアカウントが大量に残る

### (B) 別テーブルに置く

- 移行データと本番データで2つの選手テーブルができる
- 日報やスキルがどちらを指すのか、常に迷うことになる
- 結合のタイミングで不整合が起きる

## 影響

### よくなること

- 移行が先に完結する。選手が1人もログインしていなくても名簿が完成する
- メールアドレスが無い選手も登録できる
- 卒業生の記録を、アカウント無しで残せる
- アカウントを消しても記録が消えない（`on delete set null`）。
  61章「ユーザー削除と過去記録削除を直接連動させない」を素直に実装できる

### 気をつけること

1. **RLS が一段深くなる**。`auth.uid()` から直接 `profiles.id` にならない。
   `app.current_profile_id()` を挟む。
   → `security definer` の関数にまとめて解決済み

2. **`profiles` に `team_id` が無い**。人はチームより先に存在するため。
   結果として `profiles` の INSERT を RLS で表現できない。
   → [ADR-0003](0003-import-write-path.md) で扱う

3. **結び付けの作業が要る**。選手にアカウントを配るとき、
   `profiles.user_id` を更新する必要がある。
   → 現在は SQL で行う（docs/migration-guide.md）。招待機能は Phase 1 の残作業

4. **メールの重複**。`profiles.email` は「あれば一意」にしている
   （部分ユニークインデックス）。メール未記入の選手が複数いても弾かれない。
