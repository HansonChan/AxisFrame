import type { Lang } from "../../shared/i18n/types";

export function ShaftAxisMoveControl({
  enabled,
  lang,
  stepMm,
  onStepChange,
}: {
  enabled: boolean;
  lang: Lang;
  stepMm: number;
  onStepChange: (stepMm: number) => void;
}) {
  const isZh = lang === "zh";
  const title = enabled
    ? (isZh ? "点击光轴两端箭头，沿光轴自身轴线移动" : "USE THE SHAFT END ARROWS TO MOVE ALONG ITS OWN AXIS")
    : (isZh ? "选中光轴后可使用两端轴向箭头" : "SELECT A SHAFT TO USE ITS END ARROWS");
  return (
    <div className="pair-shaft-axis-control" role="group" aria-label={isZh ? "光轴沿连接件轴心移动" : "MOVE SHAFT ALONG CONNECTOR AXIS"} title={title}>
      <span>{isZh ? "轴向步进" : "AXIAL STEP"}</span>
      <input
        data-testid="pair-shaft-axis-step"
        type="number"
        min="0.1"
        max="6000"
        step="0.1"
        value={stepMm}
        disabled={!enabled}
        aria-label={isZh ? "光轴轴向移动步长毫米" : "SHAFT AXIAL MOVE STEP MILLIMETERS"}
        onChange={(event) => onStepChange(Math.max(0.1, Math.min(6000, Number(event.target.value) || 0.1)))}
      />
      <b>mm</b>
      <em>{enabled ? (isZh ? "点击两端箭头" : "USE END ARROWS") : (isZh ? "请选中光轴" : "SELECT SHAFT")}</em>
    </div>
  );
}
