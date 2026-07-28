import { Billboard, Html, Line, TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { normalizeRotation360, ROTATION_DIAL_INCREMENT_DEG, snapRotationNearIncrement } from "../../domain/geometry/rotationSnap";
import {
  clampRotationDialWorldRadius,
  ROTATION_DIAL_MAX_VIEWPORT_FRACTION,
  rotationDialEnvelopeDiameterPixels,
} from "../../domain/geometry/rotationDialViewport";
import "./precision-rotation-dial.css";

export type PrecisionRotationAxis = "x" | "y" | "z";

type PrecisionTransformControlsProps = {
  object: THREE.Object3D;
  mode: "translate" | "rotate" | "scale";
  size: number;
  scaleSnap?: number;
  dialRadius?: number;
  onMouseDown?: () => void;
  onObjectChange?: () => void;
  onMouseUp?: () => void;
  onRotationPreview?: (message: string) => void;
};

type TransformControlsApi = {
  axis?: string | null;
  getHelper?: () => THREE.Object3D;
};

const axisColor = {
  x: "#ff625f",
  y: "#64c956",
  z: "#4f8cff",
} as const satisfies Record<PrecisionRotationAxis, string>;

const eulerKey = {
  x: "x",
  y: "y",
  z: "z",
} as const satisfies Record<PrecisionRotationAxis, keyof THREE.Euler>;

function selectedAxis(value?: string | null): PrecisionRotationAxis | null {
  const axis = value?.toLowerCase();
  return axis === "x" || axis === "y" || axis === "z" ? axis : null;
}

function screenPixelsPerWorldUnit(
  center: THREE.Vector3,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
) {
  const projectedCenter = center.clone().project(camera);
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const projectedUnit = center.clone().add(cameraRight).project(camera);
  return Math.hypot(
    (projectedUnit.x - projectedCenter.x) * viewport.width / 2,
    (projectedUnit.y - projectedCenter.y) * viewport.height / 2,
  );
}

function dialMetrics(
  object: THREE.Object3D,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  explicitRadius?: number,
) {
  const center = object.getWorldPosition(new THREE.Vector3());
  let desiredRadius = explicitRadius;
  if (!desiredRadius) {
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) desiredRadius = 1.35;
    else {
      bounds.getCenter(center);
      const size = bounds.getSize(new THREE.Vector3());
      desiredRadius = THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) / 2 + 0.48, 1.2, 4.2);
    }
  }
  const pixelsPerWorldUnit = screenPixelsPerWorldUnit(center, camera, viewport);
  const radius = clampRotationDialWorldRadius({
    desiredRadius,
    pixelsPerWorldUnit,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
  return {
    center,
    radius,
    envelopeDiameterPx: rotationDialEnvelopeDiameterPixels(radius, pixelsPerWorldUnit),
    viewportLimitPx: Math.min(viewport.width, viewport.height) * ROTATION_DIAL_MAX_VIEWPORT_FRACTION,
  };
}

function RotationDial({
  axis,
  angleDeg,
  radius,
  center,
  snapped,
}: {
  axis: PrecisionRotationAxis;
  angleDeg: number;
  radius: number;
  center: THREE.Vector3;
  snapped: boolean;
}) {
  const ticks = useMemo(() => {
    const values: number[] = [];
    for (let degree = 0; degree < 360; degree += ROTATION_DIAL_INCREMENT_DEG) {
      const radians = THREE.MathUtils.degToRad(degree);
      const major = degree % 45 === 0;
      const medium = !major && degree % 15 === 0;
      const length = major ? radius * 0.12 : medium ? radius * 0.075 : radius * 0.045;
      const inner = radius - length;
      values.push(
        Math.cos(radians) * inner,
        Math.sin(radians) * inner,
        0,
        Math.cos(radians) * radius,
        Math.sin(radians) * radius,
        0,
      );
    }
    return new Float32Array(values);
  }, [radius]);
  const radians = THREE.MathUtils.degToRad(angleDeg);
  const pointer = [Math.cos(radians) * radius * 0.9, Math.sin(radians) * radius * 0.9, 0] as [number, number, number];
  const color = axisColor[axis];
  return (
    <Billboard name={`precision-rotation-dial-${axis}`} position={center} follow renderOrder={50}>
      <mesh raycast={() => null} renderOrder={50}>
        <ringGeometry args={[radius - 0.012, radius + 0.012, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments raycast={() => null} renderOrder={51}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[ticks, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.92} depthTest={false} depthWrite={false} />
      </lineSegments>
      <Line points={[[0, 0, 0], pointer]} color={snapped ? "#f6c849" : color} lineWidth={snapped ? 2.4 : 1.5} depthTest={false} renderOrder={52} raycast={() => null} />
      <mesh position={pointer} raycast={() => null} renderOrder={53}>
        <sphereGeometry args={[radius * 0.035, 16, 12]} />
        <meshBasicMaterial color={snapped ? "#f6c849" : color} depthTest={false} depthWrite={false} />
      </mesh>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((degree) => {
        const labelRadians = THREE.MathUtils.degToRad(degree);
        return (
          <Html
            center
            key={degree}
            position={[Math.cos(labelRadians) * radius * 1.09, Math.sin(labelRadians) * radius * 1.09, 0]}
            className="precision-rotation-tick-label"
            style={{ "--axis-color": color } as CSSProperties}
          >
            {degree}°
          </Html>
        );
      })}
      <Html center className={`precision-rotation-readout${snapped ? " snapped" : ""}`} style={{ "--axis-color": color } as CSSProperties}>
        <span>{axis.toUpperCase()}</span>
        <strong>{angleDeg.toFixed(1)}°</strong>
        <small>{snapped ? "45° 吸附" : "360° 自由旋转"}</small>
      </Html>
    </Billboard>
  );
}

export function PrecisionTransformControls({
  object,
  mode,
  size,
  scaleSnap,
  dialRadius,
  onMouseDown,
  onObjectChange,
  onMouseUp,
  onRotationPreview,
}: PrecisionTransformControlsProps) {
  const { camera, gl, size: viewportSize } = useThree();
  const controlsRef = useRef<TransformControlsApi | null>(null);
  const activeAxisRef = useRef<PrecisionRotationAxis | null>(null);
  const [dial, setDial] = useState<{
    axis: PrecisionRotationAxis;
    angleDeg: number;
    snapped: boolean;
    radius: number;
    center: THREE.Vector3;
  } | null>(null);

  useEffect(() => () => {
    delete gl.domElement.dataset.rotationHandleX;
    delete gl.domElement.dataset.rotationHandleY;
    delete gl.domElement.dataset.rotationHandleZ;
    delete gl.domElement.dataset.rotationDialEnvelopeDiameterPx;
    delete gl.domElement.dataset.rotationDialViewportLimitPx;
  }, [gl]);

  useFrame(() => {
    const canvas = gl.domElement;
    if (mode !== "rotate") {
      delete canvas.dataset.rotationHandleX;
      delete canvas.dataset.rotationHandleY;
      delete canvas.dataset.rotationHandleZ;
      return;
    }
    const center = object.getWorldPosition(new THREE.Vector3());
    const origin = center.clone().project(camera);
    const originScreen = new THREE.Vector2((origin.x + 1) * viewportSize.width / 2, (1 - origin.y) * viewportSize.height / 2);
    const handleForDirection = (direction: THREE.Vector3) => {
      const projected = center.clone().add(direction).project(camera);
      const screen = new THREE.Vector2((projected.x + 1) * viewportSize.width / 2, (1 - projected.y) * viewportSize.height / 2);
      return originScreen.clone().addScaledVector(screen.sub(originScreen).normalize(), 48);
    };
    const xHandle = handleForDirection(new THREE.Vector3(0, 1, 0));
    const yHandle = handleForDirection(new THREE.Vector3(1, 0, 0));
    const zHandle = handleForDirection(new THREE.Vector3(1, 1, 0).normalize());
    canvas.dataset.rotationHandleX = `${Math.round(xHandle.x)},${Math.round(xHandle.y)}`;
    canvas.dataset.rotationHandleY = `${Math.round(yHandle.x)},${Math.round(yHandle.y)}`;
    canvas.dataset.rotationHandleZ = `${Math.round(zHandle.x)},${Math.round(zHandle.y)}`;
  });

  const handleMouseDown = useCallback(() => {
    const axis = mode === "rotate" ? selectedAxis(controlsRef.current?.axis) : null;
    activeAxisRef.current = axis;
    if (axis) {
      const {
        envelopeDiameterPx,
        viewportLimitPx,
        ...metrics
      } = dialMetrics(object, camera, viewportSize, dialRadius);
      gl.domElement.dataset.rotationDialEnvelopeDiameterPx = envelopeDiameterPx.toFixed(1);
      gl.domElement.dataset.rotationDialViewportLimitPx = viewportLimitPx.toFixed(1);
      setDial({
        axis,
        angleDeg: normalizeRotation360(THREE.MathUtils.radToDeg(object.rotation[eulerKey[axis]] as number)),
        snapped: false,
        ...metrics,
      });
    }
    onMouseDown?.();
  }, [camera, dialRadius, gl.domElement, mode, object, onMouseDown, viewportSize]);

  const handleObjectChange = useCallback(() => {
    const axis = activeAxisRef.current;
    let rotationMessage: string | null = null;
    if (mode === "rotate" && axis) {
      const key = eulerKey[axis];
      const result = snapRotationNearIncrement(THREE.MathUtils.radToDeg(object.rotation[key] as number));
      if (result.snapped) object.rotation[key] = THREE.MathUtils.degToRad(result.valueDeg);
      setDial((current) => current ? { ...current, angleDeg: result.displayDeg, snapped: result.snapped } : current);
      rotationMessage = result.snapped
        ? `${axis.toUpperCase()} ${result.displayDeg.toFixed(1)}° / 已吸附到 ${result.snapTargetDeg}°`
        : `${axis.toUpperCase()} ${result.displayDeg.toFixed(1)}° / 360° 自由旋转`;
    }
    onObjectChange?.();
    if (rotationMessage) onRotationPreview?.(rotationMessage);
  }, [mode, object, onObjectChange, onRotationPreview]);

  const handleMouseUp = useCallback(() => {
    onMouseUp?.();
    activeAxisRef.current = null;
    setDial(null);
    delete gl.domElement.dataset.rotationDialEnvelopeDiameterPx;
    delete gl.domElement.dataset.rotationDialViewportLimitPx;
  }, [gl.domElement, onMouseUp]);

  return (
    <>
      <TransformControls
        ref={(controls) => {
          controlsRef.current = controls as unknown as TransformControlsApi | null;
          controlsRef.current?.getHelper?.().traverse((helper) => {
            helper.renderOrder = 20;
          });
        }}
        object={object}
        mode={mode}
        size={size}
        showX
        showY
        showZ
        scaleSnap={scaleSnap}
        onMouseDown={handleMouseDown}
        onObjectChange={handleObjectChange}
        onMouseUp={handleMouseUp}
      />
      {dial && <RotationDial {...dial} />}
    </>
  );
}
