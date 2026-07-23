import { createOrderWorkbook, type OrderExportInput } from "./exportOrderWorkbook";

self.onmessage = async (event: MessageEvent<OrderExportInput>) => {
  try {
    const result: unknown = await createOrderWorkbook(event.data).xlsx.writeBuffer();
    const buffer = result instanceof ArrayBuffer
      ? result
      : ArrayBuffer.isView(result)
        ? new Uint8Array(result.buffer, result.byteOffset, result.byteLength).slice().buffer
        : null;
    if (!buffer) throw new Error("WORKBOOK_BUFFER_UNSUPPORTED");
    self.postMessage({ ok: true, buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
