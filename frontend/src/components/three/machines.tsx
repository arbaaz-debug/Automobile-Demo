"use client";

/**
 * Machine primitives for the press-line scene.
 *
 * Each press-shop operation gets a silhouette a press-shop engineer would
 * recognise: a decoiler is a coil on a mandrel, a draw press is a four-column
 * frame with a slide that reciprocates, an inspection bay is a checking fixture
 * under lamps. The ram stroke is driven by the station's real SPM, so a line
 * running slow visibly runs slow.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StationKind } from "@/domain/stamping/types";

export const STEEL = "#99a3b0";
export const STEEL_DARK = "#78828f";
export const STEEL_LIGHT = "#c2cad4";
export const PANEL_STEEL = "#8e99a6";
export const FLOOR = "#aab3be";

export interface MachineProps {
  /** Strokes per minute — drives the reciprocation rate. */
  spm: number;
  /** Phase offset so stations along the line do not move in lockstep. */
  phase: number;
  color: string;
  running: boolean;
}

/**
 * Press stroke position, 0 = top dead centre, 1 = bottom dead centre.
 * Derived from the clock so it stays smooth and needs no React state.
 */
export function strokeAt(elapsed: number, spm: number, phase: number, running: boolean): number {
  if (!running || spm <= 0) return 0.06;
  const theta = elapsed * (spm / 60) * Math.PI * 2 + phase;
  return (1 - Math.cos(theta)) / 2;
}

/** Four-column press frame with a reciprocating slide. Used for OP10-OP40. */
export function PressMachine({
  spm,
  phase,
  color,
  running,
  height = 4.2,
  width = 3.2,
  depth = 2.6,
}: MachineProps & { height?: number; width?: number; depth?: number }) {
  const ram = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ram.current) return;
    // Slide travels between the crown and the bolster.
    const travel = height * 0.34;
    const stroke = strokeAt(state.clock.elapsedTime, spm, phase, running);
    ram.current.position.y = height * 0.62 - stroke * travel;
  });

  const colX = width / 2 - 0.22;
  const colZ = depth / 2 - 0.22;

  return (
    <group>
      {/* Bed / bolster */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.9, depth]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.65} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[width * 0.86, 0.18, depth * 0.86]} />
        <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.35} />
      </mesh>

      {/* Straight-side housings — the plated uprights that carry the load */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (width / 2 + 0.05), height * 0.6, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.34, height * 0.82, depth * 1.02]} />
          <meshStandardMaterial color={STEEL_DARK} metalness={0.6} roughness={0.5} />
        </mesh>
      ))}

      {/* Guide columns inside the housing */}
      {[
        [-colX, colZ],
        [colX, colZ],
        [-colX, -colZ],
        [colX, -colZ],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, height * 0.5, z]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, height * 0.9, 10]} />
          <meshStandardMaterial color={STEEL_LIGHT} metalness={0.88} roughness={0.24} />
        </mesh>
      ))}

      {/* Flywheel and drive on the operator side */}
      <mesh
        position={[width / 2 + 0.28, height * 0.86, -depth * 0.28]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.5, 0.5, 0.3, 18]} />
        <meshStandardMaterial color={STEEL_LIGHT} metalness={0.85} roughness={0.3} />
      </mesh>

      {/* Slide / ram — the moving part */}
      <mesh ref={ram} position={[0, height * 0.62, 0]} castShadow>
        <boxGeometry args={[width * 0.78, 0.62, depth * 0.78]} />
        <meshStandardMaterial color={STEEL} metalness={0.75} roughness={0.4} />
      </mesh>

      {/* Crown */}
      <mesh position={[0, height * 0.98, 0]} castShadow>
        <boxGeometry args={[width * 1.04, 0.7, depth * 1.02]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.62} roughness={0.5} />
      </mesh>
      {/* Status stripe along the crown — reads at a distance without turning
          the whole machine into a coloured block. */}
      <mesh position={[0, height * 0.98, depth * 0.52]}>
        <boxGeometry args={[width * 1.05, 0.12, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={running ? 1.1 : 0.5} />
      </mesh>

      <StatusBeacon y={height * 1.16} color={color} running={running} />
    </group>
  );
}

