interface DiffHeaderProps {
  staged: boolean;
  viewType: 'unified' | 'split';
  fileCount: number;
  addCount: number;
  delCount: number;
  onStagedChange: (staged: boolean) => void;
  onViewTypeChange: (viewType: 'unified' | 'split') => void;
}

export default function DiffHeader({
  staged,
  viewType,
  fileCount,
  addCount,
  delCount,
  onStagedChange,
  onViewTypeChange,
}: DiffHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            llmreview
          </h1>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              onClick={() => onStagedChange(true)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                staged
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Staged
            </button>
            <button
              onClick={() => onStagedChange(false)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                !staged
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Unstaged
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-green-600 dark:text-green-400">+{addCount}</span>
            {' '}
            <span className="font-medium text-red-600 dark:text-red-400">-{delCount}</span>
            {' '}
            <span className="text-slate-400 dark:text-slate-500">
              in {fileCount} file{fileCount !== 1 ? 's' : ''}
            </span>
          </span>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              onClick={() => onViewTypeChange('unified')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewType === 'unified'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Unified
            </button>
            <button
              onClick={() => onViewTypeChange('split')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewType === 'split'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Split
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
