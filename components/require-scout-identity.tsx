"use client"

import { ReactNode } from "react"
import { useScoutIdentity } from "@/lib/use-scout-identity"
import { Button } from "@/components/ui/button"

// Gate for scout-facing screens (pit/match scouting, personal pick list)
// that need to know which real person is acting, on top of the shared
// "scout" PIN session. Admin-only screens don't need this.
export function RequireScoutIdentity({ children }: { children: ReactNode }) {
  const { scouts, scoutId, isLoading, setScout } = useScoutIdentity()

  if (isLoading) {
    return null
  }

  if (scoutId === null) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-medium">Who are you?</h1>
          <p className="text-sm text-muted-foreground">
            Pick your name so your reports are credited correctly.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {scouts?.map((scout) => (
            <Button
              key={scout._id}
              variant="outline"
              size="lg"
              onClick={() => setScout(scout._id)}
            >
              {scout.name}
            </Button>
          ))}
          {scouts?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No scouts have been added yet. Ask an admin to add you on the
              Scout Assignment page.
            </p>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