/** Coil on an expanding mandrel, with a loop of strip peeling off. */
export function DecoilerMachine({ color, running }: MachineProps) {
  const coil = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (coil.current && running) coil.current.rotation.z -= delta * 0.7;
  });

  return (
    <group>
      <mesh position={[0, 0.4, 0]} receiveShadow>
        <boxGeometry args={[2.2, 0.8, 2.2]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.5} roughness={0.65} />
      </mesh>
      {/* Coil */}
      <mesh ref={coil} position={[0, 1.9, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[1.15, 1.15, 1.5, 28, 1, true]} />
        <meshStandardMaterial
          color="#8a95a1"
          metalness={0.9}
          roughness={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Mandrel */}
      <mesh position={[0, 1.9, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 2.1, 12]} />
        <meshStandardMaterial color={STEEL_LIGHT} metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Strip peeling toward the leveller */}
      <mesh position={[1.6, 1.1, 0]} rotation={[0, 0, -0.42]}>
        <boxGeometry args={[2.2, 0.035, 1.3]} />
        <meshStandardMaterial color={PANEL_STEEL} metalness={0.85} roughness={0.25} />
      </mesh>
      <StatusBeacon y={3.4} color={color} running={running} />
    </group>
  );
}

/** Multi-roll straightener. Rollers spin while the line runs. */
export function LevellerMachine({ color, running }: MachineProps) {
  const rollers = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (rollers.current && running) {
      for (const child of rollers.current.children) child.rotation.z += delta * 4;
    }
  });

  return (
    <group>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[2.6, 1, 2.2]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.5} roughness={0.6} />
      </mesh>
      <group ref={rollers}>
        {[-0.8, -0.27, 0.27, 0.8].map((x, i) => (
          <mesh key={i} position={[x, 1.3 + (i % 2) * 0.24, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 1.8, 14]} />
            <meshStandardMaterial color={STEEL_LIGHT} metalness={0.9} roughness={0.22} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 2.05, 0]} castShadow>
        <boxGeometry args={[2.7, 0.5, 2.3]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.05, 1.17]}>
        <boxGeometry args={[2.7, 0.1, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={running ? 1.1 : 0.5} />
      </mesh>
      <StatusBeacon y={2.7} color={color} running={running} />
    </group>
  );
}

/** Wash-and-oil tunnel. */
export function WasherMachine({ color, running }: MachineProps) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 2.2, 2.4]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.45} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.32, 1.21]}>
        <boxGeometry args={[3.4, 0.1, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={running ? 1.1 : 0.5} />
      </mesh>
      {/* Tunnel mouth */}
      <mesh position={[1.72, 1.1, 0]}>
        <boxGeometry args={[0.08, 1.1, 1.7]} />
        <meshStandardMaterial color="#4a515a" />
      </mesh>
      <mesh position={[-1.72, 1.1, 0]}>
        <boxGeometry args={[0.08, 1.1, 1.7]} />
        <meshStandardMaterial color="#4a515a" />
      </mesh>
      <StatusBeacon y={2.75} color={color} running={running} />
    </group>
  );
}

/** Blank destacker: a stack of blanks and a swinging pick-up head. */
export function DestackerMachine({ spm, phase, color, running }: MachineProps) {
  const head = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!head.current) return;
    const stroke = strokeAt(state.clock.elapsedTime, spm, phase, running);
    head.current.position.y = 2.6 - stroke * 1.1;
  });

  return (
    <group>
      <mesh position={[0, 0.35, 0]} receiveShadow>
        <boxGeometry args={[2.2, 0.7, 2.2]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.5} roughness={0.65} />
      </mesh>
      {/* Stack of blanks */}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[0, 0.78 + i * 0.07, 0]}>
          <boxGeometry args={[1.7, 0.05, 1.5]} />
          <meshStandardMaterial color={PANEL_STEEL} metalness={0.85} roughness={0.25} />
        </mesh>
      ))}
      {/* Gantry */}
      <mesh position={[0, 3.3, 0]}>
        <boxGeometry args={[2.6, 0.18, 0.3]} />
        <meshStandardMaterial color={STEEL_LIGHT} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={head} position={[0, 2.6, 0]}>
        <boxGeometry args={[1.2, 0.24, 1.1]} />
        <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.4} />
      </mesh>
      <StatusBeacon y={3.7} color={color} running={running} />
    </group>
  );
}

