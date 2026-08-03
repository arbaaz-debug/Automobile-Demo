"use client";

/**
 * Interactive 3D visualisation of a press line.
 *
 * The scene is driven entirely by the live snapshot: machine layout comes from
 * the line's station list, ram speed from each station's measured SPM, beacon
 * colour from its status, and the panels travelling between machines from the
 * line's throughput. Clicking a machine selects that station.
 */

import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { LineSnapshot, StationSnapshot } from "@/domain/stamping/types";
import { SKU_BY_ID, STATION_KIND_LABEL } from "@/domain/stamping/catalog";
import { STATUS_STYLE } from "@/lib/theme";
import { fmtInt, fmtDec } from "@/lib/format";
import { FLOOR, PANEL_STEEL, STEEL_DARK, StationMachine, footprintFor } from "./machines";

const GAP = 1.6;

export function PressLineScene({
  line,
  selectedStationId,
  onSelectStation,
  className,
}: {
  line: LineSnapshot;
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  className?: string;
}) {
  // Lay the stations out along the X axis using their footprints.
  const layout = useMemo(() => {
    const widths = line.stations.map((s) => footprintFor(s.def.kind));
    const total = widths.reduce((a, w) => a + w, 0) + GAP * (widths.length - 1);

    // Cumulative offset of each station, centred so the line straddles origin.
    const offsets = widths.reduce<number[]>((acc, w, i) => {
      const start = i === 0 ? 0 : acc[i - 1] + widths[i - 1] + GAP;
      acc.push(start);
      return acc;
    }, []);

    return {
      items: line.stations.map((station, i) => ({
        station,
        width: widths[i],
        x: offsets[i] + widths[i] / 2 - total / 2,
      })),
      length: total,
    };
  }, [line.stations]);

  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 1.8]}
        // Framed off the line's own length so a 4-station blanking line and an
        // 11-station tandem line both fill the viewport.
        camera={{
          position: [-layout.length * 0.03, layout.length * 0.2, layout.length * 0.63],
          fov: 42,
        }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#16294a"]} />
        <fog attach="fog" args={["#16294a", layout.length * 1.15, layout.length * 2.6]} />

        <Suspense fallback={null}>
          <Lighting length={layout.length} />
          <Floor length={layout.length} />

          {layout.items.map(({ station, x }, index) => (
            <StationNode
              key={station.stationId}
              station={station}
              x={x}
              index={index}
              selected={station.stationId === selectedStationId}
              isBottleneck={station.stationId === line.bottleneckStationId}
              onSelect={() => onSelectStation(station.stationId)}
            />
          ))}

          <PanelFlow layout={layout.items} lineStatus={line.status} />

          {/* Contact shadows read as grime on a dark floor, so they are much
              lighter here than they would be on a pale shop floor. */}
          <ContactShadows
            position={[0, 0.03, 0]}
            opacity={0.28}
            scale={layout.length * 1.4}
            blur={2.6}
            far={10}
            color="#000814"
          />
          {/* "warehouse" over "city": an interior IBL, so the machines pick up
              the reflections of a lit hall rather than a bright open sky. */}
          <Environment preset="warehouse" environmentIntensity={0.42} />
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan
          minDistance={10}
          maxDistance={layout.length * 1.6}
          maxPolarAngle={Math.PI / 2.15}
          target={[0, 3.2, 0]}
        />
      </Canvas>
    </div>
  );
}

function Lighting({ length }: { length: number }) {
  // High-bay fixtures spaced down the line, as in a real press shop.
  const bays = Math.max(2, Math.round(length / 12));

  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#dce8f7", "#1d3a66", 0.55]} />
      <directionalLight
        position={[length * 0.4, length * 0.55, length * 0.42]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-length}
        shadow-camera-right={length}
        shadow-camera-top={length * 0.6}
        shadow-camera-bottom={-length * 0.6}
      />
      <directionalLight
        position={[-length * 0.5, length * 0.4, -length * 0.35]}
        intensity={0.6}
        color="#7fa8dd"
      />
      {Array.from({ length: bays }).map((_, i) => {
        const x = -length / 2 + ((i + 0.5) * length) / bays;
        return (
          <pointLight
            key={i}
            position={[x, 11, 0]}
            intensity={16}
            distance={20}
            decay={2}
            color="#ffffff"
          />
        );
      })}
    </>
  );
}

