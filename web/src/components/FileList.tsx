import { useState } from 'react';
import type { File } from '../types';
import { addDelCounts } from '../transform';

interface FileListProps {
  files: File[];
  activePath: string | null;
  onFileClick: (path: string) => void;
}

function FileItem({ file, active, onHover }: { file: File; active: boolean; onHover: () => void }) {
  const { adds, dels } = addDelCounts(file);
  const isBinary = file.binary;

  return (
    <button
      onClick={() => onHover()}
      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="truncate flex-1 font-mono">{file.path}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isBinary && (
            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500">bin</span>
          )}
          {adds > 0 && (
            <span className="text-green-600 dark:text-green-400 tabular-nums">+{adds}</span>
          )}
          {dels > 0 && (
            <span className="text-red-600 dark:text-red-400 tabular-nums">-{dels}</span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function FileList({ files, activePath, onFileClick }: FileListProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <svg
          className={`h-3 w-3 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        Files ({files.length})
      </button>
      {!collapsed && (
        <div className="overflow-y-auto max-h-[calc(100vh-8rem)]">
          {files.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              active={file.path === activePath}
              onHover={() => onFileClick(file.path)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
