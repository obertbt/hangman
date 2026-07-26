# hearth-life（ライフログBot）

Discordをライフログの入力画面として使うBotです。

- テキスト → GitHubの非公開リポジトリへMarkdownとして保存
- 画像 → Cloudflare R2の非公開バケットへ保存（GitHubにはR2の「オブジェクトキー」だけを記録）

## 完成イメージ

```
Discordの #daily に投稿
        │
        ├─ テキスト → GitHub: daily/2026/07/2026-07-19.md
        └─ 画像     → Cloudflare R2: images/2026/07/19/<message-id>-<filename>
```

GitHubの日記ファイルには画像そのものではなく、R2のオブジェクトキーだけが記録されます。R2バケットは非公開のため、キーを知っているだけでは画像は見られません（閲覧は `/image` コマンドで発行する一時URLから行います）。

## 機能一覧

| 機能 | 説明 | 詳細 |
|---|---|---|
| 日記の保存 | `#daily` への投稿をMarkdownで保存 | [6](#6-ローカル実行方法) |
| 画像の保存 | 添付画像を非公開R2バケットへ | 同上 |
| `/image` | 画像の一時閲覧URLを発行（既定5分） | [7.5](#75-画像を見るimage-コマンド) |
| `!task` | 投稿をGitHub Issueとして登録 | [7.6](#76-タスクを登録するtask-コマンド) |
| 定時通知 | 朝は未完了タスク、夜は今日の記録件数 | [7.7](#77-朝夜の定時通知) |
| AI要約（任意） | 夜の通知に「今日のまとめ」を添える | [7.8](#78-夜の通知にai要約を添える任意) |
| Web画面（任意） | 日記とタスクをブラウザで閲覧。外出先からも可 | [docs/web-viewer.md](docs/web-viewer.md) |
| 天気の記録（任意） | 投稿時の天気を日記に自動で添える | [7.10](#710-天気を自動で記録する任意) |
| 死活監視（任意） | Botが止まったらメールで気づける | [7.11](#711-botの停止に気づけるようにする任意) |
| 週次・月次まとめ（任意） | 期間のまとめを自動生成。R2使用量も記録 | [7.12](#712-週次月次のまとめを自動生成する任意) |
| `/search`（任意） | 過去の日記をキーワード・タグで検索 | [7.13](#713-日記を検索するsearch-コマンド任意) |
| AIタグ付け（任意） | 投稿に自動でタグを付け、検索を絞り込みやすく | [7.14](#714-投稿に自動でタグを付ける任意) |
| 24時間稼働 | 自動起動・自動復帰の設定 | [10.5](#105-24時間稼働させる) |

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
DISCORD_TASK_CHANNEL_ID=      # 投稿がそのままタスクになるチャンネルID（空なら !task が必須）
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

PERIODIC_SUMMARY_ENABLED=false   # true で週次・月次まとめを自動生成
PERIODIC_SUMMARY_TIME=05:00      # まとめを作る時刻（月曜=週次 / 1日=月次）
PERIODIC_SUMMARY_MAX_INPUT_CHARS=12000  # AIに渡す最大文字数
REPORT_STORAGE_USAGE=true        # 月次まとめにR2の使用量を載せる

SEARCH_ENABLED=false          # true で /search による日記検索を有効化
SEARCH_INDEX_PATH=data/search.db  # 検索インデックスの保存先
SEARCH_BACKFILL_DAYS=730      # 初回に何日前まで遡ってインデックスを作るか

TAGGING_ENABLED=false         # true で投稿に自動でタグを付ける（SUMMARY_PROVIDER必須）
TAG_VOCABULARY=               # 使うタグをカンマ区切りで（空なら既定の10種）
TAGGING_TIMEOUT_SECONDS=120   # タグ生成を待つ上限秒数（ローカルLLMのモデル読み込み時間を含む）

HEALTHCHECK_URL=              # 死活監視のping先（空なら無効）
HEALTHCHECK_INTERVAL_MINUTES=60  # pingの間隔（分）

WEATHER_LATITUDE=             # 天気を記録する地点の緯度（空なら無効）
WEATHER_LONGITUDE=            # 同・経度

WEB_ENABLED=false             # true でWeb閲覧画面を有効化
WEB_HOST=0.0.0.0              # 待ち受けアドレス（127.0.0.1 なら本体からのみ）
WEB_PORT=8787
WEB_PASSWORD=                 # WEB_ENABLED=true のとき必須（8文字以上）
WEB_SESSION_HOURS=720         # ログインの保持時間（既定30日）

SUMMARY_PROVIDER=none         # 夜の要約: none / ollama / claude
SUMMARY_TIMEOUT_SECONDS=180   # 要約生成のタイムアウト秒数
OLLAMA_URL=http://localhost:11434  # Ollamaの接続先
OLLAMA_MODEL=qwen2.5:7b       # 使用するローカルモデル
ANTHROPIC_API_KEY=            # SUMMARY_PROVIDER=claude のときだけ必要
ANTHROPIC_MODEL=claude-opus-5
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
- **専用チャンネルを作ると `!task` が不要になります**（下記）
- Issueの本文には、投稿者・ユーザーID・メッセージID・投稿日時（JST）が自動で記録されます
- GitHubトークンに **Issues: Read and write** 権限が必要です

### `!task` を書かずにタスクを登録する

毎回 `!task` と入力するのは手間なので、**専用チャンネルを作ると、そこへの投稿がそのままタスクになります。**

1. Discordに `#task` チャンネルを作成
2. チャンネルを右クリック →「チャンネルIDをコピー」
3. `.env` に設定して、Botを再起動

   ```
   DISCORD_TASK_CHANNEL_ID=コピーしたID
   ```

これ以降、`#task` に「牛乳を買う」と書くだけでIssueが作られます。

| 投稿先 | 書き方 | 結果 |
|---|---|---|
| `#task` | `牛乳を買う` | ✅ タスクになる |
| `#task` | `!task 牛乳を買う` | ✅ タスクになる（プレフィックスは除去されます） |
| `#daily` | `!task 牛乳を買う` | ✅ タスクになる（日記には保存されません） |
| `#daily` | `今日は走った` | 📔 日記として保存 |

`#daily` で `!task` を使う方法も引き続き使えるので、**すでに日記チャンネルを開いているときはそのまま、思いついたタスクだけを書くときは `#task` へ**、と使い分けられます。

> ⚠️ `DISCORD_TASK_CHANNEL_ID` を**設定していない場合**は、これまでどおり `!task` が必須です（未設定時にこの動作を有効にすると、日記の投稿がすべてIssueになってしまうためです）。

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

## 7.8 夜の通知にAI要約を添える（任意）

夜の通知に、その日の記録をAIが2〜3行にまとめた「今日のまとめ」を追加できます。既定では**無効**です。

```
🌙 今日のライフログ（2026-07-26）
今日は3件の記録がありました。おつかれさまでした。

📝 今日のまとめ
朝に5km走り、夕方は買い物へ。夜はホッケーの練習に参加した。
```

要約に渡されるのは**投稿本文だけ**です。投稿者名・ユーザーID・メッセージID・R2キーといった管理情報は除外されます。

**要約の生成に失敗しても通知は届きます**（要約部分が省略されるだけです）。モデルが起動していない、APIが落ちているといった場合でも、日々の通知が止まることはありません。

### 方式A: ローカルLLM（推奨・無料）

日記の内容が**PCの外に一切出ません**。追加費用もかかりません。

1. [Ollama](https://ollama.com/download) をインストール
2. モデルを取得（初回のみ、数GBのダウンロード）

   ```powershell
   ollama pull qwen2.5:7b
   ```

   メモリが8GB程度の環境では、より軽量な `qwen2.5:3b` や `gemma3:4b` を使ってください。

3. `.env` に設定

   ```
   SUMMARY_PROVIDER=ollama
   OLLAMA_MODEL=qwen2.5:7b
   ```

4. Botを再起動

CPUでの生成には20〜60秒ほどかかりますが、夜1回のバッチ処理なので実用上は問題ありません。時間がかかる場合は `SUMMARY_TIMEOUT_SECONDS` を増やしてください。

### 方式B: Claude API

最も高品質ですが、**日記の本文がAnthropicのAPIに送信されます**。費用は短い日記の要約なら月30〜100円程度です。

1. https://console.anthropic.com でAPIキーを発行
2. `.env` に設定

   ```
   SUMMARY_PROVIDER=claude
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Botを再起動

### 設定の確認

起動ログに、選択した方式が表示されます。

```
夜の要約: ollama（モデル: qwen2.5:7b / http://localhost:11434）
```

`夜の要約は無効です（SUMMARY_PROVIDER=none）` と出る場合は設定が反映されていません。

## 7.9 ブラウザで日記とタスクを見る（任意）

日記とタスクをブラウザから閲覧できるWeb画面を、Botと同じプロセスで動かせます。既定では**無効**です。

- 月の一覧 → 日ごとの日記（画像もその場で表示）
- 未完了タスク（GitHub Issue）の一覧
- パスワードでのログインが必須

外出先から見る場合は、ポート開放ではなく**Tailscale**（無料の仮想プライベートネットワーク）を使うため、インターネットには公開されません。

設定と手順は **[docs/web-viewer.md](docs/web-viewer.md)** にまとめています。

## 7.10 天気を自動で記録する（任意）

投稿したときの天気を、日記のメタ情報として自動で記録します。既定では**無効**です。

```markdown
## 09:53

今日は車の充電のために2.5km走った

- Discord投稿者: tbt
- Discord投稿日時: 2026-07-26T09:53:02+09:00
- 天気: 晴れ 24.5℃
```

`.env` に地点の緯度・経度を設定すると有効になります。

```
WEATHER_LATITUDE=35.681236
WEATHER_LONGITUDE=139.767125
```

**緯度・経度の調べ方**: Googleマップで自宅などを右クリックすると、`35.681236, 139.767125` の形式で表示されます。左の値が緯度、右が経度です。

補足：

- 天気の取得には [Open-Meteo](https://open-meteo.com/) を使います。**APIキー・アカウント登録は不要で、無料**です
- 片方だけ設定すると起動時にエラーになります（両方設定するか、両方空にしてください）
- **天気の取得に失敗しても日記は保存されます**（`- 天気:` の行が省略されるだけです）

## 7.11 Botの停止に気づけるようにする（任意）

この構成の弱点は、**Botが止まっても気づけないこと**です。ミニPCがWindows Updateで再起動して復帰に失敗していても、通知が来ないだけで見過ごしてしまいます。

外部の監視サービスに定期的にpingを送り、**pingが途絶えたらメールで知らせてもらう**ことで検知できます。

### 設定手順

1. https://healthchecks.io/ で無料アカウントを作成（クレジットカード不要）
2. 「Add Check」で新しいチェックを作成
3. **Period** を「1 hour」、**Grace Time** を「30 min」程度に設定
   - 「1時間ごとにpingが来るはず。30分以上遅れたら異常」という意味です
4. 表示された Ping URL（`https://hc-ping.com/...` の形式）をコピー
5. `.env` に設定して、Botを再起動

   ```
   HEALTHCHECK_URL=https://hc-ping.com/コピーしたUUID
   ```

起動ログに次が出れば有効です。

```
死活監視を有効にしました（60分ごと）
```

これで、Botが停止して1時間半ほど経つと、登録したメールアドレスに通知が届きます。

> pingの送信に失敗してもBotは動き続けます（ログに警告が出るだけです）。監視のためにBotが止まる、という本末転倒を避けるためです。

## 7.12 週次・月次のまとめを自動生成する（任意）

一定期間の記録をまとめたファイルを、GitHubに自動生成します。既定では**無効**です。

| いつ | 対象期間 | 保存先 |
|---|---|---|
| 毎週**月曜** | 前週（月〜日） | `summary/2026-W30.md` |
| 毎月**1日** | 前月（1日〜末日） | `summary/2026-07.md` |

**完了した期間だけ**を対象にします（月曜に「先週」、1日に「先月」）。途中経過でまとめを作って後から作り直す、ということが起きません。

生成されるファイルの例：

```markdown
# 2026年7月 のまとめ

- 期間: 2026-07-01 〜 2026-07-31
- 記録した日数: 24日
- 記録件数: 58件
- 画像: 31枚
- 画像ストレージ使用量: 120件 / 1.0 GB（無料枠10.0 GBの10.0%）

## まとめ

朝のランニングが習慣になった月。週3〜4回のペースで5km前後を走っている。
ホッケーの練習には毎週参加。中旬に車のオイル交換を実施した。
```

作成後、Discordにも通知が届きます。

```
📗 2026年7月 のまとめを作成しました（今月分）
24日 / 58件の記録
https://github.com/obertbt/hangman/blob/main/summary/2026-07.md
```

### 設定

`.env` に追加してBotを再起動します。

```
PERIODIC_SUMMARY_ENABLED=true
PERIODIC_SUMMARY_TIME=05:00
```

起動ログに次が出れば有効です。

```
週次・月次まとめを 05:00 に確認します（月曜=週次 / 1日=月次）
```

### 補足

- **AIまとめの部分は `SUMMARY_PROVIDER` の設定に従います。** `none`（既定）のままだと、件数などの集計だけが記録され、文章のまとめは入りません。ローカルLLM（`ollama`）を設定しておくと、無料で文章のまとめも付きます
- 1か月分の記録が長すぎる場合、AIに渡す前に**日単位で古い順に採用し、上限を超えた分は省略**します（文章が途中で切れないようにするためです）。上限は `PERIODIC_SUMMARY_MAX_INPUT_CHARS` で変更できます
- 月次まとめには**R2の使用量**が記録されます（アイデア5）。無料枠10GBに対する使用率が分かるので、超過に驚かずに済みます。不要なら `REPORT_STORAGE_USAGE=false` で外せます
- 生成に失敗しても、Botの他の機能には影響しません（ログにエラーが残ります）
- **Botが停止していた日に週次・月次の生成日が重なると、その回は作られません。** 後から作りたい場合は、次回の生成を待つか、手動でファイルを作成してください

## 7.13 日記を検索する（`/search` コマンド・任意）

過去の日記をキーワードで探せます。既定では**無効**です。

Discordで `/search` と入力し、`query` にキーワードを入れます。

```
/search query:ホッケー
```

```
🔍 「ホッケー」: 3件

**2026-07-26 21:35** #運動
今日はホッケーの練習。動きが良くなってきた。

**2026-07-19 21:00** #運動
ホッケーの試合。2点取れた。
```

- 結果は**自分にしか見えません**（ephemeral）
- キーワードを**スペースで区切ると絞り込み**になります（`ホッケー 試合` = 両方を含む記録）
- `tag` を指定すると、タグで絞り込めます（`/search tag:運動`）
- Web画面を有効にしている場合は、**「検索」タブ**から同じ検索ができます。タグをクリックすると、そのタグの記録が一覧できます

### しくみ

検索は、手元のPCに置く**検索用インデックス**（SQLiteファイル）を使います。GitHubを毎回読みに行くと、記録が増えるほど遅く重くなるためです。

- 日記が保存されるたびに、その1件がインデックスへ自動で追加されます
- インデックスには**R2のオブジェクトキーは入りません**（画像の枚数だけを記録します）
- インデックスは**いつでも作り直せる控え**です。GitHubが常に正本なので、消しても日記は失われません

### 設定

`.env` に追加してBotを再起動します。

```
SEARCH_ENABLED=true
```

初回起動時、**過去の日記を自動で読み込んでインデックスを作ります**（ログに進捗が出ます）。

```
検索インデックスの初回作成を開始します（2024-07-27 以降）
検索インデックスを作成しました: 180日分 / 412件
```

| 設定 | 既定値 | 説明 |
|---|---|---|
| `SEARCH_ENABLED` | `false` | 検索機能のオン・オフ |
| `SEARCH_INDEX_PATH` | `data/search.db` | インデックスファイルの場所 |
| `SEARCH_BACKFILL_DAYS` | `730` | 初回に何日前まで遡って読み込むか |

### インデックスを作り直したいとき

GitHub上で日記を直接編集したときや、タグの設定を変えたときは、次のコマンドで作り直せます。

```powershell
cd $HOME\Documents\hangman
.venv\Scripts\activate
python -m app.reindex
```

## 7.14 投稿に自動でタグを付ける（任意）

投稿した内容をAIが読み、`運動` `買い物` のようなタグを最大3つ付けます。既定では**無効**です。

タグは日記ファイルに記録され、検索の絞り込みに使えます。

```markdown
## 21:35

朝ラン5km走った。気持ちよかった。

- Discord投稿者: tomoya
- DiscordユーザーID: 999
- DiscordメッセージID: 123456789
- タグ: #運動 #健康
- Discord投稿日時: 2026-07-26T21:35:00+09:00
```

### 設定

`.env` に追加してBotを再起動します。**AIを使うため `SUMMARY_PROVIDER` の設定が必要です**（未設定だと起動時にエラーで止まります）。

```
TAGGING_ENABLED=true
SUMMARY_PROVIDER=ollama
```

| 設定 | 既定値 | 説明 |
|---|---|---|
| `TAGGING_ENABLED` | `false` | タグ付けのオン・オフ |
| `TAG_VOCABULARY` | 下記10種 | 使うタグの一覧（カンマ区切り） |
| `TAGGING_TIMEOUT_SECONDS` | `120` | AIの応答を待つ上限（秒） |

既定のタグ: `運動` `仕事` `家族` `食事` `買い物` `健康` `趣味` `学び` `移動` `家事`

自分に合うタグへ変えられます。

```
TAG_VOCABULARY=運動,ホッケー,仕事,家族,食事,買い物,健康,趣味,学び,移動,家事,車
```

### 補足

- **タグは一覧にあるものしか付きません。** AIが勝手な言葉を返しても捨てられるので、時間が経ってもタグの意味がぶれません
- **タグ付けは保存を待たせません。** 日記はまず素早く保存され、返信もすぐ届きます。タグはそのあと裏で生成され、できあがった時点で日記ファイルへ追記されます（コミットが2つに分かれます）
- **タグが付くと、Botの返信が編集されて `タグ：#運動 #健康` の行が増えます。** 付かなかった場合は返信がそのままなので、動いたかどうかがその場で分かります
- **ローカルLLM（`ollama`）は時間がかかります。** しばらく投稿が無かったあとの1件目は**モデルをメモリに読み込む時間**が加わり、1分近くかかることがあります。ただし裏で動くので、日記の保存も返信も待たされません
- **「思考」を出力するモデル（`qwen3` / `deepseek-r1` など）は避けてください。** 答える前に長い思考文を書くため、タグに辿り着く前に出力の上限に達します。`qwen2.5:3b` のような通常のモデルを推奨します（思考文自体は読み飛ばす作りにしてありますが、途中で切れた場合は救えません）
- **うまくいかないときはログを見てください。** タグに関する行は必ず残ります

| ログの行 | 意味 | 対処 |
|---|---|---|
| `タグを追加しました: ...` | 成功 | — |
| `タグ付けがタイムアウトしました（120秒）` | モデルが重すぎる | `OLLAMA_MODEL` を軽いモデルへ |
| `AIがタグを返しませんでした` | 思考モデルが答えに到達していない | `OLLAMA_MODEL` を `qwen2.5:3b` などへ |
| `AIの回答にタグが見つかりませんでした` | 一覧にない言葉だけを返した | `TAG_VOCABULARY` を見直す |
| `タグの生成に失敗しました` | Ollamaに接続できない | Ollamaが起動しているか確認 |
- **失敗しても日記は必ず保存されます。** AIが止まっていても、タグが付かないだけです
- `TAG_VOCABULARY` を変えても、**過去の日記のタグはそのまま残ります**。付け直したい場合は日記ファイルを直接編集し、`python -m app.reindex` を実行してください

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
6. `TAGGING_ENABLED=true` にしている場合は、返信が届いたあと**しばらくして**返信が編集され、`タグ：#運動 #健康` の行が増えることを確認します（増えない場合はタグ無しで保存されています）。

---

## 9. よくあるエラー

| 症状 | 原因・対処 |
|---|---|
| Botが起動時にすぐ終了し、環境変数名が表示される | `.env` に必須項目が未設定です。表示された変数名を確認して設定してください。 |
| Botはオンラインだが `#daily` に投稿しても反応しない | Message Content Intentが無効になっていないか確認してください。また `DISCORD_GUILD_ID` / `DISCORD_DAILY_CHANNEL_ID` が実際の値と一致しているか確認してください。 |
| `❌ 保存に失敗しました / 処理段階：GitHub保存` と返信される | GitHub Tokenの権限（Contents: Read and write）やリポジトリ名・ブランチ名を確認してください。 |
| `❌ 保存に失敗しました / 処理段階：R2アップロード` と返信される | R2のAPIトークン権限や `R2_ENDPOINT_URL` の形式（`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`）を確認してください。 |
| 夜の通知に要約が付かない | 起動ログの「夜の要約: ...」の行を確認してください。`SUMMARY_PROVIDER=none` なら未設定です。ollamaの場合は `ollama list` でモデルが取得済みか、Ollamaが起動しているかを確認してください。要約の生成に失敗した場合もログにエラーが記録され、通知自体は届きます |
| まとめが作られない | 月曜または1日でないと作られません。起動ログの「週次・月次まとめを ... に確認します」を確認してください |
| まとめに文章が入らない | `SUMMARY_PROVIDER` が `none` のままです。`ollama` か `claude` を設定してください |
| 天気が記録されない | `WEATHER_LATITUDE` / `WEATHER_LONGITUDE` が両方設定されているか確認してください。取得に失敗した場合はログに警告が出ます |
| 死活監視のメールが来ない | Healthchecks.io側の Period / Grace Time の設定と、起動ログの「死活監視を有効にしました」の行を確認してください |
| `#task` に書いてもタスクにならない | `DISCORD_TASK_CHANNEL_ID` が設定されているか、Botを再起動したか確認してください |
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
│  ├─ summary_service.py  # 夜の要約（ローカルLLM / Claude API）
│  ├─ weather_service.py  # 天気の取得（Open-Meteo）
│  ├─ periodic_summary.py # 週次・月次まとめの期間計算と組み立て
│  ├─ tagging.py          # AIによる自動タグ付け
│  ├─ search_index.py     # 日記の検索インデックス（SQLite）
│  ├─ reindex.py          # 検索インデックスの作り直し（python -m app.reindex）
│  ├─ diary.py            # 日記Markdownのパーサー
│  ├─ web_app.py          # Web閲覧画面（FastAPI）
│  ├─ web_auth.py         # Web画面のログイン・セッション
│  ├─ templates/          # Web画面のHTMLテンプレート
│  └─ models.py           # 共通データ構造
├─ tests/                 # pytestによるユニットテスト
├─ deploy/
│  ├─ hearth-bot.service  # systemd用ユニット（Linuxサーバー常時稼働）
│  └─ run-bot.ps1         # Windowsタスクスケジューラ用の起動スクリプト
├─ docs/
│  ├─ web-viewer.md              # Web画面と外出先アクセス（Tailscale）
│  ├─ deploy-windows-minipc.md   # WindowsミニPCでの24時間稼働手順
│  └─ deploy-webarena-indigo.md  # WebARENA Indigoへのデプロイ手順
├─ daily/                 # GitHub上に生成される日記ファイルの置き場
├─ data/                  # 検索インデックス（ローカル専用・Gitへは入れません）
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

- Web画面からの編集・削除（閲覧専用です）
- Botが停止していた期間のまとめの遡り生成
- 動画・音声・PDF対応
- 画像のOCR・自動圧縮
- 恒久的な公開URL（一時的な署名付きURLのみ対応）
- Web管理画面・データベース

---

## 13. 次に追加できる機能

1. ~~`/image` コマンドで、R2の画像に対する一時的な署名付きURLを発行する機能~~（実装済み）
2. ~~`!task` によるGitHub Issue作成~~（実装済み）
3. ~~朝・夜の定時通知~~（実装済み）
4. ~~AIによる日記の整理・要約~~（夜の要約として実装済み）
5. ~~週次・月次のまとめ生成~~（実装済み）
6. ~~日記の全文検索~~（`/search` として実装済み）
7. ~~AIによる自動タグ付け~~（実装済み）
8. 検索結果からの日記の編集（現状Web画面は閲覧専用です）
9. 「1年前の今日」の振り返り通知
