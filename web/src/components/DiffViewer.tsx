import { useRef, useMemo, useCallback } from 'react';
import { useDiff } from '../hooks/useDiff';
import { useQueryParam } from '../hooks/useQueryParams';
import { addDelCounts } from '../transform';
import DiffHeader from './DiffHeader';
import FileList from './FileList';
import FileDiff from './FileDiff';

export default function DiffViewer() {
  const [stagedStr, setStaged] = useQueryParam('staged', 'false');
  const [viewType, setViewType] = useQueryParam('view', 'unified');
  const staged = stagedStr === 'true';
  const resolvedViewType = viewType === 'split' ? 'split' : 'unified';

  const { diff, loading, error } = useDiff(staged);
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activePath, setActivePath] = useQueryParam('file', '');

  const { fileCount, addCount, delCount } = useMemo(() => {
    if (!diff) return { fileCount: 0, addCount: 0, delCount: 0 };
    let adds = 0;
    let dels = 0;
    for (const file of diff.files) {
      const c = addDelCounts(file);
      adds += c.adds;
      dels += c.dels;
    }
    return { fileCount: diff.files.length, addCount: adds, delCount: dels };
  }, [diff]);

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

  if (!diff || diff.files.length === 0) {
    return (
      <>
        <DiffHeader
          staged={staged}
          viewType={resolvedViewType}
          fileCount={0}
          addCount={0}
          delCount={0}
          onStagedChange={(s) => setStaged(String(s))}
          onViewTypeChange={setViewType}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-slate-400 dark:text-slate-500">
            No changes detected
          </div>
        </div>
      </>
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
        onStagedChange={(s) => setStaged(String(s))}
        onViewTypeChange={setViewType}
      />
      <div className="flex flex-1">
        <FileList
          files={diff.files}
          activePath={activePath || null}
          onFileClick={scrollToFile}
        />
        <main className="flex-1">
          {diff.files.map((file) => (
            <div
              key={file.path}
              ref={(el) => setFileRef(file.path, el)}
              className="border-b border-slate-200 dark:border-slate-700"
            >
              <div className="sticky top-10 z-10 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-mono">{file.path}</span>
              </div>
              <FileDiff file={file} viewType={resolvedViewType} />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
