import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type BrakeCasterPrimitiveFinish = "metal" | "rubber" | "dark-metal";

export type BrakeCasterPrimitive = BooleanComponentPrimitive & {
  finish?: BrakeCasterPrimitiveFinish;
};

export const brakeCasterSpecification = {
  model: "CASTER-BRAKE-2IN-M8",
  wheelDiameter: 50,
  wheelWidth: 17,
  installationHeight: 66,
  threadDiameter: 8,
  threadLength: 20,
  overallWidth: 68,
  overallDepth: 29,
  overallHeight: 86,
} as const;

const raw = (millimeters: number) => millimeters / 10;

export function brakeCasterDimensions() {
  return {
    width: brakeCasterSpecification.overallWidth,
    length: brakeCasterSpecification.overallDepth,
    height: brakeCasterSpecification.overallHeight,
  };
}

/**
 * A dimensionally scaled procedural model based on the supplied product image.
 * The wheel, installed height, and threaded stem use the recorded dimensions;
 * the fork, swivel housing, and brake pedal are visual envelope estimates.
 */
export function createBrakeCasterDefinition() {
  const stemX = raw(8);
  const wheelX = raw(-8);
  const wheelCenterY = raw(-41);
  const threadRadiusEnvelope = raw(8.8);
  const threadStartY = 0;
  const threadEndY = raw(brakeCasterSpecification.threadLength);
  const threadCenterY = (threadStartY + threadEndY) / 2;
  const wheelDiameter = raw(brakeCasterSpecification.wheelDiameter);
  const wheelWidth = raw(brakeCasterSpecification.wheelWidth);

  const primitives: BrakeCasterPrimitive[] = [
    // Rubber wheel, steel hub, and axle. Cylinder axes run along local Z.
    { shape: "cylinder", size: [wheelDiameter, wheelWidth, wheelDiameter], position: [wheelX, wheelCenterY, 0], rotation: [90, 0, 0], finish: "rubber" },
    { shape: "cylinder", size: [raw(20), raw(21), raw(20)], position: [wheelX, wheelCenterY, 0], rotation: [90, 0, 0], finish: "metal" },
    { shape: "cylinder", size: [raw(7), raw(27), raw(7)], position: [wheelX, wheelCenterY, 0], rotation: [90, 0, 0], finish: "dark-metal" },

    // Two fork cheeks descend from the swivel housing to either side of the wheel.
    { shape: "roundedBox", size: [raw(5.5), raw(38), raw(3.5)], position: [raw(1), raw(-25), raw(-10.5)], rotation: [0, 0, -26], radius: raw(1.2), finish: "metal" },
    { shape: "roundedBox", size: [raw(5.5), raw(38), raw(3.5)], position: [raw(1), raw(-25), raw(10.5)], rotation: [0, 0, -26], radius: raw(1.2), finish: "metal" },

    // Swivel bearing housing and the upper mounting shoulder.
    { shape: "cylinder", size: [raw(29), raw(7), raw(29)], position: [stemX, raw(-4), 0], finish: "metal" },
    { shape: "cylinder", size: [raw(23), raw(5), raw(23)], position: [stemX, raw(-9.5), 0], finish: "metal" },
    { shape: "roundedBox", size: [raw(34), raw(5), raw(27)], position: [raw(5), raw(-13), 0], radius: raw(2), finish: "metal" },

    // Brake linkage and treadle.
    { shape: "roundedBox", size: [raw(31), raw(3.5), raw(18)], position: [raw(-25), raw(-14.5), 0], rotation: [0, 0, 4], radius: raw(1.5), finish: "dark-metal" },
    { shape: "roundedBox", size: [raw(22), raw(5), raw(21)], position: [raw(-34.5), raw(-15.5), 0], radius: raw(2), finish: "rubber" },
    { shape: "roundedBox", size: [raw(22), raw(2.5), raw(9)], position: [wheelX, raw(-13.5), 0], rotation: [0, 0, -8], radius: raw(1), finish: "dark-metal" },

    // M8 threaded stem and lock nut. Fine rings make the thread readable in preview.
    { shape: "cylinder", size: [raw(brakeCasterSpecification.threadDiameter), raw(brakeCasterSpecification.threadLength), raw(brakeCasterSpecification.threadDiameter)], position: [stemX, threadCenterY, 0], finish: "metal" },
    { shape: "cylinder", size: [raw(14), raw(4), raw(14)], position: [stemX, raw(2), 0], finish: "metal" },
    ...Array.from({ length: 10 }, (_, index): BrakeCasterPrimitive => ({
      shape: "cylinder",
      size: [threadRadiusEnvelope, raw(0.7), threadRadiusEnvelope],
      position: [stemX, raw(4 + index * 1.65), 0],
      finish: "metal",
    })),
  ];

  return {
    specification: brakeCasterSpecification,
    primitives,
    ports: [{
      id: "THREAD-M8",
      axis: "y" as const,
      position: [stemX, threadCenterY, 0] as [number, number, number],
      diameter: brakeCasterSpecification.threadDiameter,
      kind: "shaft-end" as const,
      behavior: "fixed" as const,
      toleranceMm: 0.25,
      capacity: 1,
    }],
  };
}
