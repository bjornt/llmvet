import { useState, useRef, useEffect } from 'react';

interface CommentComposerProps {
  initialBody?: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}

export default function CommentComposer({ initialBody = '', onSave, onCancel }: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (body.trim()) onSave(body.trim());
    }
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/50">
      <div className="px-4 py-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment…"
          rows={2}
          className="w-full resize-none rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-blue-500"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {body.trim() ? 'Ctrl+Enter to save' : ''}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={onCancel}
              className="rounded px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (body.trim()) onSave(body.trim()); }}
              disabled={!body.trim()}
              className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
