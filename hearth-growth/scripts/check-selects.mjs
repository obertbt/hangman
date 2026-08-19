/**
 * 埋め込み select が PostgREST で解決できるかを確かめる。
 *
 * なぜ要るか。
 *
 * `profiles(...)` のような埋め込みは、行き先が2つ以上あると PostgREST が断る
 * （PGRST201）。どの道を通るかはデータベースの外部キーで決まるため、
 * **型検査でもビルドでも分からない**。実際、`post_allowed_users` が
 * activity_posts と profiles を多対多で結んでいたせいで、
 * タイムラインの問い合わせはずっと失敗していた。
 * しかもアプリ側が失敗を空配列に潰していたので、「まだ投稿がない」に見えていた。
 *
 * ここでは本物の PostgREST に同じ select を投げ、断られないことだけを見る。
 * RLS で0件が返るのは正常（見たいのは「解決できるか」だけ）。
 *
 * 使い方は supabase/tests/README.md を参照。
 *   PGRST_URL=http://127.0.0.1:3999 node scripts/check-selects.mjs
 */

const BASE_URL = process.env.PGRST_URL;

if (!BASE_URL) {
  console.error('PGRST_URL が未設定です。supabase/tests/README.md の手順を参照してください。');
  process.exit(2);
}

/**
 * アプリが実際に使っている埋め込み select。
 * 新しく埋め込みを書いたら、ここにも足すこと。
 */
const SELECTS = [
  {
    where: 'src/features/timeline/queries.ts (getTimeline)',
    table: 'activity_posts',
    select:
      'id,user_id,title,body,duration_seconds,activity_date,visibility,started_at,ended_at,created_at,' +
      'category:categories(name,icon,color),profile:profiles!user_id(display_name,avatar_url),' +
      'reactions(count),comments(count)',
  },
  {
    where: 'src/features/activities/queries.ts (listMyActivities)',
    table: 'activity_posts',
    select: '*,category:categories(id,name,icon,color),activity_photos(count)',
  },
  {
    where: 'src/features/activities/queries.ts (getActivityDetail)',
    table: 'activity_posts',
    select: '*,category:categories(id,name,icon,color)',
  },
  {
    where: 'src/features/notifications/queries.ts (listNotifications)',
    table: 'notifications',
    select:
      'id,type,actor_id,actor_count,post_id,group_id,read_at,created_at,' +
      'post:activity_posts(title,deleted_at),group:groups(name)',
  },
  {
    where: 'src/features/groups/queries.ts (listMyGroups)',
    table: 'group_members',
    select: 'role,group:groups(id,name,description,avatar_url)',
  },
  {
    where: 'src/features/groups/queries.ts (listMembers)',
    table: 'group_members',
    select: 'user_id,role,joined_at,profile:profiles(display_name,avatar_url)',
  },
  {
    where: 'src/features/comments/actions.ts (listComments)',
    table: 'comments',
    select: 'id,user_id,body,is_hidden,created_at,profile:profiles(display_name,avatar_url)',
  },
  {
    where: 'src/features/timer/queries.ts (getActiveSession)',
    table: 'activity_sessions',
    select: '*,category:categories(id,name,icon,color)',
  },
  {
    where: 'src/features/photos/queries.ts (getPhotosForPosts)',
    table: 'activity_photos',
    select: 'id,post_id,storage_path',
  },
];

let failed = 0;

for (const { where, table, select } of SELECTS) {
  const url = `${BASE_URL.replace(/\/$/, '')}/${table}?select=${encodeURIComponent(select)}&limit=1`;

  let body;
  try {
    const response = await fetch(url);
    body = await response.text();
  } catch (error) {
    console.error(`✗ ${table}  (${where})`);
    console.error(`  PostgREST へ届きませんでした: ${error instanceof Error ? error.message : error}`);
    failed += 1;
    continue;
  }

  // 解決できない埋め込みは PGRST2xx。RLS による 0件（[]）は正常。
  if (body.includes('"code":"PGRST2')) {
    const parsed = JSON.parse(body);
    console.error(`✗ ${table}  (${where})`);
    console.error(`  ${parsed.code}: ${parsed.message}`);
    if (parsed.hint) console.error(`  ヒント: ${parsed.hint}`);
    failed += 1;
    continue;
  }

  console.log(`✓ ${table}  (${where})`);
}

if (failed > 0) {
  console.error(`\n${failed} 件の埋め込み select が解決できません。`);
  process.exit(1);
}

console.log(`\n${SELECTS.length} 件すべて解決できました。`);
