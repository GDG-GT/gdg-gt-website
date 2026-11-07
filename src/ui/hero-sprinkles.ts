import * as THREE from "three";

export const donutSprinkleCount = 84;
const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Preserve the original 84 capsule placements/colors in one GPU draw call. */
export function populateDonutSprinkles(
  mesh: THREE.InstancedMesh,
  colors: readonly string[],
) {
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < donutSprinkleCount; index++) {
    const theta = random(index + 1) * Math.PI * 2;
    const phi = 0.22 + random(index + 200) * 2.7;
    const radius = 1 + 0.406 * Math.cos(phi);
    transform.position.set(
      radius * Math.cos(theta),
      radius * Math.sin(theta),
      0.406 * Math.sin(phi) + 0.055,
    );
    transform.rotation.set(
      random(index + 300) * 0.6,
      random(index + 400) * 0.6,
      random(index + 500) * Math.PI,
    );
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.set(colors[index % colors.length]));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
