import { Outlines } from "@react-three/drei";
import type { BooleanComponentPrimitive } from "../../domain/components/componentBooleanGeometry";
import {
  attachImportedModelContours,
  MODEL_CONTOUR_DARK,
  MODEL_CONTOUR_DARK_OPACITY,
  MODEL_CONTOUR_LIGHT,
  MODEL_CONTOUR_LIGHT_OPACITY,
  MODEL_CONTOUR_NAME,
} from "../../domain/graphics/modelContours";

export { attachImportedModelContours };

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

export function BooleanPrimitiveContours({ primitives }: { primitives: BooleanComponentPrimitive[] }) {
  const visualAid = { axisframeVisualAid: "model-contour" };
  return (
    <group name={`${MODEL_CONTOUR_NAME}_BOOLEAN_SCAFFOLD`} userData={visualAid}>
      {primitives
        .filter(({ appearance }) => appearance !== "cutout")
        .map((primitive, index) => (
          <mesh
            key={`${primitive.shape}-${index}`}
            position={primitive.position}
            rotation={(primitive.rotation ?? [0, 0, 0]).map(degreesToRadians) as [number, number, number]}
            scale={primitive.shape === "cylinder" ? primitive.size : [1, 1, 1]}
            userData={visualAid}
            raycast={() => null}
          >
            {primitive.shape === "cylinder"
              ? <cylinderGeometry args={[0.5, 0.5, 1, 48]} />
              : <boxGeometry args={primitive.size} />}
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
            <ModelContour />
          </mesh>
        ))}
    </group>
  );
}

export function ModelContour() {
  const visualAid = { axisframeVisualAid: "model-contour" };
  return (
    <>
      <Outlines
        name={`${MODEL_CONTOUR_NAME}_LIGHT`}
        color={MODEL_CONTOUR_LIGHT}
        thickness={1.35}
        transparent
        opacity={MODEL_CONTOUR_LIGHT_OPACITY}
        toneMapped={false}
        renderOrder={3}
        userData={visualAid}
      />
      <Outlines
        name={MODEL_CONTOUR_NAME}
        color={MODEL_CONTOUR_DARK}
        thickness={0.72}
        transparent
        opacity={MODEL_CONTOUR_DARK_OPACITY}
        toneMapped={false}
        renderOrder={4}
        userData={visualAid}
      />
    </>
  );
}
