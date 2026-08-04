export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="pb-8 text-center">
          <p className="text-2xl font-bold">Hearth Growth</p>
          <p className="mt-2 text-sm text-[--color-muted]">親しい人と、日々の努力を静かに積み重ねる場所。</p>
        </div>
        {children}
      </div>
    </div>
  );
}
