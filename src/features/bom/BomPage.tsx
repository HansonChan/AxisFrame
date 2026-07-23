import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Box, ClipboardList, Download, Focus, Search, TriangleAlert } from "lucide-react";
import { buildOrderData, type OrderDataInput } from "../../domain/bom/orderData";

type Lang = "zh" | "en";
type BomTab = "summary" | "rods" | "panels" | "hardware";

export function BomPage({
  lang,
  input,
  issueCount,
  focusPartIds,
  onBack,
  onLocate,
  onExport,
  exporting,
}: {
  lang: Lang;
  input: OrderDataInput;
  issueCount: number;
  focusPartIds?: string[];
  onBack: () => void;
  onLocate: (partIds: string[]) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const [tab, setTab] = useState<BomTab>("summary");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (focusPartIds?.[0]) {
      setTab("summary");
      setQuery(focusPartIds[0]);
    }
  }, [focusPartIds]);
  const data = useMemo(() => buildOrderData(input), [input]);
  const normalizedQuery = query.trim().toLowerCase();
  const tabs: Array<{ id: BomTab; zh: string; en: string; count: number }> = [
    { id: "summary", zh: "采购汇总", en: "PROCUREMENT", count: data.summary.length },
    { id: "rods", zh: "光轴切割", en: "SHAFT CUTS", count: data.rods.length },
    { id: "panels", zh: "板材定制", en: "PANELS", count: data.panels.length },
    { id: "hardware", zh: "连接五金", en: "HARDWARE", count: data.hardware.length },
  ];
  const includesQuery = (...values: Array<string | number>) => !normalizedQuery
    || values.join(" ").toLowerCase().includes(normalizedQuery);

  return (
    <main className="bom-page" aria-labelledby="bom-page-title">
      <header className="bom-page-header">
        <button type="button" className="library-back" onClick={onBack}><ArrowLeft size={16} />{lang === "zh" ? "返回设计" : "BACK TO DESIGN"}</button>
        <div>
          <span>{lang === "zh" ? "制造数据" : "MANUFACTURING DATA"}</span>
          <h1 id="bom-page-title">{lang === "zh" ? "清单" : "BILL OF MATERIALS"}</h1>
          <p>{input.projectName} · {input.dimensions.width} × {input.dimensions.depth} × {input.dimensions.height} MM</p>
        </div>
        <button className="primary-button" type="button" onClick={onExport} disabled={exporting}><Download size={16} />{exporting ? (lang === "zh" ? "导出中" : "EXPORTING") : (lang === "zh" ? "导出订单" : "EXPORT ORDER")}</button>
      </header>

      <section className="bom-kpis" aria-label={lang === "zh" ? "清单摘要" : "BOM SUMMARY"}>
        <div><ClipboardList size={18} /><span>{lang === "zh" ? "零件总数" : "TOTAL PARTS"}</span><strong>{data.visibleParts.length}</strong></div>
        <div><Box size={18} /><span>{lang === "zh" ? "汇总条目" : "GROUPED LINES"}</span><strong>{data.summary.length}</strong></div>
        <div className={issueCount > 0 ? "warning" : ""}><TriangleAlert size={18} /><span>{lang === "zh" ? "结构问题" : "STRUCTURAL ISSUES"}</span><strong>{issueCount}</strong></div>
      </section>

      <div className="bom-toolbar">
        <div className="bom-tabs" role="tablist" aria-label={lang === "zh" ? "清单分类" : "BOM CATEGORIES"}>
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{lang === "zh" ? item.zh : item.en}<span>{item.count}</span></button>)}
        </div>
        <label className="bom-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "zh" ? "搜索 SKU、规格或零件 ID" : "SEARCH SKU, SPECS, OR PART ID"} /></label>
      </div>

      <section className="bom-table-wrap" aria-live="polite">
        {tab === "summary" && (
          <table className="bom-table">
            <thead><tr><th>{lang === "zh" ? "类别 / SKU" : "CATEGORY / SKU"}</th><th>{lang === "zh" ? "规格" : "SPECIFICATION"}</th><th>{lang === "zh" ? "材质" : "MATERIAL"}</th><th>{lang === "zh" ? "数量" : "QTY"}</th><th>{lang === "zh" ? "单价" : "UNIT PRICE"}</th><th>{lang === "zh" ? "来源 / 库存" : "SOURCE / STOCK"}</th><th>{lang === "zh" ? "关联零件" : "TRACE"}</th></tr></thead>
            <tbody>
              {data.summary.filter((line) => includesQuery(line.category, line.sku, line.specification, line.material, ...line.partIds)).map((line) => (
                <tr key={`${line.category}-${line.sku}-${line.specification}`}>
                  <td><span>{line.category}</span><strong>{line.sku}</strong></td>
                  <td>{line.specification}</td><td>{line.material}</td><td><strong>{line.quantity}</strong> {line.unit}</td>
                  <td><span className="bom-pending">{lang === "zh" ? "待供应商录入" : "PENDING"}</span></td>
                  <td><span>{line.source}</span><strong className={`inventory-${line.inventoryStatus}`}>{line.inventoryStatus === "ready" ? (lang === "zh" ? "可下单" : "READY") : line.inventoryStatus === "custom" ? (lang === "zh" ? "定制加工" : "CUSTOM") : (lang === "zh" ? "待复核" : "REVIEW")}</strong></td>
                  <td><button type="button" onClick={() => onLocate(line.partIds)}><Focus size={14} />{line.partIds.length} {lang === "zh" ? "个零件" : "PARTS"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "rods" && <DetailTable headers={lang === "zh" ? ["零件 ID", "直径", "成品长度", "材质", "定位"] : ["PART ID", "DIAMETER", "CUT LENGTH", "MATERIAL", "LOCATE"]} rows={data.rods.filter((line) => includesQuery(line.id, line.diameter, line.length, line.material)).map((line) => [line.id, `Ø${line.diameter} mm`, `${line.length} mm`, line.material, <LocateButton key={line.id} lang={lang} onClick={() => onLocate([line.id])} />])} />}
        {tab === "panels" && <DetailTable headers={lang === "zh" ? ["零件 ID", "长 × 宽 × 厚", "材质", "加工", "定位"] : ["PART ID", "L × W × T", "MATERIAL", "PROCESS", "LOCATE"]} rows={data.panels.filter((line) => includesQuery(line.id, line.length, line.width, line.thickness, line.material)).map((line) => [line.id, `${line.length} × ${line.width} × ${line.thickness} mm`, line.material, line.material.includes("亚克力") ? (lang === "zh" ? "四边抛光" : "EDGE POLISH") : (lang === "zh" ? "四边精修" : "EDGE FINISH"), <LocateButton key={line.id} lang={lang} onClick={() => onLocate([line.id])} />])} />}
        {tab === "hardware" && <DetailTable headers={lang === "zh" ? ["零件 ID", "SKU", "材质", "来源", "定位"] : ["PART ID", "SKU", "MATERIAL", "SOURCE", "LOCATE"]} rows={data.hardware.filter((line) => includesQuery(line.id, line.sku, line.material, line.source)).map((line) => [line.id, line.sku, line.material, line.source, <LocateButton key={line.id} lang={lang} onClick={() => onLocate([line.id])} />])} />}
        {data.visibleParts.length === 0 && <div className="bom-empty"><ClipboardList size={28} /><strong>{lang === "zh" ? "当前设计还没有零件" : "NO PARTS IN THIS DESIGN"}</strong><p>{lang === "zh" ? "返回设计器添加组件后，清单会自动重算。" : "ADD COMPONENTS IN THE DESIGNER AND THE LIST WILL RECALCULATE AUTOMATICALLY."}</p></div>}
      </section>
    </main>
  );
}

function LocateButton({ lang, onClick }: { lang: Lang; onClick: () => void }) {
  return <button type="button" className="bom-locate" onClick={onClick}><Focus size={14} />{lang === "zh" ? "定位" : "LOCATE"}</button>;
}

function DetailTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return <table className="bom-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
}
