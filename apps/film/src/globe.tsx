import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { interpolate, Easing, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

const RADIUS = 2;

/** Lat/lon in degrees to a point on the sphere. */
function at(lat: number, lon: number, r = RADIUS) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export const PLACES = {
  seoul: { lat: 37.57, lon: 126.98 },
  makati: { lat: 14.55, lon: 121.02 },
  bgc: { lat: 14.55, lon: 121.05 },
  boracay: { lat: 11.97, lon: 121.92 },
  cebu: { lat: 10.31, lon: 123.89 },
};

/** Even dots over the sphere: a quiet, minimal globe with no map data to license. */
function useDots(count: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      positions.set([Math.cos(t) * r * RADIUS * 1.001, y * RADIUS * 1.001, Math.sin(t) * r * RADIUS * 1.001], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count]);
}

function Arc({ from, to, progress }: { from: THREE.Vector3; to: THREE.Vector3; progress: number }) {
  const geometry = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(RADIUS * 1.35);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    return new THREE.TubeGeometry(curve, 64, 0.012, 8, false);
  }, [from, to]);
  // Draw the tube up to `progress` by limiting the index range.
  const total = geometry.index ? geometry.index.count : 0;
  geometry.setDrawRange(0, Math.floor(total * progress));
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#2a9d9e" />
    </mesh>
  );
}

function Pin({ position, scale }: { position: THREE.Vector3; scale: number }) {
  const normal = position.clone().normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  return (
    <group position={position} quaternion={quat} scale={scale}>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
        <meshStandardMaterial color="#2a9d9e" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#2a9d9e" emissive="#2a9d9e" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Seoul → the Philippines. `pins` drop one after another from `pinsAt` frames, every `pinGap`.
 * `pullBack` (0..1) zooms out to the whole planet for the close.
 */
export const Globe = ({ pins, pinsAt = 60, pinGap = 18, arcAt = 10, pullBack = 0 }: { pins: (keyof typeof PLACES)[]; pinsAt?: number; pinGap?: number; arcAt?: number; pullBack?: number }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const dots = useDots(2600);
  const seoul = at(PLACES.seoul.lat, PLACES.seoul.lon);
  const manila = at(PLACES.makati.lat, PLACES.makati.lon);
  const arc = interpolate(frame, [arcAt, arcAt + 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  // Turn the globe so East Asia faces the camera, drifting slowly.
  const spin = interpolate(frame, [0, 600], [-0.25, -0.05]);
  const target = -((PLACES.makati.lon + 90) * Math.PI) / 180;
  const tiltX = (PLACES.makati.lat * Math.PI) / 180 / 1.6;
  const z = interpolate(pullBack, [0, 1], [7.4, 10]);
  return (
    <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, z], fov: 40 }} flat linear>
      <ambientLight intensity={1.4} />
      <directionalLight position={[4, 5, 6]} intensity={0.6} />
      <group rotation={[tiltX, target + spin, 0]}>
        <mesh>
          <sphereGeometry args={[RADIUS, 64, 64]} />
          <meshBasicMaterial color="#eef7f7" />
        </mesh>
        <points geometry={dots}>
          <pointsMaterial color="#7fb8b8" size={0.03} sizeAttenuation />
        </points>
        <Arc from={seoul} to={manila} progress={arc} />
        <Pin position={seoul} scale={1} />
        {pins.map((p, i) => {
          const s = interpolate(frame, [pinsAt + i * pinGap, pinsAt + i * pinGap + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
          return <Pin key={p + i} position={at(PLACES[p].lat, PLACES[p].lon)} scale={s} />;
        })}
      </group>
    </ThreeCanvas>
  );
};
