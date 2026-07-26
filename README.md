# hearth-life（ライフログBot・最小版）

Discordの `#daily` チャンネルに投稿したテキストとImg画像を、

- テキスト → GitHubの非公開リポジトリへMarkdownとして保存
- 画像 → Cloudflare R2の非公開バケットへ保存（GitHubにはR2の「オブジェクトキー」だけを記録）

する最小構成のBotです。AIによる分類・要約や、GitHub Issue作成、定時通知などは今回は実装していません。

## 完成イメージ

```
Discordの #daily に投稿
        │
        ├─ テキスト → GitHub: daily/2026/07/2026-07-19.md
        └─ 画像     → Cloudflare R2: images/2026/07/19/<message-id>-<filename>
```

GitHubの日記ファイルには画像そのものではなく、R2のオブジェクトキーだけが記録されます。R2バケットは非公開のため、キーを知っているだけでは画像は見られません（閲覧機能は今後追加予定）。

---

## 1. 必要なサービス

- Discordサーバーと、そこに参加させるDiscord Bot
- GitHubの非公開リポジトリ
- Cloudflare アカウントとR2バケット
- Python 3.12以上（またはDocker）

---

## 2. Discord Botの作成方法

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセスし、「New Application」で新規作成します（例: `Hearth Bot`）。
2. 左メニューの「Bot」から Bot を作成し、「Reset Token」で **Bot Token** を取得します。
   - このトークンはGitHubやチャットには絶対に貼らず、ローカルの `.env` にのみ保存してください。
3. 同じ「Bot」ページで、以下を **必ず有効化** します。
   - **Message Content Intent**（本文を読み取るために必須です）
4. OAuth2 → URL Generator で招待URLを作ります。
   - **SCOPES**: `bot` と **`applications.commands`** の両方にチェック
     （`applications.commands` が無いと `/image` などのスラッシュコマンドが使えません）
   - **BOT PERMISSIONS**:
     - `View Channels`
     - `Send Messages`
     - `Read Message History`
     - `Attach Files`
     - `Embed Links`
5. 生成されたURLからBotを自分のサーバーに招待します。
6. サーバーに `#daily` チャンネルを作成し、そのチャンネルIDを控えます（Discordの開発者モードを有効にし、チャンネルを右クリック→「IDをコピー」）。サーバー自体のID（Guild ID）も同様に控えます。

---

## 3. GitHubリポジトリとFine-grained tokenの準備