/** Checking fixture under inspection lamps. */
export function InspectionMachine({ color, running }: MachineProps) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[3, 1, 2.4]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.4} roughness={0.7} />
      </mesh>
      {/* Fixture surface with the panel on it */}
      <mesh position={[0, 1.06, 0]}>
        <boxGeometry args={[2.4, 0.12, 1.9]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[1.9, 0.05, 1.4]} />
        <meshStandardMaterial color={PANEL_STEEL} metalness={0.9} roughness={0.16} />
      </mesh>

      {/* Inspection lamp gantry — high-contrast lighting for whetstone checks */}
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[3.2, 0.14, 0.22]} />
        <meshStandardMaterial color={STEEL_LIGHT} metalness={0.8} roughness={0.3} />
      </mesh>
      {[-1, 0, 1].map((x) => (
        <mesh key={x} position={[x, 2.94, 0]}>
          <boxGeometry args={[0.7, 0.12, 0.5]} />
          <meshStandardMaterial
            color="#e8e8e0"
            emissive="#ffffff"
            emissiveIntensity={running ? 1.4 : 0.2}
          />
        </mesh>
      ))}
      <StatusBeacon y={3.5} color={color} running={running} />
    </group>
  );
}

/** Racking bay: a returnable rack plus an articulated unload robot. */
export function RackingMachine({ spm, phase, color, running }: MachineProps) {
  const arm = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!arm.current) return;
    const stroke = strokeAt(state.clock.elapsedTime, spm, phase, running);
    arm.current.rotation.y = Math.sin(stroke * Math.PI) * 0.55;
  });

  return (
    <group>
      {/* Rack frame */}
      <mesh position={[0.6, 1.1, 0]}>
        <boxGeometry args={[2.2, 2.2, 2]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.4} roughness={0.7} wireframe />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.6, 0.45 + i * 0.52, 0]} rotation={[0, 0, 0.08]}>
          <boxGeometry args={[1.8, 0.05, 1.5]} />
          <meshStandardMaterial color={PANEL_STEEL} metalness={0.85} roughness={0.25} />
        </mesh>
      ))}

      {/* Robot */}
      <mesh position={[-1.6, 0.35, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.7, 14]} />
        <meshStandardMaterial color={STEEL_DARK} metalness={0.5} roughness={0.6} />
      </mesh>
      <group ref={arm} position={[-1.6, 0.7, 0]}>
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[0.34, 1.4, 0.34]} />
          <meshStandardMaterial color="#d97a26" metalness={0.35} roughness={0.6} />
        </mesh>
        <mesh position={[0.65, 1.35, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[1.5, 0.26, 0.26]} />
          <meshStandardMaterial color="#d97a26" metalness={0.35} roughness={0.6} />
        </mesh>
      </group>
      <StatusBeacon y={2.6} color={color} running={running} />
    </group>
  );
}

/** Andon beacon on top of every machine. */
function StatusBeacon({
  y,
  color,
  running,
}: {
  y: number;
  color: string;
  running: boolean;
}) {
  const light = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!light.current) return;
    const mat = light.current.material as THREE.MeshStandardMaterial;
    // Stopped equipment flashes; running equipment glows steadily.
    mat.emissiveIntensity = running
      ? 1.6
      : 0.5 + Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 2.4;
  });

  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
        <meshStandardMaterial color={STEEL_DARK} />
      </mesh>
      <mesh ref={light}>
        <sphereGeometry args={[0.17, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
      </mesh>
      <pointLight color={color} intensity={running ? 2.2 : 1.2} distance={4} decay={2} />
    </group>
  );
}

/**
 * Renders the machine for a station kind.
 *
 * A component rather than a factory that returns one: resolving the component
 * type during render would give each machine a fresh identity on every frame
 * and reset the refs its animation depends on.
 */
export function StationMachine({
  kind,
  ...props
}: MachineProps & { kind: StationKind }) {
  switch (kind) {
    case "decoiler":
      return <DecoilerMachine {...props} />;
    case "leveller":
      return <LevellerMachine {...props} />;
    case "washer_oiler":
      return <WasherMachine {...props} />;
    case "destacker":
      return <DestackerMachine {...props} />;
    case "inspection":
      return <InspectionMachine {...props} />;
    case "racking":
      return <RackingMachine {...props} />;
    default:
      return <PressMachine {...props} />;
  }
}

/** Approximate footprint along the line axis, used for layout spacing. */
export function footprintFor(kind: StationKind): number {
  switch (kind) {
    case "washer_oiler":
      return 4.2;
    case "decoiler":
      return 3.4;
    case "inspection":
    case "racking":
      return 4;
    default:
      return 4.6;
  }
}
