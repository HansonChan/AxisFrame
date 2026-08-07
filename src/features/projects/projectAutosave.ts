import { PROJECT_SCHEMA_VERSION } from "../../domain/projects/projectSchema";
import { mergeProjects } from "./projectRepository";
import type { SavedProject } from "./projectTypes";

function availableProjectName<TSnapshot>(
  projects: readonly SavedProject<TSnapshot>[],
  preferredName: string,
) {
  const base = preferredName.trim() || "未命名项目";
  const existingNames = new Set(projects.map(({ name }) => name));
  if (!existingNames.has(base)) return base;
  let suffix = 2;
  while (existingNames.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function upsertAutosavedProject<TSnapshot>({
  projects,
  currentProjectId,
  currentProjectName,
  snapshot,
  now = new Date(),
}: {
  projects: readonly SavedProject<TSnapshot>[];
  currentProjectId: string | null;
  currentProjectName: string;
  snapshot: TSnapshot;
  now?: Date;
}) {
  const existing = projects.find(({ id }) => id === currentProjectId);
  const timestamp = now.toISOString();
  const project: SavedProject<TSnapshot> = {
    id: existing?.id ?? currentProjectId ?? `project-${now.getTime()}`,
    name: existing?.name ?? availableProjectName(projects, currentProjectName),
    version: PROJECT_SCHEMA_VERSION,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    snapshot,
  };
  return { project, projects: mergeProjects(projects, [project]) };
}
