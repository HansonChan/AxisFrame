import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Grid3X3, X } from "lucide-react";
import { buildComponentBoardGroups, type ComponentBoardGroup } from "../../domain/bom/componentBoard";
import type { OrderDataInput, OrderPartKind } from "../../domain/bom/orderData";
import { findDominantPreviewContentBounds } from "../../domain/graphics/previewContentBounds";
import { createPreviewContourAlpha } from "../../domain/graphics/previewContour";
import type { Lang } from "../../shared/i18n/types";
import { DialogFocusTrap } from "../../shared/ui/DialogFocusTrap";
import "./component-board.css";

const BOARD_WIDTH = 900;
const BOARD_HEIGHT = 1200;
const previewUrl = (previewId: string) => `/assets/component-previews/${previewId}.png`;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function cleanPreview(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luminance < 68 || saturation > 52) {
      pixels.data[index + 3] = 0;
      continue;
    }
    const neutral = Math.max(42, Math.min(176, Math.round(260 - luminance * 0.86)));
    pixels.data[index] = neutral;
    pixels.data[index + 1] = neutral;
    pixels.data[index + 2] = neutral;
    pixels.data[index + 3] = Math.round(Math.min(1, (luminance - 58) / 72) * 255);
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(pixels, 0, 0);
  const content = findDominantPreviewContentBounds(pixels.data, canvas.width, canvas.height);
  if (!content) return canvas;
  const horizontalPadding = Math.max(8, Math.round(content.width * 0.08));
  const verticalPadding = Math.max(8, Math.round(content.height * 0.12));
  const cropX = Math.max(0, content.x - horizontalPadding);
  const cropWidth = Math.min(canvas.width - cropX, content.width + horizontalPadding * 2);
  const naturalCropY = Math.max(0, content.y - verticalPadding);
  const naturalCropHeight = Math.min(canvas.height - naturalCropY, content.height + verticalPadding * 2);
  const minimumCropHeight = Math.min(canvas.height, Math.max(naturalCropHeight, Math.round(cropWidth * 0.2)));
  const cropCenterY = naturalCropY + naturalCropHeight / 2;
  const cropY = Math.max(0, Math.min(canvas.height - minimumCropHeight, Math.round(cropCenterY - minimumCropHeight / 2)));
  const cropped = document.createElement("canvas");
  cropped.width = cropWidth;
  cropped.height = minimumCropHeight;
  const croppedContext = cropped.getContext("2d", { willReadFrequently: true });
  croppedContext?.drawImage(canvas, cropX, cropY, cropWidth, minimumCropHeight, 0, 0, cropWidth, minimumCropHeight);
  if (croppedContext) {
    const source = croppedContext.getImageData(0, 0, cropped.width, cropped.height);
    const contourAlpha = createPreviewContourAlpha(source.data, cropped.width, cropped.height);
    const contour = croppedContext.createImageData(cropped.width, cropped.height);
    for (let pixel = 0; pixel < contourAlpha.length; pixel += 1) {
      const offset = pixel * 4;
      contour.data[offset] = 34;
      contour.data[offset + 1] = 34;
      contour.data[offset + 2] = 32;
      contour.data[offset + 3] = contourAlpha[pixel];
    }
    const contourCanvas = document.createElement("canvas");
    contourCanvas.width = cropped.width;
    contourCanvas.height = cropped.height;
    contourCanvas.getContext("2d")?.putImageData(contour, 0, 0);
    croppedContext.drawImage(contourCanvas, 0, 0);
  }
  return cropped;
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function drawFallback(context: CanvasRenderingContext2D, kind: OrderPartKind, x: number, y: number, width: number, height: number) {
  context.save();
  context.strokeStyle = "rgba(34, 34, 32, 0.54)";
  context.fillStyle = "#d8d7d2";
  context.lineWidth = Math.max(2, width * 0.012);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  if (kind === "rod") {
    context.lineCap = "round";
    context.lineWidth = Math.max(8, height * 0.08);
    context.beginPath();
    context.moveTo(x + width * 0.12, centerY);
    context.lineTo(x + width * 0.88, centerY);
    context.stroke();
  } else if (kind === "panel") {
    context.beginPath();
    context.moveTo(x + width * 0.14, y + height * 0.62);
    context.lineTo(x + width * 0.72, y + height * 0.3);
    context.lineTo(x + width * 0.88, y + height * 0.46);
    context.lineTo(x + width * 0.3, y + height * 0.78);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.fillRect(centerX - width * 0.22, centerY - height * 0.28, width * 0.44, height * 0.56);
    context.strokeRect(centerX - width * 0.22, centerY - height * 0.28, width * 0.44, height * 0.56);
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(centerX, centerY, Math.min(width, height) * 0.13, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawContainedPreview(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement | null,
  group: ComponentBoardGroup,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const copies = Math.min(group.quantity, 4);
  const offset = Math.min(width, height) * 0.035;
  for (let copy = copies - 1; copy >= 0; copy -= 1) {
    const copyX = x + copy * offset;
    const copyY = y - copy * offset;
    const copyWidth = width - (copies - 1) * offset;
    const copyHeight = height - (copies - 1) * offset;
    if (!image || image.width === 0 || image.height === 0) {
      drawFallback(context, group.kind, copyX, copyY, copyWidth, copyHeight);
      continue;
    }
    const scale = Math.min(copyWidth / image.width, copyHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.save();
    context.globalAlpha = copy === 0 ? 1 : 0.28 + (copies - copy) * 0.08;
    context.drawImage(image, copyX + (copyWidth - drawWidth) / 2, copyY + (copyHeight - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 4 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

async function renderBoard(canvas: HTMLCanvasElement, projectName: string, groups: ComponentBoardGroup[]) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  context.fillStyle = "#171716";
  context.font = "700 18px Arial, 'PingFang SC', sans-serif";
  context.letterSpacing = "3px";
  context.fillText("AXISFRAME STUDIO", 54, 64);
  context.letterSpacing = "0px";
  context.font = "800 42px Arial, 'PingFang SC', sans-serif";
  context.fillText("项目组件排布图", 54, 116);
  context.fillStyle = "#77756f";
  context.font = "500 17px Arial, 'PingFang SC', sans-serif";
  context.fillText(fitText(context, projectName, 530), 54, 150);
  const total = groups.reduce((sum, group) => sum + group.quantity, 0);
  context.textAlign = "right";
  context.fillText(`3:4 白底画布  ·  ${groups.length} 种规格  ·  ${total} 件`, 846, 150);
  context.textAlign = "left";
  context.fillStyle = "#d97757";
  context.fillRect(54, 174, 792, 4);

  if (groups.length === 0) {
    context.fillStyle = "#f5f4f0";
    drawRoundedRect(context, 54, 226, 792, 820, 20);
    context.fillStyle = "#171716";
    context.textAlign = "center";
    context.font = "800 28px Arial, 'PingFang SC', sans-serif";
    context.fillText("当前项目还没有组件", 450, 610);
    context.fillStyle = "#77756f";
    context.font = "500 18px Arial, 'PingFang SC', sans-serif";
    context.fillText("添加光轴、层板或连接件后会自动生成排布图", 450, 650);
    context.textAlign = "left";
  } else {
    const areaX = 54;
    const areaY = 206;
    const areaWidth = 792;
    const areaHeight = 902;
    const gap = groups.length > 10 ? 14 : 18;
    const editorialThree = groups.length === 3;
    const columns = groups.length > 10 ? 3 : 2;
    const rows = Math.ceil(groups.length / columns);
    const gridCellWidth = (areaWidth - gap * (columns - 1)) / columns;
    const gridCellHeight = (areaHeight - gap * (rows - 1)) / rows;
    const previewImages = await Promise.all(groups.map(async (group) => {
      const image = await loadImage(previewUrl(group.previewId));
      return image ? cleanPreview(image) : null;
    }));
    groups.forEach((group, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const lowerHeight = (areaHeight - gap) * 0.52;
      const cellWidth = editorialThree && index === 0 ? areaWidth : gridCellWidth;
      const cellHeight = editorialThree ? (index === 0 ? areaHeight - gap - lowerHeight : lowerHeight) : gridCellHeight;
      const x = editorialThree && index > 0 ? areaX + (index - 1) * (gridCellWidth + gap) : areaX + column * (gridCellWidth + gap);
      const y = editorialThree && index > 0 ? areaY + areaHeight - lowerHeight : areaY + row * (gridCellHeight + gap);
      context.fillStyle = index % 2 === 0 ? "#f7f6f2" : "#f2f1ed";
      drawRoundedRect(context, x, y, cellWidth, cellHeight, 14);
      context.fillStyle = "#d97757";
      drawRoundedRect(context, x + 14, y + 14, 34, 27, 7);
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.font = "800 14px Arial, 'PingFang SC', sans-serif";
      context.fillText(String(index + 1).padStart(2, "0"), x + 31, y + 33);
      context.textAlign = "left";
      context.fillStyle = "#171716";
      context.font = `800 ${cellHeight < 150 ? 17 : 20}px Arial, 'PingFang SC', sans-serif`;
      context.fillText(fitText(context, group.name, cellWidth - 145), x + 58, y + 35);
      context.fillStyle = "#d97757";
      context.textAlign = "right";
      context.font = `800 ${cellHeight < 150 ? 22 : 27}px Arial, 'PingFang SC', sans-serif`;
      context.fillText(`× ${group.quantity}`, x + cellWidth - 16, y + 36);
      context.textAlign = "left";
      context.fillStyle = "#55534e";
      context.font = `600 ${cellHeight < 150 ? 13 : 15}px Arial, 'PingFang SC', sans-serif`;
      context.fillText(fitText(context, group.specification, cellWidth - 30), x + 16, y + 61);
      context.fillStyle = "#8a8881";
      context.font = `500 ${cellHeight < 150 ? 11 : 12}px Arial, 'PingFang SC', sans-serif`;
      context.fillText(fitText(context, `${group.sku} · ${group.material}`, cellWidth - 30), x + 16, y + 81);
      drawContainedPreview(
        context,
        previewImages[index],
        group,
        x + 18,
        y + Math.min(89, cellHeight * 0.52),
        cellWidth - 36,
        Math.max(34, cellHeight - Math.min(98, cellHeight * 0.55) - 8),
      );
    });
  }
  context.fillStyle = "#171716";
  context.font = "700 13px Arial, 'PingFang SC', sans-serif";
  context.fillText("AXISFRAME / COMPONENT LAYOUT", 54, 1160);
  context.fillStyle = "#85837c";
  context.textAlign = "right";
  context.font = "500 13px Arial, 'PingFang SC', sans-serif";
  context.fillText("按当前项目实时汇总 · 规格单位 mm", 846, 1160);
  context.textAlign = "left";
}

function safeFilename(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, "_").slice(0, 60) || "project";
}

export function ComponentBoardDialog({ lang, input, onClose }: { lang: Lang; input: OrderDataInput; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const groups = useMemo(() => buildComponentBoardGroups(input), [input]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    Promise.resolve(document.fonts?.ready)
      .then(() => canvasRef.current && renderBoard(canvasRef.current, input.projectName, groups))
      .then(() => active && setStatus("ready"))
      .catch(() => active && setStatus("error"));
    return () => { active = false; };
  }, [groups, input.projectName]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || status !== "ready") return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `AxisFrame_${safeFilename(input.projectName)}_组件排布图.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div className="modal-backdrop component-board-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="component-board-dialog" role="dialog" aria-modal="true" aria-labelledby="component-board-title">
        <DialogFocusTrap onEscape={onClose} />
        <header>
          <div><span>{lang === "zh" ? "项目输出" : "PROJECT OUTPUT"}</span><h2 id="component-board-title">{lang === "zh" ? "组件排布图" : "COMPONENT LAYOUT"}</h2><p>{lang === "zh" ? "同规格自动编组，3:4 白底画布" : "AUTO-GROUPED SPECIFICATIONS ON A 3:4 WHITE CANVAS"}</p></div>
          <div className="component-board-actions"><button type="button" className="primary-button" disabled={status !== "ready" || groups.length === 0} onClick={download}><Download size={16} />{lang === "zh" ? "导出 PNG" : "EXPORT PNG"}</button><button type="button" aria-label={lang === "zh" ? "关闭组件排布图" : "CLOSE COMPONENT LAYOUT"} onClick={onClose}><X size={18} /></button></div>
        </header>
        <div className="component-board-stage" aria-busy={status === "loading"}>
          <canvas ref={canvasRef} width={BOARD_WIDTH} height={BOARD_HEIGHT} role="img" aria-label={`${input.projectName} ${lang === "zh" ? "组件排布图" : "component layout"}`} />
          {status === "loading" && <div className="component-board-state" role="status"><Grid3X3 size={26} /><strong>{lang === "zh" ? "正在整理组件" : "ARRANGING COMPONENTS"}</strong></div>}
          {status === "error" && <div className="component-board-state error" role="alert"><strong>{lang === "zh" ? "排布图生成失败" : "LAYOUT GENERATION FAILED"}</strong><button type="button" onClick={() => canvasRef.current && renderBoard(canvasRef.current, input.projectName, groups).then(() => setStatus("ready")).catch(() => setStatus("error"))}>{lang === "zh" ? "重试" : "RETRY"}</button></div>}
        </div>
        <footer><span>{groups.length} {lang === "zh" ? "种规格" : "SPECIFICATIONS"}</span><strong>{groups.reduce((sum, group) => sum + group.quantity, 0)} {lang === "zh" ? "件组件" : "COMPONENTS"}</strong><p>{lang === "zh" ? "数量与当前 BOM 同步；隐藏组件仍计入，已删除组件不计入。" : "QUANTITIES FOLLOW THE CURRENT BOM. HIDDEN PARTS ARE INCLUDED; DELETED PARTS ARE EXCLUDED."}</p></footer>
        <ul className="component-board-accessible-summary">{groups.map((group) => <li key={group.key}>{group.name}，{group.specification}，{group.quantity}{group.unit}</li>)}</ul>
      </section>
    </div>
  );
}
