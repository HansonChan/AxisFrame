export const PROJECT_SCHEMA_VERSION = 2 as const;

export type ProjectBackup<TProject> = {
  schema: "axisframe-project-backup";
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  exportedAt: string;
  projects: TProject[];
};

export function createProjectBackup<TProject>(projects: TProject[], now = new Date()): ProjectBackup<TProject> {
  return {
    schema: "axisframe-project-backup",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    projects,
  };
}

export function parseProjectBackup<TProject>(
  text: string,
  isProject: (value: unknown) => value is TProject,
): ProjectBackup<TProject> {
  const parsed = JSON.parse(text) as Partial<Omit<ProjectBackup<unknown>, "schemaVersion">> & { schemaVersion?: number };
  if (parsed.schema !== "axisframe-project-backup") throw new Error("INVALID_BACKUP_SCHEMA");
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new Error("UNSUPPORTED_BACKUP_VERSION");
  if (!Array.isArray(parsed.projects) || !parsed.projects.every(isProject)) throw new Error("INVALID_PROJECT_DATA");
  return { ...parsed, schemaVersion: PROJECT_SCHEMA_VERSION } as ProjectBackup<TProject>;
}

export function downloadJsonFile(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
