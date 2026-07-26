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
     - **Contents: Read and write**
     - **Metadata: Read-only**
   - （将来 `!task` 機能を追加する場合は `Issues: Read and write` も追加します）
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
| `/image` コマンドがDiscordの入力候補に出てこない | 招待URLのSCOPESに `applications.commands` が含まれていない可能性があります。READMEの手順2でチェックを入れ直した招待URLで、Botを再度招待してください（サーバーから追放する必要はありません）。その後Botを再起動し、Discordアプリも再読み込みしてください。 |
| GitHubへの書き込みで409エラーが頻発する | 同じ日付ファイルへの同時書き込みが多発している状態です。Bot内部で自動的に再試行（最大3回）しますが、それでも失敗する場合は投稿間隔を空けてください。 |

**注意:** Discord Bot Token、GitHub Token、R2のAccess Key ID / Secret Access Key / Account IDは、コード・コミット・チャット・ログのいずれにも記載しないでください。

---

## 10. Dockerでの実行（任意）

まずはローカルのPython環境での動作確認を推奨します。問題なければDockerでも実行できます。

```bash
docker build -t hearth-life .
docker run --rm --env-file .env hearth-life
```

---

## 11. プロジェクト構成

```
hearth-life/
├─ app/
│  ├─ main.py             # エントリーポイント
│  ├─ config.py           # 環境変数の読み込み・検証
│  ├─ discord_handler.py  # Discordメッセージ・/imageコマンドの処理と返信
│  ├─ github_service.py   # GitHubへのMarkdown保存
│  ├─ r2_service.py       # R2への画像アップロード・削除・署名付きURL発行
│  └─ models.py           # 共通データ構造
├─ tests/                 # pytestによるユニットテスト
├─ daily/                 # GitHub上に生成される日記ファイルの置き場
├─ .env.example
├─ .gitignore
├─ requirements.txt
├─ Dockerfile
├─ .dockerignore
└─ README.md
```

---

## 12. 現時点で実装していないもの

- AIによる分類・要約
- GitHub Issue作成（`!task` など）
- 定時通知
- 動画・音声・PDF対応
- 画像のOCR・自動圧縮
- 恒久的な公開URL（一時的な署名付きURLのみ対応）
- Web管理画面・データベース

---

## 13. 次に追加できる機能

1. ~~`/image` コマンドで、R2の画像に対する一時的な署名付きURLを発行する機能~~（実装済み）
2. `!task` によるGitHub Issue作成
3. 朝・夜の定時通知
4. AIによる日記の整理・要約
