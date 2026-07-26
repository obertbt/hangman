# WebARENA Indigo で24時間稼働させる手順

Windows PCから操作して、WebARENA IndigoのVPS上でBotを常時稼働させるまでの手順です。

所要時間は30分〜1時間程度、費用は最小プランで月350〜500円程度です（料金は変動するため、契約前に公式の最新料金をご確認ください）。

---

## 0. 【最初に】GitHubリポジトリを非公開にする

このBotは日記の本文をGitHubに保存します。リポジトリが公開のままだと、**日記の内容・Discordユーザー名・行動記録が誰でも閲覧できる状態**になります。

必ず先に非公開へ変更してください。

1. https://github.com/obertbt/hangman/settings を開く
2. ページ最下部の **「Danger Zone」** までスクロールする
3. **「Change repository visibility」** の **「Change visibility」** をクリック
4. **「Make private」** を選択
5. 確認のためリポジトリ名（`obertbt/hangman`）を入力し、実行

> すでに公開状態で保存された内容は、第三者に閲覧・取得されていた可能性があります。見られて困る内容を投稿済みの場合は、その記述の削除もご検討ください。

非公開にすると、サーバーからのダウンロードに認証が必要になります（手順5で設定します）。

---

## 1. Windows側でSSH鍵を作る

サーバーへのログインに使う鍵を、先に手元で作ります。パスワードより安全で、Indigoの登録時に必要になります。

PowerShellを開いて実行します。

```powershell
ssh-keygen -t ed25519 -C "hangman-vps"
```

- 「Enter file in which to save the key」→ そのまま **Enter**（既定の場所に保存）
- 「Enter passphrase」→ そのまま **Enter**（空でも可。設定する場合は忘れないように）

作成できたら、**公開鍵**の中身を表示します。

```powershell
Get-Content ~\.ssh\id_ed25519.pub
```

`ssh-ed25519 AAAA...` から始まる1行が表示されます。これをコピーしておきます（この後Indigoの画面に貼り付けます）。

> `id_ed25519`（`.pub` が付かない方）は**秘密鍵**です。誰にも渡さないでください。

---

## 2. Indigoでインスタンスを作成する

WebARENA Indigoにサインアップし、インスタンスを作成します。画面の項目名は変更されることがあるため、選ぶ内容を基準にしてください。

| 項目 | 選ぶもの |
|---|---|
| リージョン | 東京（日本国内） |
| OS / イメージ | **Ubuntu 24.04 LTS**（無い場合は22.04 LTS） |
| プラン | 最小プラン（メモリ1GB程度。このBotの実使用は150MB程度です） |
| SSHキー | 手順1でコピーした**公開鍵**を登録 |

作成後、割り当てられた **IPアドレス** を控えます。

### ファイアウォール設定

このBotは**外部からの接続を一切受け付けません**（Discordへ自分から繋ぎに行くだけです）。したがって、開放するポートは**SSH（22番）のみ**にしてください。Web用の80/443番を開ける必要はありません。

---

## 3. Windowsからサーバーに接続する

PowerShellで実行します（`<IPアドレス>` は控えた値に置き換え）。

```powershell
ssh ubuntu@<IPアドレス>
```

- ユーザー名はイメージによって `ubuntu` か `root` です。`ubuntu` で入れない場合は `root@<IPアドレス>` を試してください
- 初回は「The authenticity of host ... Are you sure you want to continue connecting?」と聞かれるので `yes` と入力

プロンプトが `ubuntu@...:~$` のように変われば接続成功です。**ここから先のコマンドは、すべてサーバー上での操作**になります。

---

## 4. サーバーの初期設定

### パッケージの更新と自動セキュリティ更新

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades
sudo systemctl enable --now unattended-upgrades
```

自動更新を入れておくと、セキュリティ修正が自動で適用されます。放置運用するサーバーでは重要です。

### Dockerの導入

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

グループ追加を反映するため、**一度ログアウトして入り直します**。

```bash
exit
```

```powershell
ssh ubuntu@<IPアドレス>
```

戻ったら、動作確認します。

```bash
docker --version
docker compose version
```

両方バージョンが表示されればOKです。

---

## 5. リポジトリをサーバーにダウンロードする

非公開リポジトリなので、サーバーに読み取り専用の鍵（デプロイキー）を登録します。

### サーバー側で鍵を作る

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

表示された `ssh-ed25519 AAAA...` の1行をコピーします。

### GitHubに登録する

1. https://github.com/obertbt/hangman/settings/keys を開く
2. **「Add deploy key」** をクリック
3. Title: `indigo-vps` など分かる名前
4. Key: コピーした公開鍵を貼り付け
5. **「Allow write access」は チェックしない**（サーバーは読み取りだけできれば十分です）
6. 「Add key」をクリック

### サーバーで鍵を使う設定をして取得

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

git clone git@github.com:obertbt/hangman.git
cd hangman
git checkout claude/lifelog-bot-minimal-d1w3jb
```

