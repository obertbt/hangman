# Windowsミニで24時間稼働させる手順

GMKTECなどのWindowsミニPCをつけっぱなしにして、Botを常時稼働させる手順です。

消費電力10W前後なら電気代は月200円程度で、クラウドVPS（月350〜800円）より安く済みます。

Windowsで放置運用するには、次の3つを設定する必要があります。

1. **自動起動**（PCの電源が入ったらBotも起動する）
2. **スリープ無効**（スリープするとBotが止まり、朝4:00の通知も飛びません）
3. **ログのファイル出力**（画面が無い状態で動くため、記録が残らないと障害調査ができません）

---

## 0. 【最初に】GitHubリポジトリを非公開にする

このBotは日記の本文をGitHubに保存します。リポジトリが公開のままだと、**日記の内容・Discordユーザー名・行動記録が誰でも閲覧できる状態**です。

1. https://github.com/obertbt/hangman/settings を開く
2. ページ最下部の **「Danger Zone」** までスクロール
3. **「Change repository visibility」** の **「Change visibility」** をクリック
4. **「Make private」** を選択
5. 確認のためリポジトリ名（`obertbt/hangman`）を入力して実行

> すでに公開状態で保存された内容は、第三者に閲覧・取得されていた可能性があります。見られて困る記述を投稿済みの場合は、その削除もご検討ください。

---

## 1. ミニPCに環境を用意する

ミニPC側で作業します（リモートデスクトップでも直接操作でも構いません）。

すでに手元のPCで動かしている場合と同じ手順です。PowerShellを開いて実行します。

```powershell
cd $HOME\Documents
git clone https://github.com/obertbt/hangman.git
cd hangman
git checkout claude/lifelog-bot-minimal-d1w3jb
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> Python・Gitが入っていない場合は、先にインストールしてください（Pythonのインストーラーでは **「Add python.exe to PATH」に必ずチェック**）。

### `.env` を作る

```powershell
copy .env.example .env
notepad .env
```

手元のPCで使っている `.env` の内容をそのまま貼り付けて保存します。

### ログのファイル出力を有効にする

`.env` の末尾に次の1行を追加してください。**これがないと、自動起動したBotのログがどこにも残りません。**

```
LOG_FILE=logs\bot.log
```

ログは5MBごとに自動で切り替わり、3世代まで保持されます（容量を圧迫しません）。

### 手動で起動できるか確認

```powershell
python -m app.main
```

`Logged in as ...` と `監視チャンネルを確認しました` が出れば準備完了です。`Ctrl + C` で止めてください。

---

## 2. スリープ・休止状態を無効にする

**この設定を忘れると、夜間にPCがスリープしてBotが止まり、朝4:00の通知が飛びません。**

PowerShellを**管理者として実行**して、次を実行します。

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
```

- `standby-timeout-ac 0` … スリープしない
- `hibernate-timeout-ac 0` … 休止状態にしない
- `disk-timeout-ac 0` … ディスクの電源を切らない

**画面（モニター）は切って構いません。** 消費電力を抑えられます。

```powershell
powercfg /change monitor-timeout-ac 10
```

### 設定できたか確認

```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
```

`現在の AC 電源設定のインデックス: 0x00000000` のように **0** になっていればスリープ無効です。

> **ノートPC型の場合**は「カバーを閉じたときの動作」も「何もしない」に変更してください（設定 → システム → 電源 → カバーを閉じたときの動作）。

---

## 3. タスクスケジューラで自動起動を設定する

PCの電源が入ったらBotも自動で起動し、落ちても自動で復帰するようにします。

### タスクを作る

1. **Windowsキー** を押して `タスクスケジューラ` と入力し、起動
2. 右側の **「タスクの作成」** をクリック（「基本タスクの作成」**ではありません**。設定項目が足りません）

### 「全般」タブ

| 項目 | 設定 |
|---|---|
| 名前 | `HearthLifelogBot` |
| セキュリティオプション | **「ユーザーがログオンしているかどうかにかかわらず実行する」** を選択 |
| 「最上位の特権で実行する」 | チェック不要 |
| 構成 | Windows 10 / 11 |

> 「ユーザーがログオンしているかどうかにかかわらず実行する」を選ぶと、**PC再起動後にログイン画面のままでもBotが動きます**。OKを押すときにWindowsのパスワード入力を求められます。

### 「トリガー」タブ

「新規」をクリックし、

| 項目 | 設定 |
|---|---|
| タスクの開始 | **スタートアップ時** |
| 遅延時間を指定する | チェックを入れて **30秒**（ネットワーク接続が整うのを待つため） |

### 「操作」タブ

「新規」をクリックし、以下を入力します。

| 項目 | 入力内容 |
|---|---|
| 操作 | プログラムの開始 |
| プログラム/スクリプト | `powershell.exe` |
| 引数の追加 | 下記をコピー |

```
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\tabata\Documents\hangman\deploy\run-bot.ps1"
```

> パスはご自身の環境に合わせてください。`cd hangman` した状態で `(Get-Location).Path` を実行すると正確なパスが分かります。

### 「条件」タブ

| 項目 | 設定 |
|---|---|
| 「コンピューターをAC電源で使用している場合のみタスクを開始する」 | **チェックを外す** |
| 「タスクを実行するためにスリープを解除する」 | チェックを入れる |

### 「設定」タブ（重要）

| 項目 | 設定 |
|---|---|
| 「タスクが失敗した場合の再起動の間隔」 | **チェックを入れて 1分** |
| 「再起動の試行回数」 | **999回** |
| **「タスクを停止するまでの時間」** | **チェックを外す** |
| 「要求時にタスクを実行する」 | チェックを入れる |
| 「既にタスクが実行中の場合に適用される規則」 | **「新しいインスタンスを開始しない」** |

