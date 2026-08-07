import * as THREE from "three";
import { stripModelContours } from "../../domain/graphics/modelContours";

export type ComponentGlbExportDescriptor = {
  model: string;
  name: string;
  dimensions: { width: number; length: number; height: number };
  material: string;
  ports: Array<{
    id: string;
    position: [number, number, number];
    axis: "x" | "y" | "z";
    direction?: [number, number, number];
    diameter: number;
    kind: string;
    behavior: string;
  }>;
};

export type ComponentGlbExportResult = {
  filename: string;
  byteLength: number;
};

export function componentGlbFilename(model: string): string {
  const normalized = model
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized || "axisframe-component"}.glb`;
}

export function prepareComponentGlbScene(
  source: THREE.Object3D,
  descriptor: ComponentGlbExportDescriptor,
): THREE.Group {
  const model = stripModelContours(source.clone(true));
  model.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(model);
  if (sourceBounds.isEmpty()) throw new Error("COMPONENT_EXPORT_EMPTY_GEOMETRY");

  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const targetSizeMeters = new THREE.Vector3(
    descriptor.dimensions.width / 1000,
    descriptor.dimensions.height / 1000,
    descriptor.dimensions.length / 1000,
  );

  model.position.sub(sourceCenter);
  model.updateMatrixWorld(true);

  const exportRoot = new THREE.Group();
  exportRoot.name = componentGlbFilename(descriptor.model).replace(/\.glb$/i, "");
  exportRoot.scale.set(
    targetSizeMeters.x / Math.max(sourceSize.x, Number.EPSILON),
    targetSizeMeters.y / Math.max(sourceSize.y, Number.EPSILON),
    targetSizeMeters.z / Math.max(sourceSize.z, Number.EPSILON),
  );
  exportRoot.userData.axisframe = {
    model: descriptor.model,
    name: descriptor.name,
    units: "meters",
    dimensionsMm: descriptor.dimensions,
    material: descriptor.material,
    ports: descriptor.ports,
  };
  exportRoot.add(model);

  let meshIndex = 0;
  exportRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshIndex += 1;
    object.name = object.name || `${descriptor.model}_MESH_${String(meshIndex).padStart(3, "0")}`;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  exportRoot.updateMatrixWorld(true);
  return exportRoot;
}

export async function exportComponentGlb(
  source: THREE.Object3D,
  descriptor: ComponentGlbExportDescriptor,
): Promise<ComponentGlbExportResult> {
  const [{ GLTFExporter }] = await Promise.all([
    import("three/addons/exporters/GLTFExporter.js"),
  ]);
  const exportRoot = prepareComponentGlbScene(source, descriptor);
  const exporter = new GLTFExporter();
  const payload = await exporter.parseAsync(exportRoot, {
    binary: true,
    onlyVisible: true,
    includeCustomExtensions: false,
  });
  if (!(payload instanceof ArrayBuffer)) throw new Error("COMPONENT_EXPORT_NOT_BINARY");

  const filename = componentGlbFilename(descriptor.model);
  const url = URL.createObjectURL(new Blob([payload], { type: "model/gltf-binary" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { filename, byteLength: payload.byteLength };
}
