import type { OrderExportInput } from "./exportOrderWorkbook";

function workbookFilename(input: OrderExportInput) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `AxisFrame_${input.dimensions.width}x${input.dimensions.depth}x${input.dimensions.height}_${stamp}.xlsx`;
}

export async function downloadOrderWorkbook(input: OrderExportInput) {
  const worker = new Worker(new URL("./orderWorkbook.worker.ts", import.meta.url), { type: "module", name: "axisframe-order-workbook" });
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("WORKBOOK_WORKER_TIMEOUT"));
    }, 30_000);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; buffer?: ArrayBuffer; message?: string }>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok && event.data.buffer) resolve(event.data.buffer);
      else reject(new Error(event.data.message ?? "WORKBOOK_WORKER_FAILED"));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "WORKBOOK_WORKER_FAILED"));
    };
    worker.postMessage(input);
  });
  const filename = workbookFilename(input);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return filename;
}
