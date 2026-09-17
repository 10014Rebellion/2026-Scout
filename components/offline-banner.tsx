"use client"

import { WifiOff, RefreshCw } from "lucide-react"
import { useUiStore } from "@/lib/store/ui-store"

// Persistent, unmissable banner (not a toast) -- a scout must never wonder
// whether a report actually saved. Shown whenever offline OR whenever a
// prior submission is still sitting in the local queue, even after
// connectivity returns, until that queue actually drains.
export function OfflineBanner() {
  const isOnline = useUiStore((state) => state.isOnline)
  const queuedCount = useUiStore((state) => state.queuedCount)

  if (isOnline && queuedCount === 0) {
    return null
  }

  const message = !isOnline
    ? queuedCount > 0
      ? `Offline -- ${queuedCount} report${queuedCount === 1 ? "" : "s"} saved on this device, will submit when back online`
      : "Offline -- reports will be saved on this device and submitted when back online"
    : `Reconnected -- syncing ${queuedCount} saved report${queuedCount === 1 ? "" : "s"}...`

  return (
    <div className="sticky top-0 z-50 w-full" role="status" aria-live="polite">
      <div className="caution-stripes h-1 w-full" />
      <div className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-xs font-semibold text-warning-foreground">
        {isOnline ? (
          <RefreshCw className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <WifiOff className="size-3.5 shrink-0" />
        )}
        <span>{message}</span>
      </div>
    </div>
  )
}
