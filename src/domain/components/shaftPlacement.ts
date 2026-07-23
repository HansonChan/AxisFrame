export type ShaftPlacementOrientation = "horizontal" | "vertical";

export type ShaftPlacementRotation = {
  rotX: number;
  rotY: number;
  rotZ: number;
};

export function shaftPlacementRotation(orientation: ShaftPlacementOrientation): ShaftPlacementRotation {
  return orientation === "vertical"
    ? { rotX: 90, rotY: 0, rotZ: 0 }
    : { rotX: 0, rotY: 0, rotZ: 0 };
}
