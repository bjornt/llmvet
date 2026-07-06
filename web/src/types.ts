export interface Diff {
    staged: boolean;
    files: File[];
    untracked?: string[];
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
    section?: string;
    lines: Line[];
}

export interface Line {
    type: string;
    old: number | null;
    new: number | null;
    content: string;
}

export interface ReviewComment {
    localId: string;
    file: string;
    changeKey: string;
    line: number;
    side: "old" | "new";
    body: string;
}

export type ReviewState =
    "idle" | "submitting" | "submitted" | "approving" | "approved";

export interface ComposerState {
    file: string;
    changeKey: string;
    line: number;
    side: "old" | "new";
    editCommentId?: string;
}
