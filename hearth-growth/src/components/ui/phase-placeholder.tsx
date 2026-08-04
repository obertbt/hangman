import { Card } from '@/components/ui/card';

interface PhasePlaceholderProps {
  /** 実装予定のフェーズ番号（22章） */
  phase: number;
  title: string;
  /** この画面で最終的にできるようになること */
  items: string[];
}

/**
 * Phase 0 時点の各画面に置く枠。
 * 「何がまだ無いのか」を画面上で分かるようにしておき、
 * 実装が進んだフェーズから順に本物のコンポーネントへ置き換える。
 */
export function PhasePlaceholder({ phase, title, items }: PhasePlaceholderProps) {
  return (
    <Card className="border-dashed">
      <p className="text-ember-600 text-xs font-medium">Phase {phase} で実装</p>
      <h2 className="mt-1 text-base font-medium">{title}</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-[--color-muted]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden>・</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
