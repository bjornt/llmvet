import { useMemo } from 'react';
import { Diff, Hunk } from 'react-diff-view';
import type { HunkData } from 'react-diff-view';
import type { File } from '../types';
import { mapDiffType, mapHunk, detectLanguage, tokenizeHunks } from '../transform';

interface FileDiffProps {
  file: File;
  viewType: 'unified' | 'split';
}

export default function FileDiff({ file, viewType }: FileDiffProps) {
  const { hunks, diffType, tokens } = useMemo(() => {
    const hunks: HunkData[] = file.hunks.map(mapHunk);
    const diffType = mapDiffType(file.status);
    const language = detectLanguage(file.path);
    const tokens = language ? tokenizeHunks(hunks, language) : null;
    return { hunks, diffType, tokens };
  }, [file]);

  if (file.binary) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
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
      <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
        {label} — no changes
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Diff hunks={hunks} diffType={diffType} viewType={viewType} tokens={tokens}>
        {(hunks) =>
          hunks.map((hunk) => (
            <Hunk key={hunk.content} hunk={hunk} />
          ))
        }
      </Diff>
    </div>
  );
}
