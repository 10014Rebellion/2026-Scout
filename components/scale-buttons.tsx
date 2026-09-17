"use client"

import { cn } from "@/lib/utils"

// Compact segmented control for small bounded integer scales (1-4, 1-5,
// 0-3). Used instead of a bare number input so this is a single tap on a
// phone rather than typing, and instead of a slider since these are
// pit-scouting claims, not the live-drag ratings on the match report form.
export function ScaleButtons({
  min,
  max,
  value,
  onChange,
  labels,
  ariaLabel,
}: {
  min: number
  max: number
  value: number | undefined
  onChange: (value: number) => void
  labels?: Record<number, string>
  ariaLabel: string
}) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex h-11 min-w-11 flex-1 items-center justify-center rounded-md border border-border font-mono text-sm font-semibold transition-colors",
            value === option
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-foreground hover:bg-accent",
          )}
        >
          {labels?.[option] ?? option}
        </button>
      ))}
    </div>
  )
}