> ⚠️ **「タスクを停止するまでの時間」のチェックを外すのを忘れないでください。** 既定では3日間で強制終了され、Botが止まります。

最後に **OK** をクリックし、Windowsのユーザー名とパスワードを入力します。

---

## 4. 動作確認

### まずは手動で起動してみる

タスクスケジューラの一覧から `HearthLifelogBot` を右クリック → **「実行する」**。

状態が **「実行中」** になればOKです。

このとき「前回の実行結果」列は次のように表示されます。

| 表示 | 意味 |
|---|---|
| `現在タスクを実行中です。(0x41301)` | **正常**。Botが動き続けている状態です |
| `この操作を正しく終了しました。(0x0)` | Botが停止しています |
| `(0x1)` | 起動に失敗しています。`logs\launcher.log` を確認してください |

常時稼働中は `0x41301` のままになるのが正しい状態です。`0x0` は「正常に終了した」という意味なので、稼働させたい場面では**止まっていることを示す**点に注意してください。

ログを確認します。

```powershell
cd $HOME\Documents\hangman
Get-Content logs\bot.log -Tail 20
```

`Logged in as ...` が記録されていれば成功です。

`bot.log` が存在しない場合は、Botが起動する前に失敗しています。起動処理のログを確認してください。

```powershell
Get-Content logs\launcher.log -Tail 30
```

`launcher.log` に出るメッセージの意味は次のとおりです（英語表記なのは、日本語を含めるとPowerShell 5.1で文字化けするためです）。

| メッセージ | 意味 |
|---|---|
| `[INFO] starting bot` | Botの起動を開始しました |
| `[INFO] bot exited (code: 0)` | Botが正常終了しました |
| `[ERROR] venv not found: ...` | 仮想環境がありません。`python -m venv .venv` と `pip install -r requirements.txt` を実行してください |
| `[ERROR] .env not found: ...` | `.env` がありません。`copy .env.example .env` で作成し、設定を記入してください |
| `[ERROR] failed to start: ...` | Pythonの起動自体に失敗しました。メッセージの内容を確認してください |

### Discordで確認

1. `#daily` にテキストを投稿 → Botが返信し、GitHubに保存される
2. 画像を添付して投稿 → R2に保存される
3. `!task テスト` → GitHub Issueが作られる

### 再起動テスト（これが本番です）

**ここまで確認して初めて「24時間稼働」と言えます。**

1. ミニPCを再起動する
2. **ログイン画面のまま放置**（ログインしない）
3. 1〜2分待ってから、Discordの `#daily` に投稿してみる
4. Botが返信すれば、自動起動が正しく設定できています

---

## 5. 日常の運用

### ログを見る

```powershell
cd $HOME\Documents\hangman
Get-Content logs\bot.log -Tail 30          # 直近30行
Get-Content logs\bot.log -Wait -Tail 10    # リアルタイム表示（Ctrl+Cで終了）
```

### 停止・再開・再起動

タスクスケジューラで `HearthLifelogBot` を右クリックし、「終了」「実行する」を選びます。

### コードを更新したとき

```powershell
cd $HOME\Documents\hangman
git pull
.venv\Scripts\activate
pip install -r requirements.txt
```

そのあとタスクスケジューラで「終了」→「実行する」で再起動します。

---

## 6. Windows Updateへの対処

Windows Updateの自動再起動でBotが止まることがありますが、**スタートアップ時トリガーを設定してあるため、再起動後に自動で復帰します。**

再起動のタイミングを制御したい場合は、アクティブ時間を設定してください。

設定 → Windows Update → 詳細オプション → アクティブ時間

---

## 7. 困ったときは

| 症状 | 対処 |
|---|---|
| タスクの状態が「準備完了」のまま動かない | 「操作」タブのパスが間違っている可能性があります。`deploy\run-bot.ps1` が実在するか確認してください |
| 前回の実行結果が `1`（`0x1`） | 起動処理が失敗しています。**`logs\launcher.log` に原因が記録されています**。`Get-Content logs\launcher.log -Tail 30` で確認してください |
| `run-bot.ps1` 実行時に「配列インデックス式が存在しないか、または無効です」「文字列に終端記号 " がありません」などの構文エラー | スクリプトが文字化けしています。`deploy\run-bot.ps1` を編集して日本語などの非ASCII文字を追加すると発生します（PowerShell 5.1はBOM無しの`.ps1`を日本語環境の文字コードとして読むため）。`git checkout deploy\run-bot.ps1` で元に戻してください |
| `logs\bot.log` が作られない | Botが起動する前に失敗しています。`logs\launcher.log` を確認してください。手元で `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<リポジトリのパス>\deploy\run-bot.ps1"` を実行すると、同じ処理を画面上で再現できます |
| ログファイルが作られない | `.env` に `LOG_FILE=logs\bot.log` を書き忘れています |
| 数日後に勝手に止まっている | 「設定」タブの**「タスクを停止するまでの時間」のチェックが外れているか**確認してください（既定3日で強制終了されます） |
| 朝の通知が来ない | PCがスリープしていた可能性があります。手順2の `powercfg` を再確認してください |
| 投稿が二重に保存される | 手元のPCでもBotが動いています。どちらか一方だけにしてください |
| 起動時に「設定エラー: 必須の環境変数が…」 | `.env` の記入漏れです。表示された変数名を確認してください |

---

## 8. 電気代の目安

| 消費電力 | 月の電気代（31円/kWh換算） |
|---|---|
| 10W | 約220円 |
| 15W | 約330円 |
| 20W | 約450円 |

24時間×30日＝720時間で計算しています。電力単価は契約・地域によって変わります。
