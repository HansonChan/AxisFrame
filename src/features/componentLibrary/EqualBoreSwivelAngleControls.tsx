import type { EqualBoreSwivelClampAngles } from "../../domain/components/equalBoreSwivelClamp";

type Props = {
  angles: EqualBoreSwivelClampAngles;
  lang: "zh" | "en";
  compact?: boolean;
  onChange: (side: keyof EqualBoreSwivelClampAngles, angleDeg: number) => void;
};

const sides = [
  { key: "leftDeg", zh: "左侧角度", en: "LEFT HALF ANGLE" },
  { key: "rightDeg", zh: "右侧角度", en: "RIGHT HALF ANGLE" },
] as const;

export function EqualBoreSwivelAngleControls({ angles, lang, compact = false, onChange }: Props) {
  return (
    <fieldset className={`equal-bore-swivel-angle-controls${compact ? " compact" : ""}`}>
      <legend>{lang === "zh" ? "两侧独立旋转" : "INDEPENDENT HALF ROTATION"}</legend>
      {sides.map(({ key, zh, en }) => {
        const label = lang === "zh" ? zh : en;
        return (
          <label key={key}>
            <span>{label}</span>
            <input
              aria-label={label}
              type="range"
              min="-180"
              max="180"
              step="1"
              value={angles[key]}
              onChange={(event) => onChange(key, Number(event.target.value))}
            />
            <input
              aria-label={`${label}数值`}
              type="number"
              min="-180"
              max="180"
              step="1"
              value={angles[key]}
              onChange={(event) => onChange(key, Number(event.target.value))}
            />
            <em>°</em>
          </label>
        );
      })}
      <p>{lang === "zh" ? "两半保持中心线共线，绕中间圆柱配合的长度 X 轴分别扭转；孔轴与智能连接方向同步变化。" : "BOTH HALVES STAY COLLINEAR AND TWIST INDEPENDENTLY AROUND THE LONGITUDINAL X-AXIS PIVOT; BORE AND SMART-PORT DIRECTIONS UPDATE TOGETHER."}</p>
    </fieldset>
  );
}
