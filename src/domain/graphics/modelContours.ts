import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const MODEL_CONTOUR_NAME = "AXISFRAME_MODEL_CONTOUR";
export const MODEL_CONTOUR_THRESHOLD = 24;
export const MODEL_CONTOUR_DARK = "#2a2a28";
export const MODEL_CONTOUR_DARK_OPACITY = 0.48;
export const MODEL_CONTOUR_LIGHT = "#f5f4ef";
export const MODEL_CONTOUR_LIGHT_OPACITY = 0.16;

export function markModelContour(object: THREE.Object3D) {
  object.name = MODEL_CONTOUR_NAME;
  object.userData.axisframeVisualAid = "model-contour";
  object.renderOrder = 4;
  object.raycast = () => {};
  return object;
}

export function createModelContourGeometry(source: THREE.BufferGeometry) {
  const expanded = source.index ? source.toNonIndexed() : source.clone();
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute("position", expanded.getAttribute("position").clone());
  const welded = mergeVertices(positionOnly, 1e-4);
  const contour = new THREE.EdgesGeometry(welded, MODEL_CONTOUR_THRESHOLD);
  expanded.dispose();
  positionOnly.dispose();
  welded.dispose();
  return contour;
}

export function attachImportedModelContours(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry) meshes.push(object);
  });
  meshes.forEach((mesh) => {
    const geometry = createModelContourGeometry(mesh.geometry);
    if (geometry.getAttribute("position").count === 0) {
      geometry.dispose();
      return;
    }
    const lightMaterial = new THREE.LineBasicMaterial({
      color: MODEL_CONTOUR_LIGHT,
      transparent: true,
      opacity: MODEL_CONTOUR_LIGHT_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });
    const darkMaterial = new THREE.LineBasicMaterial({
      color: MODEL_CONTOUR_DARK,
      transparent: true,
      opacity: MODEL_CONTOUR_DARK_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });
    const lightContour = markModelContour(new THREE.LineSegments(geometry.clone(), lightMaterial));
    lightContour.name = `${MODEL_CONTOUR_NAME}_LIGHT`;
    lightContour.scale.setScalar(1.003);
    mesh.add(lightContour, markModelContour(new THREE.LineSegments(geometry, darkMaterial)));
  });
  return root;
}

export function stripModelContours(root: THREE.Object3D) {
  const contours: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.userData.axisframeVisualAid === "model-contour") contours.push(object);
  });
  contours.forEach((contour) => contour.removeFromParent());
  return root;
}
