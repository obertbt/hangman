import type { ReportVisibility } from '@/types/database.types';

/**
 * 日報を出したとき、誰に何が伝わるか（16章）。
 *
 * 公開範囲を「自分だけ」にしても、**出したことはコーチに伝わります**。
 * 提出状況が「出していない人を追いかける画面」である以上、
 * 出した人を未提出として並べるわけにはいかないためです（0023）。
 *
 * これを黙ってやるのが一番よくない。
 * 選んだその場で、何が伝わって何が伝わらないかを出す。
 *
 * ここは DB もネットワークも触らない。テストで固める。
 */

export interface Disclosure {
  /** 出したことがコーチの提出状況に出るか。 */
  factVisibleToStaff: boolean;
  /** 中身をコーチが読めるか。 */
  bodyVisibleToStaff: boolean;
  /** 中身をチームの他の選手が読めるか。 */
  bodyVisibleToTeam: boolean;
  /** コーチがコメントを書けるか。 */
  canReceiveComments: boolean;
}

export function disclosureOf(
  visibility: ReportVisibility,
  status: 'draft' | 'submitted' = 'submitted',
): Disclosure {
  // 下書きは何も伝わらない。提出して初めて外に出る。
  const submitted = status === 'submitted';

  return {
    factVisibleToStaff: submitted,
    bodyVisibleToStaff: submitted && (visibility === 'staff' || visibility === 'team'),
    bodyVisibleToTeam: submitted && visibility === 'team',
    canReceiveComments: submitted && visibility !== 'private',
  };
}

/**
 * 画面に出す一文。
 *
 * 「誰に見えるか」ではなく「何が起きるか」を書く。
 * 公開範囲の名前だけを言い換えても、選ぶ助けにならない。
 */
export function describeDisclosure(
  visibility: ReportVisibility,
  status: 'draft' | 'submitted' = 'submitted',
): string {
  if (status === 'draft') {
    return '下書きのあいだは、誰にも見えません。';
  }

  switch (visibility) {
    case 'private':
      return '中身は誰にも見せません。ただし、提出したことはコーチの提出状況に出ます（未提出として扱われないため）。コメントは付きません。';
    case 'staff':
      return 'コーチとスタッフが中身を読み、コメントを書けます。他の選手には見えません。';
    case 'team':
      return 'チームの全員が中身を読めます。コーチはコメントを書けます。';
  }
}
