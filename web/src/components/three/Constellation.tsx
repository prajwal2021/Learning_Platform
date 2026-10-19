"use client";
/* The 3D hero: a slowly turning network of nodes (the services of a system) joined by edges, with signals travelling
   along the edges, around a glass core. Colours follow the accent and theme; it pauses when off-screen or when motion
   is reduced. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { calm } from "@/lib/prefs";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function usePalette() {
  const read = () => ({
    a: cssVar("--lp-brand", "#8b7dff"), b: cssVar("--lp-brand-2", "#38bdf8"), c: cssVar("--lp-pink", "#f472b6"),
    dark: document.documentElement.getAttribute("data-theme") !== "light",
  });
  const [p, setP] = useState(() => (typeof window === "undefined" ? { a: "#8b7dff", b: "#38bdf8", c: "#f472b6", dark: true } : read()));
  useEffect(() => {
    const on = () => requestAnimationFrame(() => setP(read()));
    window.addEventListener("lp-theme", on);
    window.addEventListener("lp-prefs", on);
    return () => { window.removeEventListener("lp-theme", on); window.removeEventListener("lp-prefs", on); };
  }, []);
  return p;
}

type Graph = { points: THREE.Vector3[]; edges: [number, number][] };

function makeGraph(n: number, radius: number, seed = 7): Graph {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    // points on a fuzzy sphere shell (golden spiral, jittered)
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963 + rnd() * .4;
    const k = radius * (0.78 + rnd() * 0.42);
    points.push(new THREE.Vector3(Math.cos(th) * r * k, y * k * .82, Math.sin(th) * r * k));
  }
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  points.forEach((p, i) => {
    const near = points.map((q, j) => [j, p.distanceTo(q)] as const).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 3);
    near.forEach(([j]) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    });
  });
  return { points, edges };
}

function Network({ colors, density }: { colors: ReturnType<typeof usePalette>; density: number }) {
  const group = useRef<THREE.Group>(null);
  const pulses = useRef<THREE.InstancedMesh>(null);
  const graph = useMemo(() => makeGraph(density, 2.6), [density]);
  const { pointer } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pulseState = useMemo(() => graph.edges.slice(0, 28).map((_, i) => ({ e: (i * 7) % graph.edges.length, t: (i * 0.137) % 1, v: 0.18 + (i % 5) * 0.05 })), [graph]);

  const lineGeo = useMemo(() => {
    const pos = new Float32Array(graph.edges.length * 6);
    graph.edges.forEach(([a, b], i) => {
      pos.set([graph.points[a].x, graph.points[a].y, graph.points[a].z, graph.points[b].x, graph.points[b].y, graph.points[b].z], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [graph]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += dt * 0.08;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, pointer.y * 0.25, 0.04);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -pointer.x * 0.12, 0.04);
    const m = pulses.current;
    if (!m) return;
    pulseState.forEach((p, i) => {
      p.t += dt * p.v;
      if (p.t > 1) { p.t = 0; p.e = (p.e + 11) % graph.edges.length; }
      const [a, b] = graph.edges[p.e];
      dummy.position.lerpVectors(graph.points[a], graph.points[b], p.t);
      const sc = 0.035 + Math.sin(p.t * Math.PI) * 0.03;
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color={colors.b} transparent opacity={colors.dark ? 0.28 : 0.38} />
      </lineSegments>
      {graph.points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i % 6 === 0 ? 0.09 : 0.05, 16, 16]} />
          <meshStandardMaterial color={i % 6 === 0 ? colors.c : i % 2 ? colors.a : colors.b} emissive={i % 6 === 0 ? colors.c : i % 2 ? colors.a : colors.b}
            emissiveIntensity={colors.dark ? 2.4 : 1.2} toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={pulses} args={[undefined, undefined, pulseState.length]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Core({ colors }: { colors: ReturnType<typeof usePalette> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) { ref.current.rotation.x += dt * 0.15; ref.current.rotation.y += dt * 0.22; } });
  return (
    <Float speed={1.4} rotationIntensity={0.4} floatIntensity={0.8}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[1.05, 1]} />
        <MeshTransmissionMaterial backside thickness={0.6} roughness={0.08} transmission={1} ior={1.35} chromaticAberration={0.35}
          anisotropy={0.3} distortion={0.35} distortionScale={0.4} temporalDistortion={0.15} color={colors.a} attenuationColor={colors.b}
          attenuationDistance={1.6} samples={6} resolution={256} />
      </mesh>
      <mesh scale={0.42}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={colors.b} emissive={colors.b} emissiveIntensity={colors.dark ? 3 : 1.6} toneMapped={false} wireframe />
      </mesh>
    </Float>
  );
}

export default function Constellation({ density = 46, bloom = true, className, interactive = true, offset = [0, 0], fade = false }: {
  density?: number; bloom?: boolean; className?: string; interactive?: boolean;
  /** move the scene within the frame, in scene units */ offset?: [number, number];
  /** soften the frame's edges into the page (bloom makes the canvas opaque) */ fade?: boolean;
}) {
  const colors = usePalette();
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(calm());
    const onPrefs = () => setStill(calm());
    window.addEventListener("lp-prefs", onPrefs);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
    if (wrap.current) io.observe(wrap.current);
    return () => { io.disconnect(); window.removeEventListener("lp-prefs", onPrefs); };
  }, []);
  return (
    <div ref={wrap} className={className} style={{ pointerEvents: interactive ? "auto" : "none", ...(fade ? { maskImage: "radial-gradient(closest-side, #000 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 55%, transparent 100%)" } : null) }}>
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 0, 7.2], fov: 45 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible && !still ? "always" : "demand"}>
        <ambientLight intensity={colors.dark ? 0.35 : 0.9} />
        <pointLight position={[5, 4, 6]} intensity={40} color={colors.a} />
        <pointLight position={[-6, -3, 2]} intensity={30} color={colors.b} />
        <group position={[offset[0], offset[1], 0]}>
          <Network colors={colors} density={density} />
          <Core colors={colors} />
        </group>
        <Sparkles count={70} scale={[9, 6, 6]} size={2.2} speed={0.35} opacity={colors.dark ? 0.7 : 0.45} color={colors.b} />
        {bloom ? (
          <EffectComposer multisampling={0}>
            <Bloom intensity={colors.dark ? 1.1 : 0.55} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
          </EffectComposer>
        ) : <></>}
      </Canvas>
    </div>
  );
}
