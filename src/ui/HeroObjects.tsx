import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { donutSprinkleCount, populateDonutSprinkles } from "./hero-sprinkles";

const random = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const colors = [
  "#4285F4",
  "#DB4437",
  "#F4B400",
  "#0F9D58",
  "#fff8ec",
  "#f05f8c",
];
function DonutSprinkles() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (mesh.current) populateDonutSprinkles(mesh.current, colors);
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, donutSprinkleCount]}>
      <capsuleGeometry args={[0.025, 0.105, 3, 5]} />
      <meshStandardMaterial roughness={0.3} />
    </instancedMesh>
  );
}
function StaticObjects() {
  return (
    <img
      className="gt-hero-static-objects"
      src="/assets/hero-campus.webp"
      alt=""
      width="1920"
      height="800"
    />
  );
}
class MotionFallback extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <StaticObjects /> : this.props.children;
  }
}

function FrostedDonut() {
  const frosting = useMemo(() => {
    const positions: number[] = [],
      indices: number[] = [],
      normals: number[] = [];
    const rings = 96,
      segments = 18;
    for (let i = 0; i <= rings; i++) {
      const theta = (i / rings) * Math.PI * 2;
      for (let j = 0; j <= segments; j++) {
        const drip = Math.sin(theta * 7) * 0.11 + Math.sin(theta * 13) * 0.06;
        const phi =
          -0.12 +
          (j / segments) * (Math.PI + 0.24) +
          drip * Math.pow(Math.abs(j / segments - 0.5) * 2, 6);
        const radius = 1 + 0.395 * Math.cos(phi);
        positions.push(
          radius * Math.cos(theta),
          radius * Math.sin(theta),
          0.395 * Math.sin(phi) + 0.025,
        );
        normals.push(
          Math.cos(phi) * Math.cos(theta),
          Math.cos(phi) * Math.sin(theta),
          Math.sin(phi),
        );
        if (i < rings && j < segments) {
          const a = i * (segments + 1) + j,
            b = a + segments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setIndex(indices);
    return geometry;
  }, []);
  useEffect(() => () => frosting.dispose(), [frosting]);
  return (
    <group>
      <mesh>
        <torusGeometry args={[1, 0.385, 24, 80]} />
        <meshStandardMaterial color="#e2a563" roughness={0.45} />
      </mesh>
      <mesh geometry={frosting}>
        <meshPhysicalMaterial
          color="#ff93ad"
          roughness={0.17}
          clearcoat={1}
          clearcoatRoughness={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      <DonutSprinkles />
    </group>
  );
}
function Star() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.PI / 2,
        r = i % 2 === 0 ? 1 : 0.5;
      const x = Math.cos(angle) * r,
        y = Math.sin(angle) * r;
      if (!i) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.25,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.17,
      bevelThickness: 0.17,
    });
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial
        color="#f980a9"
        metalness={0.2}
        roughness={0.13}
        clearcoat={1}
      />
    </mesh>
  );
}
function Jelly() {
  const geometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(1, 48, 40),
      positions = geometry.attributes.position;
    const vector = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      vector.fromBufferAttribute(positions, index);
      const noise =
        1 +
        0.12 * Math.sin(vector.x * 3.5 + vector.y) +
        0.12 * Math.sin(vector.y * 4 + vector.z * 2.5);
      vector.multiplyScalar(noise);
      positions.setXYZ(index, vector.x, vector.y, vector.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial
        color="#ff8caa"
        roughness={0.08}
        transmission={0.64}
        thickness={1.5}
        ior={1.35}
        clearcoat={1}
        metalness={0.06}
      />
    </mesh>
  );
}
function MovingObject({
  kind,
  base,
  size,
  phase,
  scrollRef,
}: {
  kind: "donut" | "star" | "jelly" | "gem";
  base: [number, number];
  size: number;
  phase: number;
  scrollRef: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Group>(null);
  const { viewport, pointer } = useThree();
  useFrame(({ clock }, delta) => {
    const group = ref.current;
    if (!group) return;
    const t = clock.elapsedTime,
      scroll = scrollRef.current;
    const x =
      (base[0] * viewport.width) / 2 +
      pointer.x * (phase % 2 ? 0.2 : -0.2) +
      Math.sin(t * 0.35 + phase) * 0.055;
    const y =
      (base[1] * viewport.height) / 2 +
      Math.cos(t * 0.4 + phase) * 0.1 +
      scroll * (0.6 + phase * 0.13);
    group.position.x = THREE.MathUtils.damp(group.position.x, x, 4, delta);
    group.position.y = THREE.MathUtils.damp(group.position.y, y, 4, delta);
    group.rotation.x =
      0.25 +
      pointer.y * 0.14 +
      Math.sin(t * 0.22 + phase) * 0.08 +
      scroll * 0.12;
    group.rotation.y = -0.25 + pointer.x * 0.18 + scroll * 0.3;
    group.rotation.z =
      -0.35 +
      Math.sin(t * 0.18 + phase) * 0.08 +
      scroll * (phase % 2 ? -0.18 : 0.18);
  });
  return (
    <group
      ref={ref}
      position={[
        (base[0] * viewport.width) / 2,
        (base[1] * viewport.height) / 2,
        0,
      ]}
      scale={size}
    >
      {kind === "donut" ? (
        <FrostedDonut />
      ) : kind === "star" ? (
        <Star />
      ) : kind === "jelly" ? (
        <Jelly />
      ) : (
        <mesh>
          <icosahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial
            color="#ffba81"
            metalness={0.15}
            roughness={0.16}
            transmission={0.25}
            thickness={0.8}
            flatShading
            clearcoat={1}
          />
        </mesh>
      )}
    </group>
  );
}
function Confetti({
  scrollRef,
}: {
  scrollRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null),
    { viewport } = useThree();
  useFrame(({ clock, pointer }) => {
    if (group.current) {
      group.current.rotation.z = Math.sin(clock.elapsedTime * 0.08) * 0.025;
      group.current.position.y = scrollRef.current * 0.6;
      group.current.position.x = pointer.x * 0.06;
    }
  });
  return (
    <group ref={group}>
      {Array.from({ length: 20 }, (_, index) => {
        const x = random(index + 9) * 2 - 1,
          y = random(index + 90) * 1.7 - 0.8;
        if (x > -0.8 && x < 0.12 && y > -0.5 && y < 0.45) return null;
        return (
          <mesh
            key={index}
            position={[
              (x * viewport.width) / 2,
              (y * viewport.height) / 2,
              -0.6,
            ]}
            rotation={[index, index / 2, index]}
          >
            {index % 3 ? (
              <sphereGeometry
                args={[0.045 + random(index + 20) * 0.045, 12, 12]}
              />
            ) : (
              <capsuleGeometry args={[0.034, 0.12, 4, 8]} />
            )}
            <meshStandardMaterial
              color={colors[index % 4]}
              roughness={0.2}
              metalness={0.08}
            />
          </mesh>
        );
      })}
    </group>
  );
}
export default function HeroObjects() {
  const [enabled, setEnabled] = useState(false),
    [visible, setVisible] = useState(true),
    [tabVisible, setTabVisible] = useState(true);
  const scroll = useRef(0),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => {
      const device = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { saveData?: boolean };
      };
      setEnabled(
        !media.matches &&
          window.innerWidth >= 768 &&
          !device.connection?.saveData &&
          (device.deviceMemory ?? 8) > 2,
      );
    };
    check();
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    media.addEventListener("change", check);
    window.addEventListener("resize", check);
    const onScroll = () => {
      scroll.current = Math.min(
        1.5,
        window.scrollY / Math.max(1, window.innerHeight),
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener("change", check);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", check);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);
  return (
    <div className="gt-hero-objects" ref={root} aria-hidden="true">
      {enabled ? (
        <MotionFallback>
          <Canvas
            eventSource={root.current?.parentElement || undefined}
            eventPrefix="client"
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 8], fov: 40 }}
            gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
            frameloop={visible && tabVisible ? "always" : "never"}
          >
            <ambientLight intensity={0.6} />
            <directionalLight
              position={[3, 7, 5]}
              intensity={2.8}
              color="#fff2e1"
            />
            <Environment resolution={128}>
              <Lightformer
                intensity={4}
                position={[0, 5, 3]}
                scale={[10, 8, 1]}
              />
              <Lightformer
                intensity={2}
                position={[-5, 0, 1]}
                scale={[4, 8, 1]}
                color="#ffe0e3"
              />
              <Lightformer
                intensity={1.8}
                position={[5, -3, 2]}
                scale={[6, 6, 1]}
                color="#ffd19e"
              />
            </Environment>
            <MovingObject
              kind="donut"
              base={[0.77, 0.67]}
              size={0.62}
              phase={1}
              scrollRef={scroll}
            />
            <MovingObject
              kind="star"
              base={[-0.87, 0.55]}
              size={0.43}
              phase={2}
              scrollRef={scroll}
            />
            <MovingObject
              kind="jelly"
              base={[-0.84, -0.58]}
              size={0.7}
              phase={3}
              scrollRef={scroll}
            />
            <MovingObject
              kind="gem"
              base={[0.24, 0.05]}
              size={0.34}
              phase={4}
              scrollRef={scroll}
            />
            <Confetti scrollRef={scroll} />
          </Canvas>
        </MotionFallback>
      ) : (
        <StaticObjects />
      )}
    </div>
  );
}