function Floor({ length }: { length: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[length * 2.2, 46]} />
        <meshStandardMaterial color={FLOOR} roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Bay grid, recessive — spatial reference, not decoration. */}
      <gridHelper
        args={[length * 2.2, Math.round(length / 2), "#33528a", "#2a4a7d"]}
        position={[0, 0.008, 0]}
      />

      {/* Safety walkway markings either side of the line. */}
      {[-5.2, 5.2].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]}>
          <planeGeometry args={[length + 6, 0.22]} />
          <meshBasicMaterial color="#e0a800" />
        </mesh>
      ))}

      {/* Material-flow arrow down the centre of the line. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <planeGeometry args={[length + 4, 0.08]} />
        <meshBasicMaterial color="#4a6fa5" />
      </mesh>
    </group>
  );
}

function StationNode({
  station,
  x,
  index,
  selected,
  isBottleneck,
  onSelect,
}: {
  station: StationSnapshot;
  x: number;
  index: number;
  selected: boolean;
  isBottleneck: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const style = STATUS_STYLE[station.status];
  const running = station.status === "running";
  const sku = station.currentSkuId ? SKU_BY_ID.get(station.currentSkuId) : null;

  return (
    <group
      position={[x, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <StationMachine
        kind={station.def.kind}
        spm={station.spm}
        phase={index * 0.8}
        color={style.color}
        running={running}
      />

      {/* Selection / hover ring on the floor. */}
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[2.3, 2.55, 40]} />
          <meshBasicMaterial
            color={selected ? "#3987e5" : "#8fa3c0"}
            transparent
            opacity={selected ? 0.95 : 0.5}
          />
        </mesh>
      )}

      {/* Op-code plate on the floor in front of every machine. */}
      <Html
        position={[0, -0.02, 3.1]}
        center
        distanceFactor={16}
        occlude={false}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            padding: "2px 7px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
            color: selected ? "#ffffff" : "#c6d5ea",
            background: selected ? "rgba(57,135,229,0.96)" : "rgba(22,41,74,0.92)",
            border: `1px solid ${selected ? "#3987e5" : "rgba(255,255,255,0.18)"}`,
          }}
        >
          {station.def.opCode}
        </div>
      </Html>

      {/* Detail card on hover or selection. */}
      {(hovered || selected) && (
        <Html position={[0, 7.4, 0]} center distanceFactor={15} style={{ pointerEvents: "none" }}>
          <div
            style={{
              minWidth: 190,
              padding: "8px 10px",
              borderRadius: 6,
              background: "rgba(27,51,88,0.97)",
              border: "1px solid rgba(11,11,11,0.16)",
              boxShadow: "0 10px 26px rgba(11,11,11,0.18)",
              fontSize: 11,
              lineHeight: 1.45,
              color: "#ffffff",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2, color: "#ffffff" }}>
              {STATION_KIND_LABEL[station.def.kind]}
            </div>
            <div style={{ color: "#93a8c6", marginBottom: 5 }}>{station.def.name}</div>
            <Row label="Status" value={`${style.glyph} ${style.label}`} color={style.color} />
            <Row label="Rate" value={running ? `${fmtDec(station.spm)} SPM` : "—"} />
            <Row label="Count" value={fmtInt(station.count)} />
            <Row label="Health" value={`${fmtDec(station.health.healthIndex, 1)} / 100`} />
            {sku ? <Row label="Panel" value={sku.shortName} /> : null}
            {isBottleneck ? (
              <div style={{ marginTop: 4, color: "#fab219", fontWeight: 600 }}>
                ▲ Line bottleneck
              </div>
            ) : null}
          </div>
        </Html>
      )}

      {/* Bottleneck marker, visible without hovering. */}
      {isBottleneck && !selected ? (
        <mesh position={[0, 6.4, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.28, 0.6, 4]} />
          <meshStandardMaterial color="#c98500" emissive="#eda100" emissiveIntensity={0.55} />
        </mesh>
      ) : null}
    </group>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ color: "#93a8c6" }}>{label}</span>
      <span style={{ color: color ?? "#ffffff", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Panels travelling between machines.
 *
 * A fixed pool of blanks cycles down the line; each one grows a formed profile
 * after it passes the draw press so the transformation from flat blank to
 * shaped panel is visible.
 */
function PanelFlow({
  layout,
  lineStatus,
}: {
  layout: { station: StationSnapshot; x: number }[];
  lineStatus: string;
}) {
  const group = useRef<THREE.Group>(null);
  const count = Math.max(2, layout.length - 1);

  const startX = layout[0]?.x ?? -10;
  const endX = layout[layout.length - 1]?.x ?? 10;
  const span = endX - startX;

  const drawIndex = layout.findIndex(
    (l) => l.station.def.kind === "draw" || l.station.def.kind === "blanking",
  );
  const drawX = drawIndex >= 0 ? layout[drawIndex].x : startX;

  useFrame((state) => {
    if (!group.current) return;
    const running = lineStatus === "running";
    const t = running ? state.clock.elapsedTime * 0.11 : 0;

    group.current.children.forEach((child, i) => {
      const progress = ((t + i / count) % 1 + 1) % 1;
      const x = startX + progress * span;
      child.position.x = x;
      child.position.y = 1.45;
      // Panels lift slightly clear of the die between stations.
      child.visible = running || i % 2 === 0;

      const formed = x > drawX;
      // A drawn panel is deeper and slightly narrower than the flat blank.
      child.scale.set(1, formed ? 7 : 1, formed ? 0.88 : 1);
      child.rotation.z = formed ? 0.06 : 0;
    });
  });

  return (
    <group ref={group}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} castShadow>
          <boxGeometry args={[1.8, 0.05, 1.5]} />
          <meshStandardMaterial
            color={PANEL_STEEL}
            metalness={0.88}
            roughness={0.16}
            envMapIntensity={1.4}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Conveyor plinths between machines — purely spatial context. */
export function LinePlinth({ length }: { length: number }) {
  return (
    <mesh position={[0, 0.08, 0]} receiveShadow>
      <boxGeometry args={[length, 0.16, 1.6]} />
      <meshStandardMaterial color={STEEL_DARK} metalness={0.4} roughness={0.7} />
    </mesh>
  );
}
