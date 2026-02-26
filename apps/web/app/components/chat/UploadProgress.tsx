interface UploadProgressProps {
  progress: number; // 0 to 1
  fileName?: string;
  fileSize?: number;
}

export function UploadProgress({ progress }: UploadProgressProps) {
  const percentage = Math.round(progress * 100);

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
      <div className="flex flex-col items-center gap-2 p-3">
        {/* Circular progress indicator */}
        <div className="relative w-12 h-12">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            {/* Background circle */}
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted opacity-20"
            />
            {/* Progress circle */}
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${percentage}, 100`}
              className="text-primary transition-all duration-300 ease-out"
              strokeLinecap="round"
            />
          </svg>
          {/* Percentage text in center */}
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium tabular-nums">
            {percentage}%
          </span>
        </div>

        {/* Status text */}
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground max-w-[100px] truncate">
            {percentage < 100 ? 'Processing...' : 'Complete'}
          </p>
        </div>
      </div>
    </div>
  );
}
