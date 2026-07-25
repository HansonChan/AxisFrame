import type { ProjectTemplate, SavedTemplate } from "./projectTypes";

type SnapshotPartShape = {
  dimensions: { width: number; height: number; depth: number };
  addedParts: unknown[];
  deletedIds: string[];
};

export function savedTemplateDefinition<TSnapshot extends SnapshotPartShape>(
  template: SavedTemplate<TSnapshot>,
  builtInPartCount: number,
): ProjectTemplate<TSnapshot> {
  const visiblePartCount = builtInPartCount + template.snapshot.addedParts.length - template.snapshot.deletedIds.length;
  return {
    id: template.id,
    name: { zh: template.name, en: template.name },
    description: {
      zh: `我的模板 · 保存于 ${new Date(template.updatedAt).toLocaleDateString("zh-CN")} · ${visiblePartCount} 个组件`,
      en: `MY TEMPLATE · SAVED ${new Date(template.updatedAt).toLocaleDateString("en-US")} · ${visiblePartCount} PARTS`,
    },
    dimensions: template.snapshot.dimensions,
    deletedPartIds: template.snapshot.deletedIds,
    snapshot: template.snapshot,
    custom: true,
    updatedAt: template.updatedAt,
  };
}
