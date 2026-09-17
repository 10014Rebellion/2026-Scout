"use client"

import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"

const STORAGE_KEY = "scout-identity"

// There's no per-scout Convex Auth identity in the shared-PIN model, so
// "who am I" is a per-device convenience stored in localStorage, not a
// security boundary -- validated against the live roster in case the
// admin removed that scout since it was picked.
export function useScoutIdentity() {
  const scouts = useQuery(api.scouts.list)
  const [scoutId, setScoutIdState] = useState<Id<"scouts"> | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // Deliberately reading localStorage post-mount (not a lazy useState
  // initializer) to avoid an SSR/client hydration mismatch, since the
  // server has no access to this client-only value.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setScoutIdState(stored as Id<"scouts">)
      }
    } catch {
      // localStorage unavailable (private mode, etc.) -- fall through to picker
    }
    setIsHydrated(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  function setScout(id: Id<"scouts">) {
    setScoutIdState(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // best-effort only
    }
  }

  function clearScout() {
    setScoutIdState(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // best-effort only
    }
  }

  const currentScout = scouts?.find((s) => s._id === scoutId) ?? null
  const isLoading = !isHydrated || scouts === undefined
  const needsSelection = !isLoading && scoutId !== null && currentScout === null

  return {
    scouts,
    scoutId: currentScout ? scoutId : null,
    scoutName: currentScout?.name ?? null,
    isLoading,
    needsSelection,
    setScout,
    clearScout,
  }
}
