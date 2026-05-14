import { useMemo, useCallback, useRef, useEffect } from 'react';
import { Diff, Hunk, getChangeKey, computeOldLineNumber, computeNewLineNumber } from 'react-diff-view';
import type { HunkData, ChangeData, RenderGutter } from 'react-diff-view';
import type { File, ReviewComment, ComposerState } from '../types';
import { mapDiffType, mapHunk, detectLanguage, tokenizeHunks } from '../transform';
import CommentComposer from './CommentComposer';

interface FileDiffProps {
  file: File;
  viewType: 'unified' | 'split';
  comments: ReviewComment[];
  composerState: ComposerState | null;
  onStartComposer: (file: string, changeKey: string, line: number, side: 'old' | 'new') => void;
  onSaveComment: (file: string, changeKey: string, line: number, side: 'old' | 'new', body: string) => void;
  onEditComment: (localId: string, body: string) => void;
  onDeleteComment: (localId: string) => void;
  onCancelComposer: () => void;
  onStartEdit: (comment: ReviewComment) => void;
}

export default function FileDiff({
  file,
  viewType,
  comments,
  composerState,
  onStartComposer,
  onSaveComment,
  onEditComment,
  onDeleteComment,
  onCancelComposer,
  onStartEdit,
}: FileDiffProps) {
  const { hunks, diffType, tokens } = useMemo(() => {
    const hunks: HunkData[] = file.hunks.map(mapHunk);
    const diffType = mapDiffType(file.status);
    const language = detectLanguage(file.path);
    const tokens = language ? tokenizeHunks(hunks, language) : null;
    return { hunks, diffType, tokens };
  }, [file]);

  const commentsByKey = useMemo(() => {
    const map: Record<string, ReviewComment[]> = {};
    for (const c of comments) {
      if (c.file !== file.path) continue;
      if (!map[c.changeKey]) map[c.changeKey] = [];
      map[c.changeKey].push(c);
    }
    return map;
  }, [comments, file.path]);

  const widgets = useMemo(() => {
    const w: Record<string, React.ReactNode> = {};
    for (const hunk of hunks) {
      for (const change of (hunk as HunkData).changes) {
        const key = getChangeKey(change as unknown as ChangeData);
        const lineComments = commentsByKey[key];
        const isComposing = composerState && composerState.file === file.path && composerState.changeKey === key;

        if (!lineComments && !isComposing) continue;

        w[key] = (
          <div className="max-w-[100ch] border-t border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
            {lineComments?.map((c) => (
              <div key={c.localId} className="border-b border-slate-100 px-4 py-2 last:border-b-0 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 text-xs text-slate-700 dark:text-slate-300">
                    <span className="mb-0.5 block font-medium text-slate-500 dark:text-slate-400">
                      {c.side === 'new' ? 'Added line' : 'Removed line'} {c.line}
                    </span>
                    <span className="whitespace-pre-wrap">{c.body}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => onStartEdit(c)}
                       className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                      title="Edit"
                    >
                      &#9998;
                    </button>
                    <button
                      onClick={() => onDeleteComment(c.localId)}
                       className="text-xs text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
                      title="Delete"
                    >
                      &#10005;
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {isComposing && (
              <CommentComposer
                initialBody={
                  composerState.editCommentId
                    ? lineComments?.find((lc) => lc.localId === composerState.editCommentId)?.body ?? ''
                    : ''
                }
                onSave={(body) => {
                  if (composerState.editCommentId) {
                    onEditComment(composerState.editCommentId, body);
                  } else {
                    onSaveComment(file.path, key, composerState.line, composerState.side, body);
                  }
                }}
                onCancel={onCancelComposer}
              />
            )}
          </div>
        );
      }
    }
    return w;
  }, [hunks, commentsByKey, composerState, file.path, onStartComposer, onSaveComment, onEditComment, onDeleteComment, onCancelComposer, onStartEdit]);

  const renderGutter: RenderGutter = useCallback(
    ({ change, side, inHoverState, renderDefault, wrapInAnchor }) => {
      const oldLine = computeOldLineNumber(change);
      const newLine = computeNewLineNumber(change);
      const hasLine = oldLine !== -1 || newLine !== -1;
      const currentLine = side === 'old' ? oldLine : newLine;
      const hasCurrentLine = currentLine !== -1;

      const commentLine = hasCurrentLine ? currentLine : (oldLine !== -1 ? oldLine : newLine);
      const commentSide = hasCurrentLine ? (side as 'old' | 'new') : (oldLine !== -1 ? 'old' : 'new');

      const defaultContent = renderDefault();
      const startComment = () => onStartComposer(file.path, getChangeKey(change), commentLine, commentSide);

      const showButton = inHoverState && hasLine && side === 'new';

      return wrapInAnchor(
        <span
          className={'relative flex items-center px-2 w-full min-h-[1.25rem]' + (hasLine ? ' cursor-pointer' : '')}
          onClick={hasLine ? startComment : undefined}
          role={hasLine ? 'button' : undefined}
          tabIndex={hasLine ? 0 : undefined}
          onKeyDown={hasLine ? (e) => { if (e.key === 'Enter') startComment(); } : undefined}>
          {showButton && (
            <button
              onClick={(e) => { e.stopPropagation(); startComment(); }}
              className="absolute left-0 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-bold leading-none cursor-pointer z-10"
              title="Add comment"
            >
              +
            </button>
          )}
          <span className={'pl-3' + (inHoverState && hasCurrentLine ? ' opacity-50' : '')}>
            {defaultContent}
          </span>
        </span>,
      );
    },
    [file.path, onStartComposer],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const onStartComposerRef = useRef(onStartComposer);
  onStartComposerRef.current = onStartComposer;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement).closest('.diff-gutter-omit, .diff-code-omit');
      if (!cell) return;

      const row = (cell as HTMLElement).closest('tr');
      if (!row) return;

      const keyCell = row.querySelector<HTMLElement>('[data-change-key]');
      if (!keyCell?.dataset.changeKey) return;

      const cells = Array.from(row.children);
      const side: 'old' | 'new' = cells.indexOf(keyCell) < 2 ? 'old' : 'new';
      const lineText = keyCell.textContent?.trim();
      const line = lineText ? parseInt(lineText, 10) : 0;

      onStartComposerRef.current(file.path, keyCell.dataset.changeKey, line, side);
    };

    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [file.path]);

  if (file.binary) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Binary file: <span className="font-mono">{file.path}</span>
      </div>
    );
  }

  if (hunks.length === 0) {
    const label =
      file.status === 'renamed' || file.status === 'copied'
        ? `${file.old_path} → ${file.path}`
        : file.path;

    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {label} — no changes
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <Diff
        hunks={hunks}
        diffType={diffType}
        viewType={viewType}
        tokens={tokens}
        widgets={widgets}
        renderGutter={renderGutter}
      >
        {(hunks) =>
          hunks.map((hunk) => (
            <Hunk key={hunk.content} hunk={hunk} />
          ))
        }
      </Diff>
    </div>
  );
}
