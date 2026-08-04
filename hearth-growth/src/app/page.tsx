import { redirect } from 'next/navigation';

/** 入り口。未ログインなら middleware が /login へ振り分ける。 */
export default function RootPage() {
  redirect('/home');
}
