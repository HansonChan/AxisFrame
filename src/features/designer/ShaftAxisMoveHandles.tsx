import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mmToScene } from "../../domain/components/componentBounds";
import type { Lang } from "../../shared/i18n/types";

type Vec3Tuple = [number, number, number];

type ShaftAxisMoveContextValue = {
  activePartId: string | null;
  stepMm: number;
  lang: Lang;
  onMove: (distanceMm: number, captureHistory?: boolean) => void;
};

const ShaftAxisMoveContext = createContext<ShaftAxisMoveContextValue | null>(null);

export function ShaftAxisMoveProvider({
  activePartId,
  stepMm,
  lang,
  onMove,
  children,
}: ShaftAxisMoveContextValue & { children: ReactNode }) {
  return (
    <ShaftAxisMoveContext.Provider value={{ activePartId, stepMm, lang, onMove }}>
      {children}
    </ShaftAxisMoveContext.Provider>
  );
}

export function ShaftAxisMoveHandles({
  id,
  baseLengthScene,
  localAxis,
  sizePercent,
  radius,
}: {
  id: string;
  baseLengthScene: number;
  localAxis: Vec3Tuple;
  sizePercent: number;
  radius: number;
}) {
  const context = useContext(ShaftAxisMoveContext);
  const startRef = useRef<THREE.Mesh>(null);
  const endRef = useRef<THREE.Mesh>(null);
  const dragging = useRef<{
    pointerId: number;
    plane: THREE.Plane;
    worldAxis: THREE.Vector3;
    startPoint: THREE.Vector3;
    lastDistanceMm: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const { camera, controls, gl, size, invalidate } = useThree();
  const axis = useMemo(() => new THREE.Vector3(...localAxis).normalize(), [localAxis]);
  const currentLength = baseLengthScene * Math.max(0.15, sizePercent / 100);
  const endpointDistance = currentLength / 2;
  const arrowLength = THREE.MathUtils.clamp(radius * 10, 0.52, 0.78);
  const shaftLength = arrowLength * 0.56;
  const headLength = arrowLength - shaftLength;
  const shaftRadius = THREE.MathUtils.clamp(radius * 0.24, 0.014, 0.025);
  const headRadius = THREE.MathUtils.clamp(radius * 1.25, 0.075, 0.13);
  const gap = Math.max(radius * 0.4, 0.025);
  const hitLength = arrowLength * 0.62;
  const hitCenter = arrowLength - hitLength / 2;
  const active = context?.activePartId === id;

  const arrow = (direction: -1 | 1, ref: React.RefObject<THREE.Mesh | null>) => {
    const outward = axis.clone().multiplyScalar(direction);
    const endpoint = axis.clone().multiplyScalar(endpointDistance * direction);
    const origin = endpoint.add(outward.clone().multiplyScalar(gap));
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    const label = context?.lang === "zh"
      ? `按住拖动，沿光轴${direction < 0 ? "反向" : "正向"}移动`
      : `HOLD AND DRAG SHAFT ${direction < 0 ? "BACKWARD" : "FORWARD"}`;
    const handleMove = (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (suppressClick.current) { suppressClick.current = false; return; }
      context?.onMove(direction * context.stepMm, false);
    };
    const beginDrag = (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const mesh = ref.current;
      if (!mesh || !context) return;
      mesh.updateWorldMatrix(true, false);
      const worldAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const origin = mesh.getWorldPosition(new THREE.Vector3());
      const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
      let planeNormal = cameraDirection.clone().sub(worldAxis.clone().multiplyScalar(cameraDirection.dot(worldAxis)));
      if (planeNormal.lengthSq() < 0.000001) planeNormal = camera.up.clone().sub(worldAxis.clone().multiplyScalar(camera.up.dot(worldAxis)));
      if (planeNormal.lengthSq() < 0.000001) planeNormal.set(0, 1, 0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal.normalize(), origin);
      const startPoint = event.ray.intersectPlane(plane, new THREE.Vector3());
      if (!startPoint) return;
      dragging.current = { pointerId: event.pointerId, plane, worldAxis, startPoint, lastDistanceMm: 0, moved: false };
      (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
      if (controls && "enabled" in controls) controls.enabled = false;
      gl.domElement.style.cursor = "grabbing";
      gl.domElement.dataset.shaftAxisMoveDragging = "true";
      context.onMove(0, true);
    };
    const drag = (event: ThreeEvent<PointerEvent>) => {
      const state = dragging.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const point = event.ray.intersectPlane(state.plane, new THREE.Vector3());
      if (!point) return;
      const totalDistanceMm = point.clone().sub(state.startPoint).dot(state.worldAxis) / mmToScene(1);
      const incrementalDistanceMm = totalDistanceMm - state.lastDistanceMm;
      if (Math.abs(incrementalDistanceMm) < 0.1) return;
      state.lastDistanceMm = totalDistanceMm;
      state.moved ||= Math.abs(totalDistanceMm) >= 0.5;
      gl.domElement.dataset.shaftAxisMoveDragMm = totalDistanceMm.toFixed(1);
      context?.onMove(incrementalDistanceMm, false);
      invalidate();
    };
    const endDrag = (event: ThreeEvent<PointerEvent>) => {
      const state = dragging.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.stopPropagation();
      suppressClick.current = state.moved;
      dragging.current = null;
      (event.target as unknown as { releasePointerCapture: (pointerId: number) => void }).releasePointerCapture(event.pointerId);
      if (controls && "enabled" in controls) controls.enabled = true;
      gl.domElement.style.cursor = "grab";
      delete gl.domElement.dataset.shaftAxisMoveDragging;
    };
    return (
      <group position={origin} quaternion={quaternion}>
        <mesh
          ref={ref}
          position={[0, hitCenter, 0]}
          onPointerDown={beginDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={handleMove}
          onPointerOver={() => { if (!dragging.current) gl.domElement.style.cursor = "grab"; }}
          onPointerOut={() => { if (!dragging.current) gl.domElement.style.cursor = ""; }}
          name={label}
        >
          <cylinderGeometry args={[headRadius * 1.35, headRadius * 1.35, hitLength, 18]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <mesh position={[0, shaftLength / 2, 0]} renderOrder={25} raycast={() => null}>
          <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 16]} />
          <meshBasicMaterial color="#35d5e8" transparent opacity={0.92} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, shaftLength + headLength / 2, 0]} renderOrder={25} raycast={() => null}>
          <coneGeometry args={[headRadius, headLength, 20]} />
          <meshBasicMaterial color="#35d5e8" transparent opacity={0.96} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    );
  };

  useFrame(() => {
    if (!active) return;
    const project = (mesh: THREE.Mesh | null) => {
      if (!mesh) return "";
      mesh.updateWorldMatrix(true, false);
      const point = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      return `${(((point.x + 1) / 2) * size.width).toFixed(1)},${(((1 - point.y) / 2) * size.height).toFixed(1)}`;
    };
    gl.domElement.dataset.shaftAxisMovePart = id;
    gl.domElement.dataset.shaftAxisMoveStart = project(startRef.current);
    gl.domElement.dataset.shaftAxisMoveEnd = project(endRef.current);
    gl.domElement.dataset.shaftAxisMoveStepMm = String(context?.stepMm ?? 0);
    gl.domElement.dataset.shaftAxisMoveDirections = "negative,positive";
  });

  useEffect(() => {
    if (active) invalidate();
    return () => {
      if (gl.domElement.dataset.shaftAxisMovePart !== id) return;
      delete gl.domElement.dataset.shaftAxisMovePart;
      delete gl.domElement.dataset.shaftAxisMoveStart;
      delete gl.domElement.dataset.shaftAxisMoveEnd;
      delete gl.domElement.dataset.shaftAxisMoveStepMm;
      delete gl.domElement.dataset.shaftAxisMoveDirections;
      delete gl.domElement.dataset.shaftAxisMoveDragging;
      delete gl.domElement.dataset.shaftAxisMoveDragMm;
      if (controls && "enabled" in controls) controls.enabled = true;
      gl.domElement.style.cursor = "";
    };
  }, [active, controls, gl.domElement, id, invalidate]);

  if (!active || !context) return null;
  return <>{arrow(-1, startRef)}{arrow(1, endRef)}</>;
}
