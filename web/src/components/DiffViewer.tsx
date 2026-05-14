import { useRef, useMemo, useCallback, useState } from 'react';
import { useDiff } from '../hooks/useDiff';
import { useQueryParam } from '../hooks/useQueryParams';
import { addDelCounts } from '../transform';
import { submitReview, approveReview } from '../api';
import type { ReviewComment, ReviewState, ComposerState } from '../types';
import DiffHeader from './DiffHeader';
import FileList from './FileList';
import FileDiff from './FileDiff';

export default function DiffViewer() {
  const [stagedStr, setStaged] = useQueryParam('staged', 'false');
  const [viewType, setViewType] = useQueryParam('view', 'unified');
  const [hideUntrackedStr, setHideUntracked] = useQueryParam('hide_untracked', 'false');
  const staged = stagedStr === 'true';
  const resolvedViewType = viewType === 'split' ? 'split' : 'unified';
  const hideUntracked = hideUntrackedStr === 'true';

  const { diff, loading, error, stopPolling } = useDiff(staged);

  const untrackedSet = useMemo(() => new Set(diff?.untracked ?? []), [diff]);
  const untrackedCount = untrackedSet.size;

  const visibleFiles = useMemo(() => {
    if (!diff) return [];
    if (!hideUntracked || !diff.untracked) return diff.files;
    const hide = new Set(diff.untracked);
    return diff.files.filter((f) => !hide.has(f.path));
  }, [diff, hideUntracked]);

  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activePath, setActivePath] = useQueryParam('file', '');

  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [composerState, setComposerState] = useState<ComposerState | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>('idle');

  const { fileCount, addCount, delCount } = useMemo(() => {
    const files = visibleFiles;
    if (files.length === 0) return { fileCount: 0, addCount: 0, delCount: 0 };
    let adds = 0;
    let dels = 0;
    for (const file of files) {
      const c = addDelCounts(file);
      adds += c.adds;
      dels += c.dels;
    }
    return { fileCount: files.length, addCount: adds, delCount: dels };
  }, [visibleFiles]);

  const scrollToFile = useCallback((path: string) => {
    const el = fileRefs.current.get(path);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActivePath(path);
  }, [setActivePath]);

  const setFileRef = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) {
      fileRefs.current.set(path, el);
    } else {
      fileRefs.current.delete(path);
    }
  }, []);

  const handleStartComposer = useCallback((file: string, changeKey: string, line: number, side: 'old' | 'new') => {
    setComposerState({ file, changeKey, line, side });
  }, []);

  const handleCancelComposer = useCallback(() => {
    setComposerState(null);
  }, []);

  const handleSaveComment = useCallback((file: string, changeKey: string, line: number, side: 'old' | 'new', body: string) => {
    const newComment: ReviewComment = {
      localId: crypto.randomUUID(),
      file,
      changeKey,
      line,
      side,
      body,
    };
    setComments((prev) => [...prev, newComment]);
    setComposerState(null);
  }, []);

  const handleEditComment = useCallback((localId: string, body: string) => {
    setComments((prev) => prev.map((c) => (c.localId === localId ? { ...c, body } : c)));
    setComposerState(null);
  }, []);

  const handleDeleteComment = useCallback((localId: string) => {
    setComments((prev) => prev.filter((c) => c.localId !== localId));
  }, []);

  const handleStartEdit = useCallback((comment: ReviewComment) => {
    setComposerState({
      file: comment.file,
      changeKey: comment.changeKey,
      line: comment.line,
      side: comment.side,
      editCommentId: comment.localId,
    });
  }, []);

  const handleSubmitReview = useCallback(async () => {
    setReviewState('submitting');
    stopPolling();
    try {
      const apiComments = comments.map((c) => ({
        file: c.file,
        line: c.line,
        side: c.side,
        body: c.body,
      }));
      await submitReview(apiComments);
      setReviewState('submitted');
    } catch {
      setReviewState('idle');
    }
  }, [comments, stopPolling]);

  const handleApprove = useCallback(async () => {
    if (!window.confirm('Are you sure you want to approve without changes?')) return;
    setReviewState('approving');
    stopPolling();
    try {
      await approveReview();
      setReviewState('approved');
    } catch {
      setReviewState('idle');
    }
  }, [stopPolling]);

  const commentCount = comments.length;

  const commentCountsByFile = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of comments) {
      map[c.file] = (map[c.file] || 0) + 1;
    }
    return map;
  }, [comments]);

  if (reviewState === 'submitted' || reviewState === 'approved') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {reviewState === 'submitted' ? 'Review submitted' : 'Approved'}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            You can close this tab.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-slate-400 dark:text-slate-500">Loading diff...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!diff || visibleFiles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DiffHeader
          staged={staged}
          viewType={resolvedViewType}
          fileCount={0}
          addCount={0}
          delCount={0}
          commentCount={0}
          reviewState={reviewState}
          hideUntracked={hideUntracked}
          untrackedCount={untrackedCount}
          onStagedChange={(s) => setStaged(String(s))}
          onViewTypeChange={setViewType}
          onHideUntrackedChange={(v) => setHideUntracked(String(v))}
          onSubmitReview={handleSubmitReview}
          onApprove={handleApprove}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-slate-400 dark:text-slate-500">
            No changes detected
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DiffHeader
        staged={staged}
        viewType={resolvedViewType}
        fileCount={fileCount}
        addCount={addCount}
        delCount={delCount}
        commentCount={commentCount}
        reviewState={reviewState}
        hideUntracked={hideUntracked}
        untrackedCount={untrackedCount}
        onStagedChange={(s) => setStaged(String(s))}
        onViewTypeChange={setViewType}
        onHideUntrackedChange={(v) => setHideUntracked(String(v))}
        onSubmitReview={handleSubmitReview}
        onApprove={handleApprove}
      />
      <div className="flex flex-1">
        <FileList
          files={visibleFiles}
          activePath={activePath || null}
          onFileClick={scrollToFile}
          commentCounts={commentCountsByFile}
        />
        <main className="flex-1">
          {visibleFiles.map((file) => (
            <div
              key={file.path}
              ref={(el) => setFileRef(file.path, el)}
              className="border-b border-slate-200 dark:border-slate-700"
            >
              <div className="sticky top-10 z-10 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-mono">{file.path}</span>
              </div>
              <FileDiff
                file={file}
                viewType={resolvedViewType}
                comments={comments}
                composerState={composerState}
                onStartComposer={handleStartComposer}
                onSaveComment={handleSaveComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                onCancelComposer={handleCancelComposer}
                onStartEdit={handleStartEdit}
              />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
