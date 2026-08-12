/**
 * 到達度のものさし（31章）。
 *
 * 数字だけだと「あと何個か」が伝わりにくいので、割合と実数の両方を出す。
 */
export function ProgressBar({
  percent,
  approved,
  total,
  label,
}: {
  percent: number;
  approved: number;
  total: number;
  label: string;
}) {
  return (
    <div>
      <div
        className="bg-keio-100 dark:bg-keio-800 h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-[--color-muted]">
        {total === 0 ? 'まだ目標が登録されていません' : `${approved} / ${total} 達成（${percent}%）`}
      </p>
    </div>
  );
}