1. GitHubで非公開（Private）リポジトリを作成します（例: `hearth-life`）。
2. [Fine-grained personal access token](https://github.com/settings/tokens?type=beta) を作成します。
   - Repository access: **Only select repositories** → 作成したリポジトリのみを選択
   - Permissions:
     - **Contents: Read and write**（日記のMarkdown保存に必要）
     - **Metadata: Read-only**
     - **Issues: Read and write**（`!task` でIssueを作成するために必要）
3. 発行されたトークンを控えます（この画面を閉じると再表示できません）。

---

## 4. Cloudflare R2バケットとAPIトークンの作成方法

1. Cloudflare Dashboard → **Storage & databases → R2 → Overview** を開きます（初回はR2の利用開始設定が必要です）。
2. バケットを作成します（例: `hearth-media`）。
   - Storage class: `Standard`
   - Public access: **無効のまま**（R2.devの公開URLは有効にしません）
3. R2画面の **API Tokens** から新しいトークンを作成します。
   - 権限: **Object Read & Write**
   - 対象バケット: 作成したバケットのみ
4. 発行時に表示される以下の値を安全な場所に控えます（Secret Access Keyは再表示できません）。
   - Access Key ID
   - Secret Access Key
   - Account ID
   - Bucket Name
5. エンドポイントURLは次の形式です。
   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

---

## 5. セットアップ手順

### 5.1 リポジトリを取得し、仮想環境を作成

```bash
git clone <このリポジトリのURL>
cd hearth-life
python3 -m venv .venv
source .venv/bin/activate   # Windowsの場合は .venv\Scripts\activate
```

### 5.2 依存関係のインストール

```bash
pip install -r requirements.txt
```

### 5.3 `.env` の設定

`.env.example` をコピーして `.env` を作成し、各項目を埋めます。

```bash
cp .env.example .env
```

```env
DISCORD_BOT_TOKEN=            # DiscordのBot Token
DISCORD_GUILD_ID=             # DiscordサーバーのID
DISCORD_DAILY_CHANNEL_ID=     # #daily チャンネルのID
DISCORD_TASK_CHANNEL_ID=      # !task を受け付けるチャンネルID（空なら #daily で受け付ける）
ALLOWED_DISCORD_USER_IDS=     # 投稿を許可するユーザーIDをカンマ区切りで（空なら全員許可）

GITHUB_TOKEN=                 # Fine-grained personal access token
GITHUB_OWNER=                 # GitHubのユーザー名 or Organization名
GITHUB_REPO=hearth-life       # リポジトリ名
GITHUB_BRANCH=main            # 保存先ブランチ

R2_ACCOUNT_ID=                # CloudflareアカウントID
R2_ACCESS_KEY_ID=             # R2 Access Key ID
R2_SECRET_ACCESS_KEY=         # R2 Secret Access Key
R2_BUCKET_NAME=hearth-media   # R2バケット名
R2_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com

TIMEZONE=Asia/Tokyo
MAX_ATTACHMENT_SIZE_MB=20     # 添付画像の上限サイズ（MB）
SIGNED_URL_EXPIRY_SECONDS=300 # /image で発行する一時URLの有効秒数（既定5分・最大7日）

NOTIFICATION_CHANNEL_ID=      # 定時通知の送信先チャンネルID（空なら #daily へ送信）
MORNING_NOTIFICATION_TIME=04:00  # 朝の通知時刻（HH:MM・空欄で無効）
EVENING_NOTIFICATION_TIME=20:00  # 夜の通知時刻（HH:MM・空欄で無効）

LOG_FILE=                     # ログの出力先（空ならコンソールのみ）。常時稼働時は設定推奨
LOG_MAX_BYTES=5242880         # ログ1ファイルの上限（既定5MB）
LOG_BACKUP_COUNT=3            # 保持する世代数
```

`.env` は `.gitignore` に含まれているため、Gitにコミットされません。**トークン類を絶対にGitHubへコミットしないでください。**

---

## 6. ローカル実行方法

```bash
source .venv/bin/activate
python -m app.main
```

起動時に必須の環境変数が不足している場合は、不足している変数名を表示してすぐに終了します。

正常に起動すると、DiscordのBotがオンラインになります。`#daily` チャンネルにテキストや画像を投稿すると、Botが処理結果を返信します。

---

## 7. テスト方法

外部サービス（Discord / GitHub / R2）へは一切アクセスせず、すべてモックを使ったユニットテストです。

```bash
source .venv/bin/activate
pytest
```

---

## 7.5 画像を見る（`/image` コマンド）

R2バケットは非公開のため、保存した画像は通常のURLでは閲覧できません。見たいときは、Discordで `/image` コマンドを使って**一時的な署名付きURL**を発行します。

1. GitHubの日記ファイルを開き、「添付ファイル」に記録されたR2キーをコピーする
   ```
   images/2026/07/26/1530740602294108251-2026-01-04_194409.png
   ```
2. Discordで次のように入力する
   ```
   /image key: images/2026/07/26/1530740602294108251-2026-01-04_194409.png
   ```
3. Botが一時URLを返信します。既定では**約5分で失効**します。

補足：

- 返信は **自分にしか見えない形式（ephemeral）** で送られます。他のメンバーには表示されません。
- 発行されたURLは事実上のパスワードです。ログには出力されず、有効期限が切れると使えなくなります。
- 有効期間は `.env` の `SIGNED_URL_EXPIRY_SECONDS` で変更できます（秒単位、最大7日）。
- `ALLOWED_DISCORD_USER_IDS` を設定している場合、対象外のユーザーはこのコマンドを使えません。

## 7.6 タスクを登録する（`!task` コマンド）

`!task` で始まる投稿は、日記ではなく **GitHub Issue** として登録されます。

```
!task 車のオイル交換を予約する
```

複数行で書くと、**1行目がIssueのタイトル**、2行目以降が本文になります。

```
!task 車のオイル交換を予約する
ディーラーは平日のみ。前回は1月。
```

成功すると、Botが作成したIssueの番号とURLを返信します。

```
✅ GitHub Issueを作成しました
#12 車のオイル交換を予約する
https://github.com/obertbt/hangman/issues/12
```

補足：

- `!task` の投稿は**日記ファイルには保存されません**（Issueとの二重記録を避けるため）
- 既定では `#daily` チャンネルで受け付けます。専用の `#task` チャンネルを作った場合は、そのチャンネルIDを `.env` の `DISCORD_TASK_CHANNEL_ID` に設定してください
- Issueの本文には、投稿者・ユーザーID・メッセージID・投稿日時（JST）が自動で記録されます
- GitHubトークンに **Issues: Read and write** 権限が必要です

## 7.7 朝・夜の定時通知

Botを起動している間、決まった時刻に自動でメッセージが届きます。時刻は `.env` で変更でき、`TIMEZONE`（既定 `Asia/Tokyo`）で判定されます。

**朝の通知（既定 04:00）— 未完了タスク一覧**

```
☀️ おはようございます（2026-07-27）
未完了のタスクが2件あります。

- #12 車のオイル交換を予約する
  https://github.com/obertbt/hangman/issues/12
- #11 部屋の模様替え
  https://github.com/obertbt/hangman/issues/11
```

`!task` で作ったGitHub IssueのうちOpen状態のものが、新しい順に最大10件表示されます。Issueを閉じれば一覧から消えます。タスクが無いときは「未完了のタスクはありません。」と表示されます。

**夜の通知（既定 20:00）— 今日の記録件数**

```
🌙 今日のライフログ（2026-07-26）
今日は3件の記録がありました。おつかれさまでした。
```

まだ何も記録していない日は、次のように書き忘れを知らせます。

```
🌙 今日のライフログ（2026-07-26）
まだ今日の記録がありません。ひとことだけでも残しておきませんか？
```

補足：

- 通知先は既定で `#daily` です。別のチャンネルへ送りたい場合は `NOTIFICATION_CHANNEL_ID` を設定してください
- 通知を止めたい場合は、対応する時刻の設定を**空欄**にします（例: `MORNING_NOTIFICATION_TIME=`）
- **Botを起動している間だけ動作します。** PCの電源が切れていたりBotが停止していると、その回の通知は送られません（後からまとめて送られることはありません）

## 8. 動作確認方法

1. `.env` を設定した状態でBotを起動します。
2. Discordの `#daily` チャンネルに、テキストのみを投稿します。
   - Botが `✅ ライフログをGitHubへ保存しました` と返信することを確認します。
   - GitHubリポジトリに `daily/YYYY/MM/YYYY-MM-DD.md` が作成・追記されていることを確認します。
3. 画像（jpg/png/webp/gif）を添付して投稿します。
   - Botが `✅ ライフログを保存しました` / `画像：Cloudflare R2（N件）` と返信することを確認します。
   - Cloudflare R2の `hearth-media` バケットに `images/YYYY/MM/DD/<message-id>-<filename>` が作成されていることを確認します。
   - GitHubのMarkdownには画像ファイル自体ではなく、R2のオブジェクトキーが記録されていることを確認します。
4. わざと `MAX_ATTACHMENT_SIZE_MB` より大きいファイルを添付し、保存が拒否されて理由が返信されることを確認します。
5. `ALLOWED_DISCORD_USER_IDS` を設定した状態で、リストにないユーザーが投稿しても保存されないことを確認します。

---

## 9. よくあるエラー

| 症状 | 原因・対処 |
|---|---|
| Botが起動時にすぐ終了し、環境変数名が表示される | `.env` に必須項目が未設定です。表示された変数名を確認して設定してください。 |
| Botはオンラインだが `#daily` に投稿しても反応しない | Message Content Intentが無効になっていないか確認してください。また `DISCORD_GUILD_ID` / `DISCORD_DAILY_CHANNEL_ID` が実際の値と一致しているか確認してください。 |
| `❌ 保存に失敗しました / 処理段階：GitHub保存` と返信される | GitHub Tokenの権限（Contents: Read and write）やリポジトリ名・ブランチ名を確認してください。 |
| `❌ 保存に失敗しました / 処理段階：R2アップロード` と返信される | R2のAPIトークン権限や `R2_ENDPOINT_URL` の形式（`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`）を確認してください。 |
| 定時通知が届かない | Botが起動していない時刻だった可能性があります（通知はBot稼働中のみ送信されます）。また `.env` の時刻設定が空欄になっていないか、起動ログの「朝の定時通知を 04:00 に設定しました」という行が出ているか確認してください。 |
| `!task` で `❌ 保存に失敗しました / 処理段階：GitHub Issue作成` と返信される | GitHubのFine-grained tokenに **Issues: Read and write** 権限が付いているか確認してください。権限を追加した場合はトークンの再発行が必要なことがあります。 |
| `/image` コマンドがDiscordの入力候補に出てこない | 招待URLのSCOPESに `applications.commands` が含まれていない可能性があります。READMEの手順2でチェックを入れ直した招待URLで、Botを再度招待してください（サーバーから追放する必要はありません）。その後Botを再起動し、Discordアプリも再読み込みしてください。 |
| GitHubへの書き込みで409エラーが頻発する | 同じ日付ファイルへの同時書き込みが多発している状態です。Bot内部で自動的に再試行（最大3回）しますが、それでも失敗する場合は投稿間隔を空けてください。 |

**注意:** Discord Bot Token、GitHub Token、R2のAccess Key ID / Secret Access Key / Account IDは、コード・コミット・チャット・ログのいずれにも記載しないでください。

---

## 10. Dockerでの実行（任意）

まずはローカルのPython環境での動作確認を推奨します。問題なければDockerでも実行できます。

```bash
docker compose up --build
```

停止は `Ctrl+C`、バックグラウンド実行は `docker compose up -d --build` です。

単発で試すだけなら次でも動きます。

```bash
docker build -t hearth-life .
docker run --rm --env-file .env hearth-life
```

---

## 10.5 24時間稼働させる

Botは**起動している間だけ**動きます。PCを閉じると日記の保存も定時通知も止まるため、常時稼働させる環境が必要です。

### 環境ごとの専用手順

| 稼働環境 | 手順書 | 月あたりの費用の目安 |
|---|---|---|
| **WindowsミニPC（つけっぱなし）** | [docs/deploy-windows-minipc.md](docs/deploy-windows-minipc.md) | 電気代のみ（10W機で約220円） |
| **WebARENA Indigo などのVPS** | [docs/deploy-webarena-indigo.md](docs/deploy-webarena-indigo.md) | 350〜800円 |

以下は、任意のLinuxサーバー向けの共通設定です（上記VPS手順の中身でもあります）。

### 事前に決めること

- **タイムゾーンはサーバー設定に依存しません。** 日付・時刻は `.env` の `TIMEZONE`（既定 `Asia/Tokyo`）で判定するため、サーバーがUTCでも日記の日付は日本時間で正しく切り替わります
- `.env` は**Gitに含まれていません**。サーバーへは手動でコピーします（後述）

### 方式A: Docker Compose（推奨）

サーバーにDockerとGitが入っている前提です。

```bash
# 1. リポジトリを取得
git clone https://github.com/obertbt/hangman.git
cd hangman
git checkout claude/lifelog-bot-minimal-d1w3jb

# 2. .env を作成し、手元と同じ内容を貼り付ける
nano .env
chmod 600 .env

# 3. バックグラウンドで起動
docker compose up -d --build
```

これだけで、**クラッシュ時の自動再起動**と**サーバー再起動後の自動起動**（`restart: unless-stopped`）が有効になります。

運用コマンド：

```bash
docker compose logs -f       # ログを見る（起動確認・エラー調査）
docker compose restart       # 再起動
docker compose stop          # 停止（意図的な停止後は自動復帰しません）
docker compose up -d --build # コード更新後の反映（git pull のあとに実行）
```

### 方式B: systemd（Dockerを使わない場合）

```bash
# 1. 実行用ユーザーとディレクトリを用意
sudo useradd --system --create-home hearth
sudo git clone https://github.com/obertbt/hangman.git /opt/hangman
cd /opt/hangman
sudo git checkout claude/lifelog-bot-minimal-d1w3jb

# 2. 仮想環境と依存関係
sudo python3 -m venv /opt/hangman/.venv
sudo /opt/hangman/.venv/bin/pip install -r requirements.txt

# 3. .env を作成して権限を絞る
sudo nano /opt/hangman/.env
sudo chmod 600 /opt/hangman/.env
sudo chown -R hearth:hearth /opt/hangman

# 4. サービスを登録して起動
sudo cp deploy/hearth-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hearth-bot
```

運用コマンド：

```bash
sudo systemctl status hearth-bot     # 稼働状況
sudo journalctl -u hearth-bot -f     # ログを見る
sudo systemctl restart hearth-bot    # 再起動
```

### 稼働できたかの確認

1. ログに `Logged in as ...` と `監視チャンネルを確認しました: #daily` が出ている
2. ログに `朝の定時通知を 04:00 に設定しました` / `夜の定時通知を 20:00 に設定しました` が出ている
3. `#daily` に投稿して、Botが返信しGitHubに保存される
4. **サーバーを再起動しても、自動でBotが復帰する**（ここまで確認して初めて「24時間稼働」です）

### 秘密情報の扱い

- `.env` は**絶対にGitにコミットしない**でください（`.gitignore` 済み）
- サーバー上の `.env` は `chmod 600` で本人のみ読み取り可にしてください
- Dockerイメージにトークンは含まれません（`.dockerignore` で `.env` を除外し、実行時に渡す方式です）
- トークンが漏れた可能性がある場合は、Discord / GitHub / R2 の各画面で**再発行（ローテーション）**してください

---

## 11. プロジェクト構成

```
hearth-life/
├─ app/
│  ├─ main.py             # エントリーポイント
│  ├─ config.py           # 環境変数の読み込み・検証
│  ├─ discord_handler.py  # Discord投稿・/image・!task の処理と返信
│  ├─ github_service.py   # GitHubへのMarkdown保存・Issue作成
│  ├─ r2_service.py       # R2への画像アップロード・削除・署名付きURL発行
│  ├─ notifications.py    # 朝・夜の定時通知メッセージの組み立て
│  └─ models.py           # 共通データ構造
├─ tests/                 # pytestによるユニットテスト
├─ deploy/
│  ├─ hearth-bot.service  # systemd用ユニット（Linuxサーバー常時稼働）
│  └─ run-bot.ps1         # Windowsタスクスケジューラ用の起動スクリプト
├─ docs/
│  ├─ deploy-windows-minipc.md   # WindowsミニPCでの24時間稼働手順
│  └─ deploy-webarena-indigo.md  # WebARENA Indigoへのデプロイ手順
├─ daily/                 # GitHub上に生成される日記ファイルの置き場
├─ .env.example
├─ .gitignore
├─ requirements.txt
├─ Dockerfile
├─ docker-compose.yml     # 24時間稼働・方式A（自動再起動つき）
├─ .dockerignore
└─ README.md
```

---

## 12. 現時点で実装していないもの

- AIによる分類・要約
- 動画・音声・PDF対応
- 画像のOCR・自動圧縮
- 恒久的な公開URL（一時的な署名付きURLのみ対応）
- Web管理画面・データベース

---

## 13. 次に追加できる機能

1. ~~`/image` コマンドで、R2の画像に対する一時的な署名付きURLを発行する機能~~（実装済み）
2. ~~`!task` によるGitHub Issue作成~~（実装済み）
3. ~~朝・夜の定時通知~~（実装済み）
4. AIによる日記の整理・要約
