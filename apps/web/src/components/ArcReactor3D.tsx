"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";

interface ArcReactor3DProps {
  /** Size in pixels — canvas is rendered square at this size */
  size?: number;
  /** Additional className for the wrapper div */
  className?: string;
}

export default function ArcReactor3D({ size = 400, className = "" }: ArcReactor3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ─────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // transparent background
    mount.appendChild(renderer.domElement);

    // ── Scene & Camera ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 4;

    // ── Point Light — pulsing cyan ────────────────────────────────────
    const pointLight = new THREE.PointLight(0x00d4ff, 6, 12);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    const ambientLight = new THREE.AmbientLight(0x001133, 0.5);
    scene.add(ambientLight);

    // ── Outer ring (wireframe torus, clockwise 0.5 rad/s) ─────────────
    const outerGeo = new THREE.TorusGeometry(1.6, 0.03, 8, 64);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    scene.add(outerRing);

    // Outer ring detail spokes
    const spokesGroup = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const spokeGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.4, 4);
      const spokeMat = new THREE.MeshBasicMaterial({ color: 0x0066aa });
      const spoke = new THREE.Mesh(spokeGeo, spokeMat);
      const angle = (i / 12) * Math.PI * 2;
      spoke.position.set(Math.cos(angle) * 1.6, Math.sin(angle) * 1.6, 0);
      spoke.rotation.z = angle;
      spokesGroup.add(spoke);
    }
    scene.add(spokesGroup);

    // ── Middle ring (wireframe torus, counter-clockwise 0.8 rad/s) ────
    const middleGeo = new THREE.TorusGeometry(1.1, 0.025, 6, 48);
    const middleMat = new THREE.MeshBasicMaterial({ color: 0x0099cc, wireframe: true });
    const middleRing = new THREE.Mesh(middleGeo, middleMat);
    scene.add(middleRing);

    // ── Inner sphere (emissive #0066ff, pulsing scale 0.9→1.1, 2s) ────
    const innerGeo = new THREE.SphereGeometry(0.45, 20, 20);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      emissive: 0x0066ff,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.8,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    // Inner sphere glow ring
    const glowGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
    const glowRing = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowRing);

    // ── 200 cyan particles orbiting randomly ─────────────────────────
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    const particleAngles = new Float32Array(particleCount);
    const particleRadii = new Float32Array(particleCount);
    const particleSpeeds = new Float32Array(particleCount);
    const particleTilts = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particleAngles[i] = Math.random() * Math.PI * 2;
      particleRadii[i] = 0.6 + Math.random() * 1.2; // 0.6–1.8 radius
      particleSpeeds[i] = (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1);
      particleTilts[i] = Math.random() * Math.PI; // orbit plane tilt
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00d4ff,
      size: 0.03,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // ── Animation loop ────────────────────────────────────────────────
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Outer ring: clockwise around Y axis
      outerRing.rotation.y += 0.5 * 0.016;
      spokesGroup.rotation.z -= 0.3 * 0.016;

      // Middle ring: counter-clockwise around X axis
      middleRing.rotation.x += 0.8 * 0.016;
      middleRing.rotation.z -= 0.4 * 0.016;

      // Inner sphere: pulse scale 0.9 → 1.1 over 2s
      const pulse = 1.0 + 0.1 * Math.sin((t / 2) * Math.PI * 2);
      innerSphere.scale.setScalar(pulse);
      glowRing.scale.setScalar(pulse);

      // Point light: intensity pulses with inner sphere
      pointLight.intensity = 5 + 3 * Math.sin((t / 2) * Math.PI * 2);
      innerMat.emissiveIntensity = 1.0 + 0.8 * Math.sin((t / 2) * Math.PI * 2);

      // Update particle positions
      const posArr = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        particleAngles[i] += particleSpeeds[i] * 0.016;
        const r = particleRadii[i];
        const angle = particleAngles[i];
        const tilt = particleTilts[i];
        // Orbit in tilted plane
        posArr[i * 3 + 0] = r * Math.cos(angle);
        posArr[i * 3 + 1] = r * Math.sin(angle) * Math.cos(tilt);
        posArr[i * 3 + 2] = r * Math.sin(angle) * Math.sin(tilt);
      }
      particleGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      outerGeo.dispose();
      outerMat.dispose();
      middleGeo.dispose();
      middleMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
