"use client"

import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { SLIDER_SCALE, type SliderKey } from "@/lib/match-report-scale"

// The slider status line is one of two micro-interaction spots called out
// for this app: re-mounting the description on every whole-point change
// (via `key`) lets the existing .animate-stagger-in keyframe crossfade it
// in instead of an abrupt text swap, while still updating on every drag tick.
export function MatchSliderField({
  sliderKey,
  value,
  onValueChange,
  rationale,
  onRationaleChange,
}: {
  sliderKey: SliderKey
  value: number
  onValueChange: (value: number) => void
  rationale: string
  onRationaleChange: (value: string) => void
}) {
  const config = SLIDER_SCALE[sliderKey]
  const rounded = Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5
  const rationaleId = `rationale-${sliderKey}`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={rationaleId} className="text-sm font-bold">
          {config.label}
        </Label>
        <span className="font-mono text-lg font-bold text-primary">{rounded}</span>
      </div>
      <Slider
        aria-label={config.label}
        min={1}
        max={5}
        step={1}
        value={[value]}
        onValueChange={(next) => onValueChange(Array.isArray(next) ? next[0] : next)}
      />
      <p
        key={rounded}
        className="animate-stagger-in min-h-10 text-sm text-muted-foreground transition-colors"
      >
        {config.points[rounded]}
      </p>
      <Textarea
        id={rationaleId}
        placeholder={config.rationalePrompt}
        value={rationale}
        onChange={(e) => onRationaleChange(e.target.value)}
        rows={2}
      />
    </div>
  )
}
