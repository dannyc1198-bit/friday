import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { live, useCentre } from "../store";
import { THEMES, type CentreMode } from "../lib/presentation";
import { plasmaFragment, plasmaVertex } from "./shaders";

const ENERGY: Record<CentreMode, number> = {
  idle: 0.28,
  listening: 0.46,
  thinking: 0.5,
  speaking: 0.34,
  confirming: 0.38,
  alert: 0.72,
};

function hex(value: string) {
  return new THREE.Color(value);
}

function DataRing({ radius, count, speed, tilt }: { radius: number; count: number; speed: number; tilt: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useCentre((state) => (state.theme === "ultron" ? THEMES.ultron.mid : THEMES.jarvis.mid));

  useFrame((_, dt) => {
    const group = mesh.current;
    if (!group) return;
    const mode = useCentre.getState().mode;
    const follow = useCentre.getState().follow;
    group.rotation.z += dt * speed * (mode === "thinking" ? 2.2 : mode === "idle" ? 0.35 : 1);
    group.rotation.x = tilt;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const band = mode === "speaking" ? live.bins[i % live.bins.length] : mode === "listening" && !follow ? live.mic * 0.7 : 0.08 + Math.sin(performance.now() / 700 + i) * 0.04;
      const height = 0.08 + band * (mode === "speaking" ? 0.72 : 0.22);
      dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      dummy.scale.set(0.055, height, 0.055);
      dummy.rotation.set(0, 0, angle);
      dummy.updateMatrix();
      group.setMatrixAt(i, dummy.matrix);
    }
    group.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.92} toneMapped={false} />
    </instancedMesh>
  );
}

function Core() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const energy = useRef(0.2);
  const alert = useRef(0);
  const themeMix = useRef(0);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uEnergy: { value: 0.2 },
    uAlert: { value: 0 },
    uDeep: { value: hex(THEMES.jarvis.deep) },
    uMid: { value: hex(THEMES.jarvis.mid) },
    uHot: { value: hex(THEMES.jarvis.hot) },
  }), []);

  useFrame((_, dt) => {
    const mode = useCentre.getState().mode;
    const follow = useCentre.getState().follow;
    const theme = useCentre.getState().theme;
    const speaking = mode === "speaking" ? live.mouth : 0;
    const listen = mode === "listening" ? (follow ? 0.08 : 0.18 + live.mic * 0.5) : 0;
    const target = Math.min(1, ENERGY[mode] + speaking * 0.9 + listen);
    energy.current += (target - energy.current) * (1 - Math.exp(-dt * (mode === "speaking" ? 12 : 2.4)));
    alert.current += (((mode === "alert" ? 1 : 0) - alert.current) * (1 - Math.exp(-dt * 6)));
    themeMix.current += (((theme === "ultron" ? 1 : 0) - themeMix.current) * (1 - Math.exp(-dt * 2)));
    const pick = (key: "deep" | "mid" | "hot") => hex(THEMES.jarvis[key]).lerp(hex(THEMES.ultron[key]), themeMix.current);
    const material = mat.current;
    if (!material) return;
    material.uniforms.uTime.value += dt * (mode === "idle" ? 0.45 : 1);
    material.uniforms.uEnergy.value = energy.current;
    material.uniforms.uAlert.value = alert.current;
    material.uniforms.uDeep.value.copy(pick("deep"));
    material.uniforms.uMid.value.copy(pick("mid"));
    material.uniforms.uHot.value.copy(pick("hot"));
  });

  return (
    <mesh
      onClick={() => {
        live.ripple = 1;
        window.dispatchEvent(new CustomEvent("jarvis-orb-click"));
      }}
    >
      <mesh>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshBasicMaterial color={"#fff6df"} toneMapped={false} />
      </mesh>
      <icosahedronGeometry args={[0.78, 4]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={plasmaVertex}
        fragmentShader={plasmaFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function Halo() {
  const ref = useRef<THREE.Mesh>(null);
  const theme = useCentre((state) => state.theme);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.15;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[1.42, 0.008, 8, 80]} />
      <meshBasicMaterial color={theme === "ultron" ? THEMES.ultron.hud : THEMES.jarvis.hud} transparent opacity={0.45} toneMapped={false} />
    </mesh>
  );
}

function Pump({ slow }: { slow: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!slow) return;
    const id = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 50);
    return () => window.clearInterval(id);
  }, [slow, invalidate]);
  return null;
}

export function Reactor({ slow }: { slow: boolean }) {
  const mode = useCentre((state) => state.mode);
  const bloom = !slow && mode !== "idle";
  return (
    <>
      <Pump slow={slow} />
      <Core />
      <DataRing radius={1.15} count={28} speed={0.35} tilt={0.15} />
      <DataRing radius={1.48} count={36} speed={-0.22} tilt={0.55} />
      <Halo />
      {bloom && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={mode === "speaking" ? 0.7 : 0.45} luminanceThreshold={0.22} luminanceSmoothing={0.25} radius={0.4} />
        </EffectComposer>
      )}
    </>
  );
}
