export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="読み込み中">
      <div className="bg-keio-100 dark:bg-keio-800 h-6 w-40 animate-pulse rounded" />
      <div className="bg-keio-100 dark:bg-keio-800 h-28 animate-pulse rounded-xl" />
      <div className="bg-keio-100 dark:bg-keio-800 h-28 animate-pulse rounded-xl" />
    </div>
  );
}
