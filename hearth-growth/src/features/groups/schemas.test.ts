import { describe, expect, it } from 'vitest';

import {
  createGroupSchema,
  createInvitationSchema,
  invitationTokenSchema,
  normalizeInvitationToken,
  updateMemberRoleSchema,
} from './schemas';

describe('createGroupSchema', () => {
  it('名前の前後の空白を落とす', () => {
    expect(createGroupSchema.parse({ name: '  ふたりの記録  ', description: '' }).name).toBe('ふたりの記録');
  });

  it('空の名前を弾く', () => {
    expect(createGroupSchema.safeParse({ name: '   ', description: '' }).success).toBe(false);
  });

  it('50文字を超える名前を弾く', () => {
    expect(createGroupSchema.safeParse({ name: 'あ'.repeat(51), description: '' }).success).toBe(false);
  });
});

describe('createInvitationSchema', () => {
  const groupId = '00000000-0000-4000-8000-000000000001';

  it('期限と利用回数を必ず持つ', () => {
    expect(createInvitationSchema.safeParse({ groupId, expiresInDays: 7, maxUses: 10 }).success).toBe(true);
  });

  it('期限なし（0日）を許さない', () => {
    expect(createInvitationSchema.safeParse({ groupId, expiresInDays: 0, maxUses: 10 }).success).toBe(false);
  });

  it('30日を超える期限を許さない', () => {
    expect(createInvitationSchema.safeParse({ groupId, expiresInDays: 31, maxUses: 10 }).success).toBe(false);
  });

  it('無制限の利用回数を許さない', () => {
    expect(createInvitationSchema.safeParse({ groupId, expiresInDays: 7, maxUses: 0 }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ groupId, expiresInDays: 7, maxUses: 999 }).success).toBe(false);
  });

  it('グループIDが UUID でなければ弾く', () => {
    expect(createInvitationSchema.safeParse({ groupId: 'x', expiresInDays: 7, maxUses: 10 }).success).toBe(
      false,
    );
  });
});

describe('invitationTokenSchema', () => {
  it('URL-safe base64 のトークンを通す', () => {
    expect(invitationTokenSchema.safeParse('abcDEF123-_xyzabcDEF123-_xyz').success).toBe(true);
  });

  it('パス操作に使える文字を弾く', () => {
    expect(invitationTokenSchema.safeParse('../../etc/passwd').success).toBe(false);
    expect(invitationTokenSchema.safeParse('abc/def?query=1&x=2xxxxxxxxxxxxxx').success).toBe(false);
  });

  it('短すぎるトークンを弾く', () => {
    expect(invitationTokenSchema.safeParse('abc').success).toBe(false);
  });
});

/**
 * 実際に配られる招待リンクの形。
 *
 * 0011 より前のトークンは base64 の詰め物（末尾の `=`）を持っていた。
 * さらに Next.js は経路の `=` を復号せず `%3D` のまま渡す。
 * この2つが重なって、発行したリンクがすべて弾かれていた。
 */
describe('normalizeInvitationToken', () => {
  // 32byte 乱数を base64 にしたときの実際の形（末尾に詰め物が付く）
  const padded = 'm8jtSqjLUEdeDr39_Ua9z4N3jn7PL3JhBOqq4IoSISQ=';
  const bare = 'm8jtSqjLUEdeDr39_Ua9z4N3jn7PL3JhBOqq4IoSISQ';

  it('Next.js が復号せずに渡す %3D を戻して落とす', () => {
    expect(normalizeInvitationToken(`${bare}%3D`)).toBe(bare);
  });

  it('詰め物付きのトークンをそろえる', () => {
    expect(normalizeInvitationToken(padded)).toBe(bare);
  });

  it('二重に符号化されていても戻す', () => {
    expect(normalizeInvitationToken(`${bare}%253D`)).toBe(bare);
  });

  it('前後の空白を落とす', () => {
    expect(normalizeInvitationToken(`  ${padded}  `)).toBe(bare);
  });

  it('詰め物の無いトークンはそのまま', () => {
    expect(normalizeInvitationToken(bare)).toBe(bare);
  });

  it('壊れた符号化でも例外にしない', () => {
    expect(() => normalizeInvitationToken('%E0%A4%A')).not.toThrow();
  });
});

describe('実際に配られる招待リンクが通ること', () => {
  const padded = 'm8jtSqjLUEdeDr39_Ua9z4N3jn7PL3JhBOqq4IoSISQ=';
  const bare = 'm8jtSqjLUEdeDr39_Ua9z4N3jn7PL3JhBOqq4IoSISQ';

  it('%3D 付きで届いても通り、詰め物を落とした形で返る', () => {
    const result = invitationTokenSchema.safeParse(`${bare}%3D`);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(bare);
  });

  it('詰め物付きでも通る（0011 より前に配ったリンク）', () => {
    expect(invitationTokenSchema.safeParse(padded).success).toBe(true);
  });

  it('そろえたあとも、パス操作に使える文字は弾く', () => {
    expect(invitationTokenSchema.safeParse('abcDEFabcDEFabcDEF%2F%2E%2E').success).toBe(false);
    expect(invitationTokenSchema.safeParse('%2E%2E%2Fetc%2Fpasswdxxxxxxxxxx').success).toBe(false);
  });
});

describe('updateMemberRoleSchema', () => {
  const base = {
    groupId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
  };

  it('member と admin への変更を許す', () => {
    expect(updateMemberRoleSchema.safeParse({ ...base, role: 'member' }).success).toBe(true);
    expect(updateMemberRoleSchema.safeParse({ ...base, role: 'admin' }).success).toBe(true);
  });

  it('owner への変更は受け付けない', () => {
    expect(updateMemberRoleSchema.safeParse({ ...base, role: 'owner' }).success).toBe(false);
  });
});
