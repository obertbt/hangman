import { describe, expect, it } from 'vitest';

import { askQuestionSchema, createClipSchema, durationSchema, registerVideoSchema } from './schemas';

const VIDEO_ID = '44444444-0000-0000-0000-000000000001';

describe('動画の登録', () => {
  const base = {
    source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: '2026/08/10 練習試合',
    visibility: 'team' as const,
  };

  it('URL から動画IDを取り出して保存する形にする', () => {
    const result = registerVideoSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBe('dQw4w9WgXcQ');
  });

  it('短縮 URL でも通る', () => {
    const result = registerVideoSchema.safeParse({ ...base, source: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBe('dQw4w9WgXcQ');
  });

  it('YouTube でない URL は、何を貼ればよいか伝えて断る', () => {
    const result = registerVideoSchema.safeParse({ ...base, source: 'https://vimeo.com/123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('youtube.com/watch');
    }
  });

  it('タイトルは必須', () => {
    expect(registerVideoSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });

  it('撮影日は任意', () => {
    expect(registerVideoSchema.safeParse({ ...base, recorded_on: '' }).success).toBe(true);
    expect(registerVideoSchema.safeParse({ ...base, recorded_on: '2026-08-10' }).success).toBe(true);
    expect(registerVideoSchema.safeParse({ ...base, recorded_on: '2026/8/10' }).success).toBe(false);
  });
});

describe('動画の長さ（人が入力する）', () => {
  it('タイムコードでも秒でも受け取る', () => {
    expect(durationSchema.parse('1:02:03')).toBe(3723);
    expect(durationSchema.parse('60:00')).toBe(3600);
    expect(durationSchema.parse('3600')).toBe(3600);
  });

  it('空欄なら未設定（後から入れられる）', () => {
    expect(durationSchema.parse('')).toBeNull();
    expect(durationSchema.parse(undefined)).toBeNull();
  });

  it('読めない値は断る', () => {
    expect(durationSchema.safeParse('だいたい1時間').success).toBe(false);
    expect(durationSchema.safeParse('0').success).toBe(false);
  });

  it('あり得ない長さを断る', () => {
    expect(durationSchema.safeParse('20:00:00').success).toBe(false);
  });
});

describe('仮想クリップの作成（18章）', () => {
  const base = { video_id: VIDEO_ID, start: '12:34', end: '12:48' };

  it('18章の例をそのまま受け取れる', () => {
    // 12:34 = 754秒、12:48 = 768秒
    const result = createClipSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.start).toBe(12 * 60 + 34);
      expect(result.data.end).toBe(12 * 60 + 48);
    }
  });

  it('秒数で入れてもよい', () => {
    const result = createClipSchema.safeParse({ ...base, start: '754', end: '768' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.start).toBe(754);
  });

  it('終了が開始より前なら断る', () => {
    const result = createClipSchema.safeParse({ ...base, start: '12:48', end: '12:34' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('終了位置');
  });

  it('同じ位置なら断る（長さ0のクリップは作れない）', () => {
    expect(createClipSchema.safeParse({ ...base, start: '12:34', end: '12:34' }).success).toBe(false);
  });

  it('読めない位置は、書き方を伝えて断る', () => {
    const result = createClipSchema.safeParse({ ...base, start: 'だいたい12分' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('12:34');
  });

  it('動画IDが無ければ断る', () => {
    expect(createClipSchema.safeParse({ ...base, video_id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('質問の投稿（25章・26章）', () => {
  const base = {
    video_id: VIDEO_ID,
    question_type: 'judgement' as const,
    question: 'この場面、内側に運ぶべきでしたか',
    visibility: 'private_staff' as const,
  };

  it('テンプレートを選んで投稿できる', () => {
    expect(askQuestionSchema.safeParse(base).success).toBe(true);
  });

  it('26章のテンプレートをすべて受け入れる', () => {
    const types = [
      'judgement',
      'play_choice',
      'technique',
      'positioning',
      'defense_priority',
      'attack_positioning',
      'skill_application',
      'other',
    ];
    for (const question_type of types) {
      expect(askQuestionSchema.safeParse({ ...base, question_type }).success, question_type).toBe(true);
    }
  });

  it('自由記述は必須（テンプレートだけでは投げさせない）', () => {
    const result = askQuestionSchema.safeParse({ ...base, question: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('質問の内容');
  });

  it('公開範囲の既定は private_staff（29章）', () => {
    const result = askQuestionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visibility).toBe('private_staff');
  });

  it('知らない公開範囲を弾く', () => {
    expect(askQuestionSchema.safeParse({ ...base, visibility: 'public' }).success).toBe(false);
  });

  it('回答してほしいコーチは任意', () => {
    expect(askQuestionSchema.safeParse({ ...base, assigned_coach_id: '' }).success).toBe(true);
  });
});
