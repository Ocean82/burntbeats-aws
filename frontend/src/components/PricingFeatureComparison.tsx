import { Check, Minus } from "lucide-react";
import {
  PRICING_COLUMNS,
  PRICING_FEATURE_ROWS,
  type PricingColumnId,
} from "../data/pricingFeatures";
import { cn } from "../utils/cn";

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-success-300" aria-label="Included" />
    ) : (
      <Minus className="mx-auto h-4 w-4 text-muted-foreground/60" aria-label="Not included" />
    );
  }
  return <span className="text-xs leading-snug text-secondary-foreground">{value}</span>;
}

interface PricingFeatureComparisonProps {
  /** Hide Studio column in compact hero views */
  hideStudio?: boolean;
  highlightColumn?: PricingColumnId;
}

export function PricingFeatureComparison({
  hideStudio = false,
  highlightColumn = "premium",
}: PricingFeatureComparisonProps) {
  const columns = hideStudio
    ? PRICING_COLUMNS.filter((c) => c.id !== "studio")
    : PRICING_COLUMNS;

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-border"
      data-testid="pricing-feature-comparison"
    >
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Feature
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  "px-sm py-sm text-center text-xs font-semibold uppercase tracking-wide",
                  col.id === highlightColumn
                    ? "bg-primary-500/15 text-primary-100"
                    : "text-muted-foreground",
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PRICING_FEATURE_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-border/60 last:border-0">
              <td className="px-md py-sm text-secondary-foreground">{row.label}</td>
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={cn(
                    "px-sm py-sm text-center align-middle",
                    col.id === highlightColumn && "bg-primary-500/8",
                  )}
                >
                  <CellValue value={row.values[col.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