初回は「Are you sure you want to continue connecting?」と聞かれるので `yes` を入力します。

---

## 6. `.env` をサーバーに置く

手元のWindowsの `.env` と**同じ内容**をサーバーにも作ります。

```bash
nano .env
```

エディタが開くので、手元の `.env` の中身をすべて貼り付けます（PowerShellで `notepad .env` を開いてコピーしておくと楽です）。

- 貼り付け: ターミナル画面で**右クリック**
- 保存: `Ctrl + O` → `Enter`
- 終了: `Ctrl + X`

保存したら、本人以外読めないように権限を絞ります。

```bash
chmod 600 .env
```

> **タイムゾーンについて**: サーバーの時刻設定がUTCでも問題ありません。日付・通知時刻は `.env` の `TIMEZONE`（既定 `Asia/Tokyo`）で判定されるため、日本時間で正しく動作します。

---

## 7. 起動する

```bash
docker compose up -d --build
```

初回はイメージの構築に数分かかります。完了したらログを確認します。

```bash
docker compose logs -f
```

次の行が出ていれば成功です。

```
Logged in as hangman bot#6671
監視チャンネルを確認しました: #daily（hangman）
朝の定時通知を 04:00 に設定しました
夜の定時通知を 20:00 に設定しました
```

ログ表示は `Ctrl + C` で抜けられます（Botは動いたままです）。

### 手元のPCのBotは止めてください

サーバーと手元の両方でBotが動いていると、**1回の投稿が二重に保存されます。** 手元のPowerShellで動かしているBotは `Ctrl + C` で停止してください。

---

## 8. 動作確認

1. Discordの `#daily` にテキストを投稿 → Botが返信し、GitHubに保存される
2. 画像を添付して投稿 → R2に保存される
3. `!task テスト` → GitHub Issueが作られる
4. `/image <R2キー>` → 一時URLが発行される

### 再起動テスト（これが本番です）

サーバーを再起動して、Botが**自動で復帰する**ことを確認します。ここまで確認して初めて「24時間稼働」と言えます。

```bash
sudo reboot
```

1〜2分待ってから接続し直します。

```powershell
ssh ubuntu@<IPアドレス>
```

```bash
cd hangman
docker compose ps
```

`STATUS` が `Up`（稼働中）になっていれば、自動復帰の設定は正しく効いています。Discordに投稿して反応するかも確認してください。

---

## 9. 日常の運用コマンド

すべて `cd hangman` してから実行します。

```bash
docker compose logs -f        # ログを見る（障害調査）
docker compose logs --tail 50 # 直近50行だけ見る
docker compose ps             # 稼働状況
docker compose restart        # 再起動
docker compose stop           # 停止（意図的な停止。自動復帰しません）
docker compose start          # 停止から再開
```

### コードを更新したとき

```bash
cd hangman
git pull
docker compose up -d --build
```

### `.env` を変更したとき

```bash
nano .env
docker compose restart
```

---

## 10. 困ったときは

| 症状 | 対処 |
|---|---|
| `ssh` で `Permission denied (publickey)` | ユーザー名が違う可能性があります（`ubuntu` / `root` を試す）。またはIndigoに登録した公開鍵が手元の鍵と一致していません |
| `git clone` で `Permission denied` | デプロイキーの登録に失敗しています。`cat ~/.ssh/github_deploy.pub` の内容とGitHubに登録した内容が一致しているか確認してください |
| `docker: permission denied` | `sudo usermod -aG docker $USER` の後にログインし直していません。`exit` して再接続してください |
| Botが起動しない | `docker compose logs --tail 50` を確認。「設定エラー: 必須の環境変数が…」なら `.env` の記入漏れです |
| 投稿が二重に保存される | 手元のPCのBotが動いたままです。停止してください |
| 定時通知が来ない | `docker compose ps` で稼働中か確認。停止していた時刻の通知は後から届きません |

---

## 11. 費用を止めたいとき

Indigoは使った分だけ課金されます。Botが不要になったら、**インスタンスを削除**してください（停止しただけでは課金が続く場合があります）。料金の扱いは契約プランによって異なるため、管理画面で確認してください。
