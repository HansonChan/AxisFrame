export type EditorCommandName =
  | "edit"
  | "add-part"
  | "delete-part"
  | "transform-part"
  | "change-parameter"
  | "align"
  | "paste"
  | "duplicate"
  | "mirror"
  | "flip"
  | "rotate"
  | "organize"
  | "auto-fix";

export type SnapshotPatch<TSnapshot> = {
  kind: "replace-snapshot";
  snapshot: TSnapshot;
};

export type EditorHistoryEntry<TSnapshot> = {
  id: string;
  command: EditorCommandName;
  createdAt: number;
  patch: SnapshotPatch<TSnapshot>;
};

let sequence = 0;

/**
 * History intentionally stores a versioned snapshot patch. It is larger than a
 * field delta, but deterministic across component schema migrations and makes
 * undo/redo safe while the editor command surface is being modularised.
 */
export function createHistoryEntry<TSnapshot>(
  command: EditorCommandName,
  snapshot: TSnapshot,
  createdAt = Date.now(),
): EditorHistoryEntry<TSnapshot> {
  sequence += 1;
  return {
    id: `${createdAt}-${sequence}`,
    command,
    createdAt,
    patch: { kind: "replace-snapshot", snapshot },
  };
}

export function applySnapshotPatch<TSnapshot>(patch: SnapshotPatch<TSnapshot>): TSnapshot {
  return patch.snapshot;
}
