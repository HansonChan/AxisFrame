import ExcelJS from "exceljs";
import { buildOrderData, type OrderDataInput } from "../../domain/bom/orderData";

export type OrderExportInput = OrderDataInput;
export { buildOrderData } from "../../domain/bom/orderData";

const colors = { black: "0B0B0B", dark: "1C1C1C", light: "F5F5F5", white: "FFFFFF", green: "69D449", edit: "FFF8E6" };

function setupSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.properties.defaultRowHeight = 20;
}

function title(sheet: ExcelJS.Worksheet, text: string, subtitle: string, columns: number) {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).value = text;
  sheet.getCell(1, 1).font = { name: "Arial", size: 18, bold: true, color: { argb: colors.white } };
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.black } };
  sheet.getRow(1).height = 34;
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { name: "Arial", size: 10, color: { argb: "666666" } };
}

function header(row: ExcelJS.Row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: colors.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.dark } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: colors.green } } };
  });
}

function body(sheet: ExcelJS.Worksheet, from: number, to: number, editable: number[] = []) {
  for (let rowNumber = from; rowNumber <= to; rowNumber += 1) sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, column) => {
    cell.font = { name: "Arial", size: 10, color: { argb: "202020" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable.includes(column) ? colors.edit : rowNumber % 2 === 0 ? colors.light : colors.white } };
    cell.border = { bottom: { style: "hair", color: { argb: "D8D8D8" } } };
  });
}

function tableSheet(workbook: ExcelJS.Workbook, name: string, titleText: string, subtitle: string, widths: number[], headers: string[], rows: unknown[][], editable: number[] = []) {
  const sheet = workbook.addWorksheet(name);
  setupSheet(sheet, widths);
  title(sheet, titleText, subtitle, headers.length);
  sheet.addRow([]);
  sheet.addRow(headers);
  header(sheet.getRow(4));
  rows.forEach((row) => sheet.addRow(row));
  body(sheet, 5, Math.max(5, 4 + rows.length), editable);
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  return sheet;
}

