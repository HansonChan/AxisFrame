import type { Lang } from "../../shared/i18n/types";

export type SavedProject<TSnapshot> = {
  id: string;
  name: string;
  version: 1 | 2;
  createdAt: string;
  updatedAt: string;
  snapshot: TSnapshot;
};

export type SavedTemplate<TSnapshot> = {
  id: string;
  name: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
  snapshot: TSnapshot;
};

export type ProjectTemplate<TSnapshot> = {
  id: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  dimensions: { width: number; height: number; depth: number };
  deletedPartIds: string[];
  previewImage?: string;
  snapshot?: TSnapshot;
  custom?: boolean;
  updatedAt?: string;
};
