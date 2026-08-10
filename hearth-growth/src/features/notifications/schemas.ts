import { z } from 'zod';

/**
 * お知らせの受け取り方。
 *
 * 「静かに続ける」ためのアプリなので、種類ごとに切れるようにする。
 * 既定は3つともオンだが、うるさければ自分で止められる。
 */
export const notificationSettingsSchema = z.object({
  notifyReaction: z.boolean(),
  notifyComment: z.boolean(),
  notifyGroupJoin: z.boolean(),
});

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const NOTIFICATION_SETTING_LABELS: {
  key: keyof NotificationSettingsInput;
  label: string;
  hint: string;
}[] = [
  {
    key: 'notifyReaction',
    label: '自分の記録に応援がついたとき',
    hint: '同じ記録への応援はまとめて1件にします。',
  },
  { key: 'notifyComment', label: '自分の記録にコメントがついたとき', hint: '1件ずつお知らせします。' },
  { key: 'notifyGroupJoin', label: 'グループに新しい人が入ったとき', hint: '' },
];
