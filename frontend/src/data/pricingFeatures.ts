/**
 * Feature comparison matrix for pricing surfaces.
 */
export type PricingColumnId =
  | "free"
  | "single"
  | "topup"
  | "basic"
  | "premium"
  | "studio";

export interface PricingFeatureRow {
  label: string;
  values: Record<PricingColumnId, string | boolean>;
}

export const PRICING_FEATURE_ROWS: PricingFeatureRow[] = [
  {
    label: "Monthly minutes",
    values: {
      free: "5 min/mo + 10 min welcome",
      single: "4 min one-time",
      topup: "60 min one-time",
      basic: "120 min/mo",
      premium: "300 min/mo",
      studio: "800 min/mo",
    },
  },
  {
    label: "2-stem speed split",
    values: {
      free: true,
      single: true,
      topup: true,
      basic: true,
      premium: true,
      studio: true,
    },
  },
  {
    label: "4-stem split",
    values: {
      free: false,
      single: false,
      topup: true,
      basic: false,
      premium: true,
      studio: true,
    },
  },
  {
    label: "Quality split mode",
    values: {
      free: false,
      single: false,
      topup: true,
      basic: false,
      premium: true,
      studio: true,
    },
  },
  {
    label: "Batch queue",
    values: {
      free: false,
      single: false,
      topup: true,
      basic: false,
      premium: true,
      studio: true,
    },
  },
  {
    label: "Mixer & export",
    values: {
      free: true,
      single: true,
      topup: true,
      basic: true,
      premium: true,
      studio: true,
    },
  },
  {
    label: "Audio-to-MIDI & vocal cleanup",
    values: {
      free: true,
      single: true,
      topup: true,
      basic: true,
      premium: true,
      studio: true,
    },
  },
  {
    label: "Token rollover",
    values: {
      free: "No (monthly free resets)",
      single: "Until used",
      topup: "Until used",
      basic: "Yes",
      premium: "Yes",
      studio: "Yes",
    },
  },
];

export const PRICING_COLUMNS: { id: PricingColumnId; label: string; highlight?: boolean }[] = [
  { id: "free", label: "Free" },
  { id: "single", label: "Single" },
  { id: "topup", label: "Top-Up" },
  { id: "basic", label: "Basic" },
  { id: "premium", label: "Premium", highlight: true },
  { id: "studio", label: "Studio" },
];
