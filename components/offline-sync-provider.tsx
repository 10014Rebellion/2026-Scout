"use client"

import { useEffect, useRef } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { useUiStore } from "@/lib/store/ui-store"
import { peekQueue, removeFromQueue, refreshQueuedCount } from "@/lib/offline-queue"

// Mounted once near the root so the queue drains automatically no matter
// which scout-facing form actually created the entries -- a scout who
// queued a submission on a bad connection and then navigated away should
// still see it sync in the background.
export function OfflineSyncProvider() {
  const setOnline = useUiStore((state) => state.setOnline)
  const isOnline = useUiStore((state) => state.isOnline)
  const queuedCount = useUiStore((state) => state.queuedCount)
  const submitPitReport = useMutation(api.pitReports.submit)
  const submitMatchReport = useMutation(api.matchReports.submit)
  const isFlushingRef = useRef(false)

  useEffect(() => {
    refreshQueuedCount()
    setOnline(navigator.onLine)
    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [setOnline])

  useEffect(() => {
    async function flush() {
      if (isFlushingRef.current || !isOnline) {
        return
      }
      const queue = peekQueue()
      if (queue.length === 0) {
        return
      }
      isFlushingRef.current = true
      let syncedCount = 0
      for (const item of queue) {
        try {
          if (item.kind === "pitReport") {
            await submitPitReport(item.payload)
          } else {
            await submitMatchReport(item.payload)
          }
          removeFromQueue(item.id)
          syncedCount += 1
        } catch {
          // A flaky connection can drop a mutation mid-flight -- stop here
          // and retry the rest on the next tick/online event rather than
          // reordering or silently discarding what's left.
          break
        }
      }
      isFlushingRef.current = false
      if (syncedCount > 0) {
        toast.success(
          syncedCount === 1
            ? "1 queued report synced"
            : `${syncedCount} queued reports synced`,
        )
      }
    }

    void flush()
    const interval = setInterval(() => void flush(), 15000)
    return () => clearInterval(interval)
    // Re-running on queuedCount changes lets a newly queued item get an
    // immediate sync attempt instead of waiting for the next poll tick.
  }, [isOnline, queuedCount, submitPitReport, submitMatchReport])

  return null
}
