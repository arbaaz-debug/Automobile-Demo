/** Number, duration and unit formatting. Indian locale conventions throughout. */

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-IN", opts);

const int = nf({ maximumFractionDigits: 0 });
const one = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const two = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtInt(value: number): string {
  return int.format(Math.round(value));
}

export function fmtDec(value: number, digits: 1 | 2 = 1): string {
  return (digits === 1 ? one : two).format(value);
}

/** Compact form for headline tiles: 12.4k, 1.2M. */
export function fmtCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${one.format(value / 1_000_000)}M`;
  if (abs >= 10_000) return `${one.format(value / 1000)}k`;
  return int.format(Math.round(value));
}

/** 0..1 -> "84.2%" */
export function fmtPct(ratio: number, digits: 0 | 1 = 1): string {
  return `${(digits === 1 ? one : int).format(ratio * 100)}%`;
}

/** Already-scaled percentage value -> "84.2%" */
export function fmtPctValue(value: number, digits: 0 | 1 = 1): string {
  return `${(digits === 1 ? one : int).format(value)}%`;
}

export function fmtSigned(value: number, digits: 0 | 1 = 1): string {
  const s = (digits === 1 ? one : int).format(Math.abs(value));
  if (value > 0) return `+${s}`;
  if (value < 0) return `−${s}`;
  return s;
}

export function fmtEnergy(kwh: number): string {
  if (kwh >= 1000) return `${one.format(kwh / 1000)} MWh`;
  return `${int.format(Math.round(kwh))} kWh`;
}

export function fmtPower(kw: number): string {
  if (kw >= 1000) return `${one.format(kw / 1000)} MW`;
  return `${int.format(Math.round(kw))} kW`;
}

/** Indian rupee, with lakh/crore grouping for large values. */
export function fmtInr(amount: number): string {
  if (amount >= 10_000_000) return `₹${one.format(amount / 10_000_000)} Cr`;
  if (amount >= 100_000) return `₹${one.format(amount / 100_000)} L`;
  return `₹${int.format(Math.round(amount))}`;
}

export function fmtMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return fmtMinutes(seconds / 60);
}

export function fmtTonnes(tonnes: number): string {
  return `${int.format(Math.round(tonnes))} T`;
}

export function fmtTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

export function fmtDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

/** "3 h ago", "12 min ago" — for alarm timestamps. */
export function fmtRelative(epochMs: number, now: number): string {
  const diffMin = Math.max(0, Math.round((now - epochMs) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Today's production date in IST, as YYYY-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
  return ist.toISOString().slice(0, 10);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
