# 主な流れ

## 1. ログイン

```mermaid
sequenceDiagram
  participant U as 利用者
  participant P as proxy.ts
  participant A as Supabase Auth
  participant S as 画面

  U->>P: /today を開く
  P->>A: getUser()（Cookie を検証）
  alt 未ログイン
    P-->>U: /login?next=/today へ送る
    U->>S: メールとパスワードを入力
    S->>A: signInWithPassword()
    alt 失敗
      A-->>S: エラー
      S-->>U: 日本語の理由を表示<br/>（登録の有無は漏らさない）
    end
    A-->>S: セッション Cookie
    S-->>U: /today へ
  else ログイン済み
    P->>S: そのまま通す
    S->>S: getAppSession()<br/>profile と所属と権限を1回だけ引く
    S-->>U: 今日の画面
  end
```

`getSession()` は Cookie の中身をそのまま信じるため、サーバー側では使いません。
必ず `getUser()` の結果を使います。

## 2. 1日の流れ

システムの中心です。選手が「今日何をすればいいか」で迷わないようにします。

```mermaid
flowchart TD
  login["ログイン"] --> today["今日のダッシュボード"]
  today --> phase{"今どの段階？"}

  phase -->|"練習前"| before["・今週のテーマを見る<br/>・今日の練習内容を見る<br/>・個人目標を決める<br/>・コンディションを入力"]
  phase -->|"練習中"| during["・未入力のコンディションがあれば促す"]
  phase -->|"練習後"| after["・日報を提出する<br/>・トレーニング結果を入力する<br/>・フィードバックを確認する"]
  phase -->|"予定なし"| none["・新着フィードバックだけ"]

  before --> practice["練習・試合"]
  practice --> after
  after --> question["見てもらいたい場面があれば<br/>動画で質問"]
  question --> feedback["コーチの回答"]
  feedback --> next["次回の個人課題"]
  next --> today

  style today fill:#ffd,stroke:#883
  style next fill:#dfd,stroke:#383
```

段階の判定は `src/features/dashboard/lib/pending-actions.ts` にあります。

- 練習前に日報を求めない
- オフやミーティングの日には記録を求めない
- 時刻が入っていないイベントは「練習前」として扱う（入力を妨げない）
- 全部終わったら「今日やることは全部終わりました」と伝える

## 3. 動画フィードバック

```mermaid
stateDiagram-v2
  [*] --> draft: 下書き
  draft --> submitted: 提出
  draft --> withdrawn: 取り下げ
  submitted --> assigned: 担当決定
  submitted --> reviewing: 確認中
  submitted --> withdrawn
  assigned --> reviewing
  assigned --> answered: 回答済み
  assigned --> withdrawn
  reviewing --> answered
  reviewing --> assigned
  reviewing --> withdrawn
  answered --> acknowledged: 選手が確認
  answered --> follow_up: 再質問あり
  answered --> closed: 完了
  acknowledged --> follow_up
  acknowledged --> closed
  follow_up --> reviewing
  follow_up --> answered
  follow_up --> closed
  closed --> [*]
  withdrawn --> [*]
```

**この図にない遷移はデータベースが拒否します。**
`app.guard_feedback_status()` トリガが、
不正な遷移で例外を投げ、正しい遷移では履歴を自動的に残します。

### 質問から次回課題まで

```mermaid
sequenceDiagram
  participant P as 選手
  participant C as コーチ
  participant S as システム

  P->>S: 動画を選ぶ（YouTube の場面 or 短編動画）
  P->>S: 質問（テンプレート or 自由記述）
  P->>S: 関連スキル・公開範囲・回答してほしいコーチ
  S->>S: status = submitted（公開範囲は private_staff）
  S->>C: 通知「新しい質問があります」

  C->>S: 担当を引き受ける（assigned）
  C->>S: 構造化して回答
  Note over C,S: 結論 / 良かった点 / 改善点 /<br/>推奨プレー / 技術的修正 / 次回課題 /<br/>関連スキル / 参考動画
  S->>S: status = answered
  S->>P: 通知「回答が来ました」

  P->>S: 確認（acknowledged）
  S->>S: next_task を次回の個人目標へ

  opt チームに共有したい
    C->>S: 共有を提案
    S->>P: 承認をお願いする通知
    P->>S: 承認
    S->>S: visibility = team
  end
```

**コーチが一方的にチーム公開へ変えることはできません。**
必ず選手の承認を経ます。

回答は**上書きしません**。`feedback_responses` に追記していきます。
3日以上回答が無いものはコーチのダッシュボードに出ます。

## 4. スキル承認

```mermaid
stateDiagram-v2
  [*] --> not_started: 未着手
  not_started --> applied: 申請中
  applied --> feedback: フィードバック中
  applied --> approved: 承認済
  feedback --> applied: 再申請
  feedback --> approved
  approved --> [*]
```

```mermaid
flowchart TD
  skill["スキル階層<br/>大分類 → 中目標 → 小目標"] --> pick["選手が小目標を選ぶ"]
  pick --> evidence["根拠を添える"]
  evidence --> e1["YouTube 仮想クリップ"]
  evidence --> e2["R2 短編動画"]
  evidence --> e3["回答済みフィードバック"]
  evidence --> e4["日報の添付"]
  e1 --> apply["申請"]
  e2 --> apply
  e3 --> apply
  e4 --> apply
  apply --> review{"コーチが審査"}
  review -->|"承認"| approved["player_skills = approved<br/>履歴に残す"]
  review -->|"もう少し"| more["needs_more<br/>何が足りないかを伝える"]
  review -->|"却下"| rejected["rejected"]
  more --> evidence
```

コーチの回答から `related_skill_id` を指定できるので、
「この動画をスキル申請に使えますか」という質問から
そのまま申請につなげられます。

## 5. データ移行

[docs/import.md](import.md) を参照してください。

## 6. ファイルの一生

[docs/storage.md](storage.md) を参照してください。

## 7. 卒業・退部（61章）

```mermaid
flowchart LR
  active["在籍中<br/>status = active"] --> grad["卒業<br/>status = graduated"]
  active --> leave["退部<br/>status = inactive"]
  active --> rest["休部<br/>status = leave"]
  rest --> active

  grad --> keep["ログイン停止<br/>プロフィールは保管<br/>過去記録はそのまま"]
  leave --> keep
```

**利用者の削除と過去記録の削除を直接つなげません。**
日報もフィードバックもスキル履歴も、その人が積み上げたものとして残します。
名簿では既定で在籍中だけを表示し、「卒業・退部も含めて表示」で切り替えます。
