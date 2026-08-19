# スマートフォンだけで動かす手順

パソコンが無くても、Android のブラウザだけで公開して確認できます。
所要 15〜20 分、費用は無料枠の範囲です。

前提: この2つのアカウントを作ります（どちらも GitHub でログインできます）。

- [Supabase](https://supabase.com)（データベースと認証）
- [Vercel](https://vercel.com)（アプリの配信）

---

## 1. Supabase プロジェクトを作る

1. [supabase.com](https://supabase.com) → **Start your project** → GitHub でログイン
2. **New project**
   - Name: `hearth-growth`（何でもよい）
   - Database Password: 自動生成のものを控える
   - Region: **Northeast Asia (Tokyo)**
3. 作成完了まで1〜2分待ちます

## 2. テーブルと権限を作る

**11個のファイルを、番号順に1つずつ**貼り付けて実行します。

長い SQL を一度に貼ると、端末側で途中までしかコピーされないことがあります
（切れたまま実行すると `syntax error at end of input` で失敗します）。
そうならない大きさに分けてあります。

1. 左メニュー **SQL Editor** → **New query**
2. 下のリンクを開き、コピーボタン（📋）でファイルの中身をコピー
3. SQL Editor に貼り付けて **Run**
4. `Success. No rows returned` が出たら、次の番号へ

| #   | リンク                                                                                     |
| --- | ------------------------------------------------------------------------------------------ |
| 1   | [01.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/01.sql) |
| 2   | [02.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/02.sql) |
| 3   | [03.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/03.sql) |
| 4   | [04.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/04.sql) |
| 5   | [05.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/05.sql) |
| 6   | [06.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/06.sql) |
| 7   | [07.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/07.sql) |
| 8   | [08.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/08.sql) |
| 9   | [09.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/09.sql) |
| 10  | [10.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/10.sql) |
| 11  | [11.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/11.sql) |

**順番は必ず守ってください。** 後の番号は前の番号で作ったものを使います。

### 確認

11個すべて終わったら [check.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/check.sql) を実行します。
こう出れば成功です。

| テーブル数 | 関数の数 | RLSが有効なテーブル数 | ポリシー数 |
| ---------- | -------- | --------------------- | ---------- |
| 18         | 20以上   | 18                    | 53         |

関数の数とポリシー数は環境によって少し前後します。
**テーブル数と RLS が有効なテーブル数が同じ 18** になっていれば大丈夫です。

### やり直したいとき

`already exists`（すでにある）と出た場合は、その番号がすでに実行済みです。
最初からやり直すなら、次を実行してから 01 に戻ってください。
**まだデータを入れていないうちだけ**にしてください。中身がすべて消えます。

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
```

> パソコンから Supabase CLI を使う場合は、分割版ではなく
> `supabase/migrations/` をそのまま流してください（内容は同じです）。

### すでに動いているものに、あとから機能を足すとき

01〜07 は「まっさらな状態から作る」ためのものです。
機能が増えると区切り位置が変わるので、**もう一度 01 から流す必要はありません**。
増えたぶんだけを [updates/](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/) から実行してください。

| 追加された機能       | 実行するファイル                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 記録に写真を添える   | [0009_activity_photos.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0009_activity_photos.sql)                                                                                                                                  |
| アプリ内のお知らせ   | [0010_notifications.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0010_notifications.sql)                                                                                                                                      |
| 招待リンクの修正     | [0011_invitation_token_urlsafe.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0011_invitation_token_urlsafe.sql)                                                                                                                |
| 複数グループへの公開 | [0012_post_groups-1.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0012_post_groups-1.sql) → [0012_post_groups-2.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0012_post_groups-2.sql) |
| グループの削除       | [0013_delete_group.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0013_delete_group.sql)                                                                                                                                        |
| 就寝・起床           | [0014_sleep-1.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0014_sleep-1.sql) → [0014_sleep-2.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0014_sleep-2.sql)                         |
| 起床の呼びかけ       | [0015_wake_alarm.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/setup/updates/0015_wake_alarm.sql)                                                                                                                                            |

`-1` `-2` と分かれているものは、**その順番で続けて**実行してください。

実行したあと、上の check.sql でテーブル数が 18 になっていれば成功です。

## 2.5 通知を使えるようにする（任意）

起床予定の「起きていますか？」を使うときだけ必要です。使わないなら飛ばして構いません。

> ⚠️ **これは目覚まし時計ではありません。**
> Web の通知は省電力で遅れることがあり、マナーモードも越えません。
> 音で起こすのは端末のアラームアプリに任せてください。
> ここで作るのは「起きたことを1タップで記録する」ための呼びかけです。

**① Vercel に4つの環境変数を追加**

Vercel → プロジェクト → Settings → Environment Variables

| 名前                           | 値                                       |
| ------------------------------ | ---------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 渡した「公開鍵」                         |
| `VAPID_PRIVATE_KEY`            | 渡した「秘密鍵」                         |
| `VAPID_SUBJECT`                | `mailto:` に続けて自分のメールアドレス   |
| `CRON_SECRET`                  | 自分で決めた合言葉（英数字20文字くらい） |

追加したら **Deployments → 最新 → Redeploy** で入れ直します。
`NEXT_PUBLIC_` の付いた値は、作り直さないと反映されません。

**② Supabase で定期実行を設定**

[push-cron.sql](https://github.com/obertbt/hangman/blob/main/hearth-growth/supabase/push-cron.sql) を開き、
**2か所（アプリの URL と合言葉）を自分の値に書き換えてから** SQL Editor で実行します。
合言葉は Vercel の `CRON_SECRET` と**まったく同じ文字列**にしてください。

**③ 確認**

`/setup-check` を開くと「通知の設定はそろっています」と出れば成功です。
合言葉が食い違っていると、そう書いてあるので直せます。

**④ 端末で通知を許可**

アプリの **設定 → この端末への通知 → この端末で通知を受け取る**

## 3. 接続情報を控える

左メニュー **Project Settings** → **API** で次の2つをコピーします。

| 項目                               | 使う値                      |
| ---------------------------------- | --------------------------- |
| Project URL                        | `https://xxxx.supabase.co`  |
| Project API keys → **anon public** | `eyJ...` で始まる長い文字列 |

> `service_role` の鍵は使いません。コピーもしないでください。

## 4. Vercel に載せる

1. [vercel.com](https://vercel.com) → GitHub でログイン
2. **Add New → Project** → `obertbt/hangman` を **Import**
3. 設定を3か所変えます
   - **Root Directory**: `hearth-growth` を選ぶ（重要）
   - **Branch**: `claude/hearth-growth-lifelogging-app-xdzhi3`
   - **Environment Variables**: 次の3つを追加

     | Name                            | Value                                                 |
     | ------------------------------- | ----------------------------------------------------- |
     | `NEXT_PUBLIC_SUPABASE_URL`      | 手順3の Project URL                                   |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 手順3の anon public                                   |
     | `NEXT_PUBLIC_SITE_URL`          | `https://hangman.vercel.app`（後で正しい URL に直す） |

4. **Deploy**
5. 完了したら、発行された URL（`https://＜プロジェクト名＞.vercel.app`）を控えます
6. **Settings → Environment Variables** で `NEXT_PUBLIC_SITE_URL` を、その URL に直します
7. **Deployments** → 最新のものの「…」→ **Redeploy**

> `NEXT_PUBLIC_SITE_URL` は確認メールの戻り先に使います。ここがずれていると、
> メールのリンクを開いても正しく戻れません。

## 5. Supabase 側にリダイレクト先を登録する

Supabase の **Authentication** → **URL Configuration**

- **Site URL**: `https://＜あなたの URL＞.vercel.app`
- **Redirect URLs** に追加: `https://＜あなたの URL＞.vercel.app/auth/confirm`

## 6. Android で開く

1. Chrome で Vercel の URL を開く
2. 新規登録（メールアドレス・パスワード・表示名）
3. 確認メールが届いたらリンクを開く

> すぐ試したい場合は、Supabase の **Authentication → Providers → Email** で
> **Confirm email** をオフにすると、メール確認なしで登録できます。
> 身内だけで試すあいだの措置です。公開前に戻してください。

### ホーム画面に追加する（PWA）

Chrome のメニュー（右上の点3つ）→ **ホーム画面に追加**

アドレスバーの無い状態で起動します。アイコンとテーマ色が付いていれば成功です。

---

## 触って確かめたいところ

要件23章の「MVP完了条件」に沿って、この順で試すと一通り確認できます。

1. **登録** → ホーム画面が出る
2. **設定** → 表示名とプロフィール画像を変える
3. **グループ** → グループを作る → 招待リンクを発行してコピー
4. 別のスマホ（または Chrome のシークレットタブ）でそのリンクを開き、別アカウントで参加
5. **活動を始める** → カテゴリーを選んで開始
6. **アプリを閉じて、少し経ってから開き直す** → 経過時間が正しく進んでいるか
7. **一時停止 → 再開 → 終了** → 記録として残す（公開範囲はグループ）
8. もう片方のアカウントで **タイムライン** に出るか、**応援**とコメントができるか
9. **公開範囲を「自分だけ」にした記録が、相手から見えないこと**
10. **ホーム** → 今日の活動時間・連続記録・今週のまとめが合っているか
11. **記録に写真を添える** → 終了画面か「手動で記録する」で「写真を選ぶ」（4枚まで）
12. もう片方のアカウントの **タイムライン** に、その写真が出るか
13. **「自分だけ」にした記録の写真が、相手からは出ないこと**
14. **お知らせ**（右上のベル）→ 応援やコメントが届いているか
15. 同じ記録に2人が応援すると、お知らせが**1件にまとまる**か
16. **設定 → お知らせ** で種類ごとにオフにできるか
17. **記録** の画面に「◯件が『自分だけ』のままです」が出たら、まとめて公開できるか
18. グループを2つ作り、1つの記録を**両方に公開**できるか（公開範囲で複数選べます）
19. 片方のグループにしかいない人から、もう片方だけに出した記録が**見えない**こと
20. **ホーム → 就寝**を押し、少し経ってから**起床**を押すと睡眠時間が残るか
21. その睡眠が「**今日の活動時間**」には**入っていない**こと
22. グループの作成者なら、**グループ設定の下から削除**できるか（記録は消えません）
23. スマートフォンの**縦画面**で、マイページ →「そのほか」からグループへ行けるか
24. タブレットを**横**にしたとき、画面いっぱいに表示されるか

25. **就寝**で起床予定の時刻を入れ、その時刻に「起きていますか？」が届くか（通知を設定した場合）
26. 通知の「**起きている**」を押すと、アプリを開かずに睡眠が記録されるか

> ホーム画面に追加済みの場合、**画面の向きの設定は入れ直すまで反映されないことがあります。**
> 横にしても縦のままなら、一度ホーム画面から削除して、追加し直してください。

### 特に見てほしいところ

- 片手で持ったとき、下部の「活動開始」ボタンに親指が届くか
- 文字が小さすぎないか、行間が詰まりすぎていないか
- タイマーの数字が見やすいか
- 記録するまでの手数が多すぎないか

気になったところを教えてください。直します。

---

## うまくいかないとき

### まず /setup-check を開く

```
https://＜あなたの URL＞.vercel.app/setup-check
```

接続先・鍵の取り違え・メール確認の有無を、アプリ自身が調べて表示します。
ログインできないときは、まずここを見てください。

| 症状                                     | 見るところ                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| ビルドが失敗する                         | Vercel の Root Directory が `hearth-growth` になっているか                |
| 「環境変数の設定に問題があります」と出る | 環境変数3つの名前が正確か。設定後に Redeploy したか                       |
| ログインしても戻ってこない               | `NEXT_PUBLIC_SITE_URL` と Supabase の Redirect URLs が一致しているか      |
| 登録しても何も起きない                   | 確認メールが迷惑メールに入っていないか。または Confirm email をオフにする |
| 画面が真っ白                             | Supabase の SQL（手順2）を実行したか                                      |
| 「この操作を行う権限がありません」       | 想定どおりの動きです。RLS が拒否しています                                |

## ローカルで動かす場合（パソコン）

パソコンから確認する場合は、同じ Wi-Fi のスマートフォンからも開けます。

```bash
cd hearth-growth
npm install
cp .env.example .env.local   # Supabase の URL と anon key を書く
npm run dev -- --hostname 0.0.0.0
```

スマートフォンの Chrome で `http://＜パソコンの IP＞:3000` を開きます。
