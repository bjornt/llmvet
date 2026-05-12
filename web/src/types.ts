export interface Diff {
  staged: boolean;
  files: File[];
}

export interface File {
  path: string;
  old_path: string;
  status: string;
  binary?: boolean;
  hunks: Hunk[];
}

export interface Hunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: Line[];
}

export interface Line {
  type: string;
  old: number | null;
  new: number | null;
  content: string;
}
