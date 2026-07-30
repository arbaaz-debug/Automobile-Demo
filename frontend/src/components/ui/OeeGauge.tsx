import type { OeeBreakdown } from "@/domain/stamping/types";
import { OEE_BANDS, bandForOee } from "@/domain/stamping/oee";
import { BAND_COLOR, BAND_LABEL, COLORS } from "@/lib/theme";
import { fmtPct } from "@/lib/format";
import { Meter } from "./StatTile";

/**
 * OEE as a single arc with the three multiplicands beneath it.
 *
 * The arc carries one number, so it needs no legend; the A/P/Q meters below are
 * direct-labelled with their own names and values rather than relying on colour.
 * A world-class reference tick sits at 85% so the reading has a target to sit
 * against instead of floating in the abstract.
 */
export function OeeGauge({
  oee,
  size = 168,
  showComponents = true,
}: {
  oee: OeeBreakdown;
  size?: number;
  showComponents?: boolean;
}) {
  const band = bandForOee(oee.oee);
  const color = BAND_COLOR[band];

  const stroke = 12;
  const radius = (size - stroke) / 2;
  // 240° sweep, opening downward — a classic gauge silhouette.
  const sweep = 240;
  const startAngle = 150;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (sweep / 360) * circumference;

  const targetAngle = startAngle + OEE_BANDS.worldClass * sweep;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size * 0.78 }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute left-0 top-0"
          role="img"
          aria-label={`Overall equipment effectiveness ${fmtPct(oee.oee)}, ${BAND_LABEL[band]}`}
        >
          <g transform={`rotate(${startAngle} ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={COLORS.surface3}
              strokeWidth={stroke}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={`${arcLength * Math.min(1, oee.oee)} ${circumference}`}
              strokeLinecap="round"
              className="transition-[stroke-dasharray] duration-700"
            />
          </g>

          {/* World-class reference tick at 85%. */}
          <g transform={`rotate(${targetAngle} ${size / 2} ${size / 2})`}>
            <line
              x1={size / 2 - radius - stroke / 2 - 2}
              y1={size / 2}
              x2={size / 2 - radius + stroke / 2 + 2}
              y2={size / 2}
              stroke={COLORS.textPrimary}
              strokeWidth={2}
              opacity={0.55}
            />
          </g>
        </svg>

        <div className="absolute inset-x-0 top-[30%] flex flex-col items-center">
          <span
            className="text-[32px] font-semibold leading-none tracking-tight"
            style={{ color }}
          >
            {fmtPct(oee.oee)}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            OEE
          </span>
          <span className="mt-1.5 text-[10px] text-[var(--text-secondary)]">
            {BAND_LABEL[band]} · target 85%
          </span>
        </div>
      </div>

      {showComponents ? (
        <div className="mt-1 w-full space-y-2.5">
          <Component label="Availability" value={oee.availability} color={COLORS.textSecondary} />
          <Component label="Performance" value={oee.performance} color={COLORS.textSecondary} />
          <Component label="Quality" value={oee.quality} color={COLORS.textSecondary} />
        </div>
      ) : null}
    </div>
  );
}

function Component({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="tabular font-medium text-[var(--text-primary)]">{fmtPct(value)}</span>
      </div>
      <Meter value={value} color={color} label={label} height={4} />
    </div>
  );
}