export function createOrderWorkbook(input: OrderExportInput) {
  const data = buildOrderData(input);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AxisFrame Studio";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const overview = workbook.addWorksheet("订单信息");
  setupSheet(overview, [18, 32, 18, 32, 18, 32]);
  title(overview, "AXISFRAME 定制下单资料", `${input.projectName} · 由当前 3D 模型生成`, 6);
  overview.addRow([]);
  overview.addRow(["项目名称", input.projectName, "项目尺寸", `${input.dimensions.width} × ${input.dimensions.depth} × ${input.dimensions.height} mm`, "导出时间", new Date()]);
  overview.addRow(["商家名称", "待填写", "联系人", "待填写", "联系电话", "待填写"]);
  overview.addRow(["订单编号", "待填写", "期望交期", "待填写", "收货地址", "待填写"]);
  overview.addRow(["零件总数", data.visibleParts.length, "未解决风险", input.unresolvedRiskIds.length, "计价币种", "人民币 CNY"]);
  body(overview, 4, 7, [2, 4, 6]);
  overview.getCell("F4").numFmt = "yyyy-mm-dd hh:mm";
  overview.addRow([]);
  overview.addRow(["给商家的加工要求"]);
  overview.mergeCells("A9:F9");
  header(overview.getRow(9));
  [
    "所有尺寸单位均为 mm；商家生产前须复核规格、数量、材质和表面处理。",
    "Ø10 光轴按切割明细下料，端面平整并去除毛刺；默认长度公差 ±1 mm。",
    "层板按定制尺寸加工；木纹方向沿长度方向，亚克力边缘抛光并保留保护膜。",
    "十字型连接件须适配 Ø10 mm 光轴；分体夹紧方向与紧固件规格需在生产前按组件实物复核。",
    "标记为“待确认”的风险项不得直接投产，需商家与设计方确认后再加工。",
  ].forEach((note) => { const row = overview.addRow([note]); overview.mergeCells(row.number, 1, row.number, 6); });
  body(overview, 10, 14);

  const summaryRows = data.summary.map((line, index) => {
    const row = index + 5;
    return [line.category, line.sku, line.specification, line.material, line.quantity, 0, { formula: `E${row}+F${row}`, result: line.quantity }, line.unit, 0, { formula: `IFERROR(G${row}*I${row},0)`, result: 0 }, "待填写", line.note];
  });
  const summary = tableSheet(workbook, "采购汇总", "采购汇总", "黄色单元格由下单方或商家补充；下单数量与金额由公式自动计算", [14, 20, 29, 16, 10, 11, 11, 9, 12, 14, 15, 28], ["类别", "SKU/商家货号", "规格尺寸", "材质/表面", "需求数", "建议备件", "下单数量", "单位", "未税单价", "未税金额", "商家报价号", "备注"], summaryRows, [6, 9, 11]);
  summary.getCell("I3").value = "合计金额";
  summary.getCell("J3").value = { formula: `SUM(J5:J${Math.max(5, summaryRows.length + 4)})`, result: 0 };
  [summary.getCell("I3"), summary.getCell("J3")].forEach((cell) => { cell.font = { bold: true, color: { argb: colors.white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.black } }; });
  summary.getColumn(9).numFmt = "¥#,##0.00";
  summary.getColumn(10).numFmt = "¥#,##0.00";

  tableSheet(workbook, "光轴切割明细", "光轴切割明细", "逐根下料清单；直径与长度均取自设计器光轴参数", [13, 13, 15, 16, 9, 20, 14, 30], ["零件 ID", "直径 mm", "成品长度 mm", "表面处理", "数量", "端面要求", "长度公差", "备注"], data.rods.map((rod) => [rod.id, rod.diameter, rod.length, rod.material, 1, "平切、去毛刺", "±1 mm", "加工后按零件 ID 分拣标记"]));
  tableSheet(workbook, "板材定制明细", "板材定制明细", "长、宽、厚均为成品尺寸", [13, 15, 15, 15, 17, 9, 20, 20, 15, 27], ["零件 ID", "长度 mm", "宽度 mm", "厚度 mm", "材质/纹理", "数量", "纹理/透明度", "封边/抛光", "尺寸公差", "备注"], data.panels.map((panel) => [panel.id, panel.length, panel.width, panel.thickness, panel.material, 1, panel.material.includes("亚克力") ? "透明" : "纹理沿长度方向", panel.material.includes("亚克力") ? "四边抛光" : "四边精修", "±1 mm", "生产前确认颜色实物样"]));
  tableSheet(workbook, "五金件明细", "连接五金明细", "十字型连接件与配套紧固件按零件实例列出", [13, 21, 23, 17, 9, 18, 16, 28], ["零件 ID", "SKU/参考型号", "适配规格", "表面处理", "数量", "配套紧固件", "状态", "备注"], data.hardware.map((item) => [item.id, item.sku, "Ø10 mm / 双孔正交 / 分体夹紧", item.material, 1, item.fastener, input.unresolvedRiskIds.includes(item.id) ? "待确认" : "可下单", input.unresolvedRiskIds.includes(item.id) ? "孔中心偏移未确认，暂缓生产" : ""]));
  const riskRows = input.unresolvedRiskIds.length ? input.unresolvedRiskIds.map((id, index) => [`RISK-${String(index + 1).padStart(2, "0")}`, id, "连接参数待复核", "十字型连接件孔中心偏移尚未实测", "确认连接件型号与连接位置后再投产", "待确认"]) : [["-", "-", "无未解决风险", "当前规则检查均已通过", "商家仍需进行生产可行性复核", "待商家确认"]];
  tableSheet(workbook, "风险与确认", "风险与确认", input.unresolvedRiskIds.length ? "以下项目需在生产前完成确认" : "当前模型没有未解决风险", [14, 16, 23, 36, 32, 18], ["风险 ID", "零件 ID", "风险类型", "问题说明", "建议处理", "确认结果"], riskRows, [6]);
  return workbook;
}

export async function downloadOrderWorkbook(input: OrderExportInput) {
  const buffer = await createOrderWorkbook(input).xlsx.writeBuffer();
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const filename = `AxisFrame_${input.dimensions.width}x${input.dimensions.depth}x${input.dimensions.height}_${stamp}.xlsx`;
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
