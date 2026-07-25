import { Box, ChevronLeft, Clock3, Download, FolderKanban, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { Lang } from "../../shared/i18n/types";
import type { SavedProject } from "./projectTypes";
import "./projects.css";

type SnapshotPartShape = {
  addedParts: unknown[];
  deletedIds: string[];
};

export function ProjectsPage<TSnapshot extends SnapshotPartShape>({
  lang,
  projects,
  builtInPartCount,
  onOpen,
  onDelete,
  onCreate,
  onExportBackup,
  onImportBackup,
  onBack,
}: {
  lang: Lang;
  projects: SavedProject<TSnapshot>[];
  builtInPartCount: number;
  onOpen: (project: SavedProject<TSnapshot>) => void;
  onDelete: (projectId: string) => void;
  onCreate: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onBack: () => void;
}) {
  const isZh = lang === "zh";
  return (
    <div className="projects-workspace">
      <header className="projects-header">
        <div>
          <span>AXISFRAME STUDIO</span>
          <h1>{isZh ? "本地项目" : "LOCAL PROJECTS"}</h1>
          <p>{isZh ? "项目以 JSON 快照保存在当前浏览器，可随时恢复继续编辑。" : "Projects are stored as JSON snapshots in this browser and can be reopened at any time."}</p>
        </div>
        <div>
          <button className="icon-button" type="button" onClick={onBack}><ChevronLeft size={16} />{isZh ? "返回设计器" : "BACK TO DESIGN"}</button>
          <button className="icon-button" type="button" onClick={onExportBackup}><Download size={16} />{isZh ? "备份全部" : "BACK UP ALL"}</button>
          <label className="icon-button projects-import-button"><FolderOpen size={16} />{isZh ? "恢复备份" : "RESTORE"}<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportBackup(file); event.target.value = ""; }} /></label>
          <button className="primary-button" type="button" onClick={onCreate}><Plus size={16} />{isZh ? "新建项目" : "NEW PROJECT"}</button>
        </div>
      </header>
      <main className="projects-main">
        <div className="projects-summary"><FolderKanban size={18} /><strong>{projects.length}</strong><span>{isZh ? "个历史项目" : "SAVED PROJECTS"}</span></div>
        {projects.length === 0 ? (
          <section className="projects-empty"><FolderOpen size={32} /><h2>{isZh ? "还没有保存的项目" : "NO SAVED PROJECTS"}</h2><p>{isZh ? "回到设计器完成第一个设计，然后点击保存并为项目命名。" : "Build your first design, then save it with a project name."}</p><button className="primary-button" type="button" onClick={onCreate}>{isZh ? "开始新项目" : "START A PROJECT"}</button></section>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <article className="project-row" key={project.id}>
                <div className="project-row-icon"><Box size={21} /></div>
                <div className="project-row-name"><h2>{project.name}</h2><small>{project.snapshot.addedParts.length + builtInPartCount - project.snapshot.deletedIds.length} {isZh ? "个组件" : "PARTS"}</small></div>
                <div className="project-row-time"><Clock3 size={14} /><span>{new Date(project.updatedAt).toLocaleString(isZh ? "zh-CN" : "en-US", { hour12: false })}</span></div>
                <button type="button" onClick={() => onOpen(project)}><FolderOpen size={15} />{isZh ? "打开" : "OPEN"}</button>
                <button className="danger" type="button" aria-label={`${isZh ? "删除" : "DELETE"} ${project.name}`} onClick={() => onDelete(project.id)}><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
