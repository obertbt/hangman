import { describe, expect, it } from 'vitest';

import {
  dateStringSchema,
  durationSecondsSchema,
  optionalText,
  timezoneSchema,
  visibilitySchema,
} from './common';

describe('visibilitySchema', () => {
  it('3種類だけを受け付ける', () => {
    expect(visibilitySchema.parse('private')).toBe('private');
    expect(visibilitySchema.parse('group')).toBe('group');
    expect(visibilitySchema.parse('selected')).toBe('selected');
    expect(visibilitySchema.safeParse('public').success).toBe(false);
  });
});

describe('durationSecondsSchema', () => {
  it('0秒から24時間まで', () => {
    expect(durationSecondsSchema.safeParse(0).success).toBe(true);
    expect(durationSecondsSchema.safeParse(86_400).success).toBe(true);
    expect(durationSecondsSchema.safeParse(86_401).success).toBe(false);
    expect(durationSecondsSchema.safeParse(-1).success).toBe(false);
    expect(durationSecondsSchema.safeParse(1.5).success).toBe(false);
  });
});

describe('dateStringSchema', () => {
  it('YYYY-MM-DD だけを通す', () => {
    expect(dateStringSchema.safeParse('2026-08-04').success).toBe(true);
    expect(dateStringSchema.safeParse('2026/08/04').success).toBe(false);
  });
});

describe('timezoneSchema', () => {
  it('実在するタイムゾーンだけを通す', () => {
    expect(timezoneSchema.safeParse('Asia/Tokyo').success).toBe(true);
    expect(timezoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('optionalText', () => {
  const schema = optionalText(10);

  it('前後の空白を落とす', () => {
    expect(schema.parse('  memo  ')).toBe('memo');
  });

  it('空文字は null にそろえる', () => {
    expect(schema.parse('   ')).toBeNull();
  });

  it('上限を超える入力を弾く', () => {
    expect(schema.safeParse('12345678901').success).toBe(false);
  });
});
