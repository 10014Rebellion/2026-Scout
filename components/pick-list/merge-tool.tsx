"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { RequireAdmin } from "@/components/require-admin"
import { RequireScoutIdentity } from "@/components/require-scout-identity"
import { useScoutIdentity } from "@/lib/use-scout-identity"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { GitMerge } from "lucide-react"

export function MergeTool({ eventId }: { eventId: Id<"events"> }) {
  return (
    <RequireAdmin>
      <RequireScoutIdentity>
        <MergeToolInner eventId={eventId} />
      </RequireScoutIdentity>
    </RequireAdmin>
  )
}

function MergeToolInner({ eventId }: { eventId: Id<"events"> }) {
  const { scoutId } = useScoutIdentity()
  const latestMerge = useQuery(api.pickListMerges.latest)
  const runMerge = useMutation(api.pickListMerges.runMerge)
  const [open, setOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  async function handleConfirm() {
    if (!scoutId) return
    setIsRunning(true)
    try {
      const result = await runMerge({ eventId, triggeredBy: scoutId })
      toast.success(
        `Merged ${result.participatingScoutCount} scouts' lists into ${result.teamCount} teams`,
      )
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed")
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {latestMerge && (
        <p className="hidden text-xs text-muted-foreground sm:block">
          Last merged by {latestMerge.triggeredByName} &middot;{" "}
          {new Date(latestMerge.triggeredAt).toLocaleString()}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="secondary" size="sm">
              <GitMerge data-icon="inline-start" />
              Merge scout lists into Primary
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite the Primary pick list?</DialogTitle>
            <DialogDescription>
              This replaces every team&apos;s tier in the Primary list with a
              consensus ranking computed from every scout&apos;s personal
              list. This can&apos;t be undone, though you can re-run the
              merge again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isRunning}>
              {isRunning ? "Merging..." : "Overwrite Primary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
