import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  donutSprinkleCount,
  populateDonutSprinkles,
} from "../../src/ui/hero-sprinkles";

describe("instanced hero sprinkle fidelity", () => {
  it("retains every original capsule transform and linear-space color", () => {
    const palette = [
      "#4285F4",
      "#DB4437",
      "#F4B400",
      "#0F9D58",
      "#fff8ec",
      "#f05f8c",
    ];
    const geometry = new THREE.CapsuleGeometry(0.025, 0.105, 3, 5);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.3 });
    const instanced = new THREE.InstancedMesh(
      geometry,
      material,
      donutSprinkleCount,
    );
    try {
      populateDonutSprinkles(instanced, palette);
      expect(instanced.count).toBe(84);
      // Independent reconstruction of the previous individual-mesh scene.
      const sample = (seed: number) => {
        const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return n - Math.floor(n);
      };
      for (let index = 0; index < 84; index++) {
        const theta = sample(index + 1) * Math.PI * 2;
        const phi = 0.22 + sample(index + 200) * 2.7;
        const radius = 1 + 0.406 * Math.cos(phi);
        const original = new THREE.Mesh(geometry, material);
        original.position.set(
          radius * Math.cos(theta),
          radius * Math.sin(theta),
          0.406 * Math.sin(phi) + 0.055,
        );
        original.rotation.set(
          sample(index + 300) * 0.6,
          sample(index + 400) * 0.6,
          sample(index + 500) * Math.PI,
        );
        original.updateMatrix();
        const matrix = new THREE.Matrix4();
        instanced.getMatrixAt(index, matrix);
        expect(matrix.toArray()).toEqual(
          original.matrix.toArray().map(Math.fround),
        );
        const color = new THREE.Color();
        instanced.getColorAt(index, color);
        expect(color.toArray()).toEqual(
          new THREE.Color(palette[index % 6]).toArray().map(Math.fround),
        );
      }
      expect(instanced.boundingSphere?.radius).toBeGreaterThan(1);
    } finally {
      instanced.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
});
