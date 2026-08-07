import { PROJECT_SCHEMA_VERSION } from "../../domain/projects/projectSchema";
import type { SavedProject, SavedTemplate } from "./projectTypes";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const PROJECTS_STORAGE_KEY = "axisframe-projects-v1";
export const CURRENT_PROJECT_STORAGE_KEY = "axisframe-current-project-id";
export const PROJECT_DRAFT_STORAGE_KEY = "axisframe-project-v1";
export const TEMPLATES_STORAGE_KEY = "axisframe-templates-v1";
const HISTORICAL_TEMPLATES_CLEARED_KEY = "axisframe-historical-templates-cleared-v1";
const HISTORICAL_SEEDED_PROJECT_IDS = new Set([
  "project-photo-coffee-rack-v1",
  "project-stable-pegboard-stand-v2",
  "project-dahon-folding-bike-rack-v1",
  "project-coffee-machine-storage-rack-v1",
  "project-floor-coat-rack-v1",
  "project-floating-monitor-riser-v1",
]);

function browserStorage(): StorageLike {
  return window.localStorage;
}

export function sortProjects<TSnapshot>(projects: readonly SavedProject<TSnapshot>[]) {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function mergeProjects<TSnapshot>(
  current: readonly SavedProject<TSnapshot>[],
  incoming: readonly SavedProject<TSnapshot>[],
) {
  const incomingIds = new Set(incoming.map(({ id }) => id));
  return sortProjects([...incoming, ...current.filter(({ id }) => !incomingIds.has(id))]);
}

export function readSavedProjects<TSnapshot>(
  migrateSnapshot: (snapshot: TSnapshot) => TSnapshot,
  storage: StorageLike = browserStorage(),
): SavedProject<TSnapshot>[] {
  try {
    const value = storage.getItem(PROJECTS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) as SavedProject<TSnapshot>[] : [];
    const projects = (Array.isArray(parsed) ? parsed : [])
      .filter((project) =>
        (project?.version === 1 || project?.version === PROJECT_SCHEMA_VERSION)
        && Boolean(project.snapshot)
        && !HISTORICAL_SEEDED_PROJECT_IDS.has(project.id))
      .map((project) => ({ ...project, snapshot: migrateSnapshot(project.snapshot) }));
    const currentProjectId = storage.getItem(CURRENT_PROJECT_STORAGE_KEY);
    if (currentProjectId && HISTORICAL_SEEDED_PROJECT_IDS.has(currentProjectId)) {
      storage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
      storage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
    }
    storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    return projects;
  } catch {
    return [];
  }
}

export function writeSavedProjects<TSnapshot>(
  projects: readonly SavedProject<TSnapshot>[],
  storage: StorageLike = browserStorage(),
) {
  storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function readSavedTemplates<TSnapshot>(
  migrateSnapshot: (snapshot: TSnapshot) => TSnapshot,
  storage: StorageLike = browserStorage(),
): SavedTemplate<TSnapshot>[] {
  try {
    if (!storage.getItem(HISTORICAL_TEMPLATES_CLEARED_KEY)) {
      storage.removeItem(TEMPLATES_STORAGE_KEY);
      storage.setItem(HISTORICAL_TEMPLATES_CLEARED_KEY, "1");
      return [];
    }
    const value = storage.getItem(TEMPLATES_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as SavedTemplate<TSnapshot>[];
    const templates = (Array.isArray(parsed) ? parsed : [])
      .filter((template) => template?.version === 1 && Boolean(template.snapshot))
      .map((template) => ({ ...template, snapshot: migrateSnapshot(template.snapshot) }));
    storage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    return templates;
  } catch {
    return [];
  }
}

export function writeSavedTemplates<TSnapshot>(
  templates: readonly SavedTemplate<TSnapshot>[],
  storage: StorageLike = browserStorage(),
) {
  storage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export function readCurrentProjectId(storage: StorageLike = browserStorage()) {
  return storage.getItem(CURRENT_PROJECT_STORAGE_KEY);
}

export function writeCurrentProjectId(projectId: string, storage: StorageLike = browserStorage()) {
  storage.setItem(CURRENT_PROJECT_STORAGE_KEY, projectId);
}

export function clearCurrentProjectId(storage: StorageLike = browserStorage()) {
  storage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
}

export function readProjectDraft<TSnapshot>(storage: StorageLike = browserStorage()) {
  const value = storage.getItem(PROJECT_DRAFT_STORAGE_KEY);
  return value ? JSON.parse(value) as TSnapshot : null;
}

export function writeProjectDraft<TSnapshot>(snapshot: TSnapshot, storage: StorageLike = browserStorage()) {
  storage.setItem(PROJECT_DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearProjectDraft(storage: StorageLike = browserStorage()) {
  storage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
}
