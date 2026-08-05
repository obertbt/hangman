import { z } from 'zod';

import { reactionTypeSchema, uuidSchema } from '@/lib/validations/common';
import type { ReactionType } from '@/types/database.types';

export const setReactionSchema = z.object({
  postId: uuidSchema,
  reactionType: reactionTypeSchema,
});

export type SetReactionInput = z.infer<typeof setReactionSchema>;

/**
 * リアクションの種類（10.1）。
 *
 * 「いいね」ではなく応援の言葉にしている。
 * 数を競わせないため、種類ごとの内訳も画面では強調しない。
 */
export const REACTION_OPTIONS: ReadonlyArray<{
  value: ReactionType;
  label: string;
  emoji: string;
}> = [
  { value: 'cheer', label: '応援', emoji: '📣' },
  { value: 'good_job', label: 'お疲れさま', emoji: '🍵' },
  { value: 'amazing', label: 'すごい', emoji: '✨' },
  { value: 'together', label: '一緒に頑張ろう', emoji: '🤝' },
  { value: 'streak', label: 'ナイス継続', emoji: '🌱' },
];

export const REACTION_LABELS: Record<ReactionType, string> = Object.fromEntries(
  REACTION_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ReactionType, string>;

export const REACTION_EMOJI: Record<ReactionType, string> = Object.fromEntries(
  REACTION_OPTIONS.map((option) => [option.value, option.emoji]),
) as Record<ReactionType, string>;
