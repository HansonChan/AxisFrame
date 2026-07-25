import { useState } from "react";
import { FileJson, FolderOpen, Layers3, Trash2 } from "lucide-react";
import type { Lang } from "../../shared/i18n/types";
import { DialogFocusTrap } from "../../shared/ui/DialogFocusTrap";
import type { ProjectTemplate } from "./projectTypes";

type SnapshotPartShape = {
  addedParts: unknown[];
  deletedIds: string[];
};

function templatePreviewImage<TSnapshot>(template: ProjectTemplate<TSnapshot>) {
  return template.previewImage ?? "/assets/template-previews/blank-empty-state.png";
}

export function TemplatePickerDialog<TSnapshot extends SnapshotPartShape>({
  templates,
  builtInPartCount,
  lang,
  onClose,
  onSelect,
  onDelete,
  onImportProject,
}: {
  templates: ProjectTemplate<TSnapshot>[];
  builtInPartCount: number;
  lang: Lang;
  onClose: () => void;
  onSelect: (templateId: string) => void;
  onDelete: (templateId: string) => void;
  onImportProject: (file: File) => Promise<void>;
}) {
  const isZh = lang === "zh";
  const [importState, setImportState] = useState<"idle" | "loading" | "error">("idle");
  const handleImport = async (file: File) => {
    setImportState("loading");
    try {
      await onImportProject(file);
      setImportState("idle");
    } catch {
      setImportState("error");
    }
  };

  return (
    <div className="modal-backdrop template-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="template-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="template-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <DialogFocusTrap onEscape={onClose} />
        <header>
          <div>
            <span>{isZh ? "项目模板" : "PROJECT TEMPLATES"}</span>
            <h2 id="template-picker-title">{isZh ? "创建或导入项目" : "CREATE OR IMPORT A PROJECT"}</h2>
            <p>{isZh ? "从空白项目或模板开始，也可以导入 AxisFrame JSON 项目继续编辑。" : "Start from a blank project or template, or import an AxisFrame JSON project to continue editing."}</p>
          </div>
          <button type="button" aria-label={isZh ? "关闭模板列表" : "CLOSE TEMPLATE LIST"} onClick={onClose}>×</button>
        </header>
        <div className="template-project-import">
          <div>
            <FileJson size={19} />
            <span>
              <strong>{isZh ? "从 JSON 导入项目" : "IMPORT PROJECT FROM JSON"}</strong>
              <small>{isZh ? "支持“导出 JSON”和“备份全部”生成的文件；多项目文件会全部导入。" : "Supports files from Export JSON and Back Up All. Multi-project files import every project."}</small>
            </span>
          </div>
          <label className={`secondary-button template-project-import-button ${importState === "loading" ? "is-loading" : ""}`}>
            <FolderOpen size={15} />
            {importState === "loading" ? (isZh ? "正在导入…" : "IMPORTING…") : (isZh ? "选择 JSON 文件" : "CHOOSE JSON FILE")}
            <input
              type="file"
              accept="application/json,.json"
              aria-label={isZh ? "选择要导入的项目 JSON 文件" : "CHOOSE PROJECT JSON FILE TO IMPORT"}
              disabled={importState === "loading"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
                event.target.value = "";
              }}
            />
          </label>
          <p className={importState === "error" ? "visible" : ""} role={importState === "error" ? "alert" : undefined} aria-live="polite">
            {importState === "error"
              ? (isZh ? "导入失败：JSON 格式、项目数据或版本不受支持。" : "IMPORT FAILED: UNSUPPORTED JSON, PROJECT DATA, OR VERSION.")
              : ""}
          </p>
        </div>
        <div className="template-picker-list">
          {templates.map((template, index) => {
            const partCount = template.snapshot
              ? builtInPartCount + template.snapshot.addedParts.length - template.snapshot.deletedIds.length
              : builtInPartCount - template.deletedPartIds.length;
            return (
              <article className={template.custom ? "custom-template" : ""} data-template-id={template.id} key={template.id}>
                <div className="template-preview">
                  <img src={templatePreviewImage(template)} alt={`${template.name[lang]} ${isZh ? "3D 预览" : "3D PREVIEW"}`} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="template-identity">
                  <span>{template.custom ? (isZh ? "我的模板" : "MY TEMPLATE") : (isZh ? "结构模板" : "STRUCTURE TEMPLATE")}</span>
                  <h3>{template.name[lang]}</h3>
                  <p>{template.description[lang]}</p>
                </div>
                <dl>
                  <div><dt>{isZh ? "外形尺寸" : "DIMENSIONS"}</dt><dd>{template.dimensions.width} × {template.dimensions.depth} × {template.dimensions.height} MM</dd></div>
                  <div><dt>{isZh ? "基础组件" : "BASE PARTS"}</dt><dd>{partCount} {isZh ? "个" : "PARTS"}</dd></div>
                </dl>
                <div className="template-actions">
                  <button className="primary-button" type="button" onClick={() => onSelect(template.id)}><Layers3 size={15} />{template.id === "blank" ? (isZh ? "创建空白项目" : "CREATE BLANK PROJECT") : (isZh ? "使用模板" : "USE TEMPLATE")}</button>
                  {template.custom && <button className="danger" type="button" aria-label={`${isZh ? "删除模板" : "DELETE TEMPLATE"} ${template.name[lang]}`} onClick={() => onDelete(template.id)}><Trash2 size={14} />{isZh ? "删除" : "DELETE"}</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
