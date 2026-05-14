import type { ReviewState } from '../types';

interface DiffHeaderProps {
  staged: boolean;
  viewType: 'unified' | 'split';
  fileCount: number;
  addCount: number;
  delCount: number;
  commentCount: number;
  reviewState: ReviewState;
  hideUntracked: boolean;
  untrackedCount: number;
  onStagedChange: (staged: boolean) => void;
  onViewTypeChange: (viewType: 'unified' | 'split') => void;
  onHideUntrackedChange: (hide: boolean) => void;
  onSubmitReview: () => void;
  onApprove: () => void;
}

export default function DiffHeader({
  staged,
  viewType,
  fileCount,
  addCount,
  delCount,
  commentCount,
  reviewState,
  hideUntracked,
  untrackedCount,
  onStagedChange,
  onViewTypeChange,
  onHideUntrackedChange,
  onSubmitReview,
  onApprove,
}: DiffHeaderProps) {
  const isBusy = reviewState === 'submitting' || reviewState === 'approving';

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            llmvet
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
          {!staged && untrackedCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideUntracked}
                onChange={(e) => onHideUntrackedChange(e.target.checked)}
                className="rounded border-slate-300 text-blue-500 focus:ring-blue-400 dark:border-slate-600"
              />
              hide untracked ({untrackedCount})
            </label>
          )}
        </div>

        <div className="flex items-center gap-4">
          {commentCount > 0 && (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {commentCount} comment{commentCount !== 1 ? 's' : ''}
            </span>
          )}

          <span className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-green-600 dark:text-green-400">+{addCount}</span>
            {' '}
            <span className="font-medium text-red-600 dark:text-red-400">-{delCount}</span>
            {' '}
            <span className="text-slate-400 dark:text-slate-500">
              in {fileCount} file{fileCount !== 1 ? 's' : ''}
            </span>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onSubmitReview}
              disabled={commentCount === 0 || isBusy}
              className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reviewState === 'submitting' ? 'Submitting\u2026' : 'Submit Review'}
            </button>
            <button
              onClick={onApprove}
              disabled={isBusy}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {reviewState === 'approving' ? 'Approving\u2026' : 'Approve Without Changes'}
            </button>
          </div>

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
