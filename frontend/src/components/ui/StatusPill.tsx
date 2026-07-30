import { STATUS_STYLE } from "@/lib/theme";
import type { StationStatus } from "@/domain/stamping/types";
import { cn } from "@/lib/format";

/**
 * Equipment status indicator.
 *
 * Status colour never carries meaning alone — the glyph and the text label are
 * always rendered, so the control is legible in greyscale, under colour-vision
 * deficiency and in forced-colors mode.
 */
export function StatusPill({
  status,
  size = "md",
  showLabel = true,
}: {
  status: StationStatus;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const style = STATUS_STYLE[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
      )}
      style={{
        borderColor: `${style.color}66`,
        backgroundColor: `${style.color}1a`,
        color: style.text,
      }}
    >
      <span
        aria-hidden
        className={cn("leading-none", status === "running" && "pulse-dot")}
        style={{ fontSize: size === "sm" ? 8 : 9 }}
      >
        {style.glyph}
      </span>
      {showLabel ? <span className="whitespace-nowrap">{style.label}</span> : null}
      {!showLabel ? <span className="sr-only">{style.label}</span> : null}
    </span>
  );
}

/** Compact dot for dense grids, with an accessible name. */
export function StatusDot({ status }: { status: StationStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      role="img"
      aria-label={style.label}
      title={style.label}
      className={cn("inline-block size-2 rounded-full", status === "running" && "pulse-dot")}
      style={{ backgroundColor: style.color }}
    />
  );
}
