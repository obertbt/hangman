# ADR-0003: データ移行の書き込みだけ service role を使う

- 状態: 採用
- 日付: 2026-08-12

## 背景

原則として、すべての書き込みは RLS の下で行いたい。
`service_role` キーは RLS を迂回するため、使う場所は最小限にすべき。

しかし選手の取り込みでは `profiles` に行を作る必要がある。
[ADR-0002](0002-profile-identity.md) の通り、`profiles` には `team_id` が無い。

## 問題

`profiles` に対して、こう書きたい。

> 「このチームの管理者だけが profiles を作れる」

しかし `profiles` の行にはチームの情報が無い。
**作ろうとしている行がどのチームのものか、ポリシーからは判断できない。**

`team_members` は後から作るので、INSERT の時点では存在しない。

## 検討した案

### (A) profiles に team_id を持たせる

人が複数チームに属する可能性を潰す。
また `team_members` と情報が重複し、食い違いの元になる。

### (B) RPC（security definer 関数）にする

SQL 関数の中で権限を確認してから INSERT する。
RLS の原則は保てるが、取り込みのロジック（照合・正規化・
`import_record_links` への記録）を PL/pgSQL で書くことになる。
TypeScript 側に既にあるロジックと二重管理になり、テストもしにくい。

### (C) 取り込みの書き込みだけ service role を使う

RLS を迂回する。その代わりアプリ側で守る。

## 判断

**(C) を採用する。** ただし次を必ず守る。

```ts
export async function executePlayerImport(...) {
  // 1. 事前に権限を確認する（RLS の代わりにここが門番になる）
  const session = await requirePermission('import.execute');

  // 2. team_id は必ずログイン中の値を入れる
  //    CSV の中に team_id があっても絶対に使わない（50章）
  await admin.from('team_members').insert({
    team_id: session.teamId,
    ...
  });

  // 3. 何をしたか監査ログに残す（63章）
  await admin.from('audit_logs').insert({ action: 'import.execute', ... });
}
```

さらに:

- `import_sessions` の作成は**通常のクライアント**（RLS 下）で行う。
  ここで `import.execute` を持たない人は弾かれるので、RLS も門番として働く
- 更新時は `.eq('team_id', session.teamId)` を必ず付け、
  別チームの行に触れないようにする
- 取り消しでは `.is('user_id', null)` を付け、
  既にログインした人を消さないようにする

## service role を使ってよい場所

**このリストに無い場所では使わない。**

| 場所                             | 理由                           |
| -------------------------------- | ------------------------------ |
| `executePlayerImport` の書き込み | 上記                           |
| `rollbackImport` の削除          | 同じ理由（作った行を消すため） |

将来 R2 の物理削除をバックグラウンドで行う場合、
そこも追加される見込み（利用者のセッションが無いため）。

## 影響

- 取り込み処理の実装ミスが、そのままチーム越えの事故になり得る。
  レビュー時は `team_id` の出どころを必ず確認すること
- `requirePermission()` の前に書き込みを置いてはいけない
- 監査ログがあるので、後から「誰が何を取り込んだか」は追える
