import { Box, ClipboardList, Copy, FolderKanban, PackageSearch } from "lucide-react";
import type { Lang } from "../shared/i18n/types";

export type AppPage = "design" | "parts" | "projects" | "bom";

const navItems = [
  { id: "projects", label: { en: "PROJECTS", zh: "项目" }, icon: FolderKanban },
  { id: "create", label: { en: "CREATE", zh: "创建" }, icon: Copy },
  { id: "design", label: { en: "DESIGN", zh: "设计" }, icon: Box },
  { id: "bom", label: { en: "LIST", zh: "清单" }, icon: ClipboardList },
  { id: "parts", label: { en: "PARTS", zh: "组件" }, icon: PackageSearch },
] as const;

export function AppNav({
  lang,
  activePage,
  onNavigate,
  onOpenTemplates,
}: {
  lang: Lang;
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenTemplates: () => void;
}) {
  return (
    <aside className="app-nav" aria-label="Primary navigation">
      <div className="brand-mark" title="AxisFrame">
        <img src="/assets/brand/axisframe-official-logo.png" alt="AxisFrame" />
      </div>
      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`nav-item ${item.id === activePage ? "active" : ""}`}
              key={item.label.en}
              type="button"
              onClick={() => {
                if (item.id === "design" || item.id === "parts" || item.id === "projects" || item.id === "bom") onNavigate(item.id);
                if (item.id === "create") onOpenTemplates();
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{item.label[lang]}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
