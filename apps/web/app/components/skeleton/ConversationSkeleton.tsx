export function ConversationSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-1 rounded-xl px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>

          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}
