"use client"

import { ReactNode } from "react"
import { useRole } from "@/lib/use-role"

export function RequireAdmin({ children }: { children: ReactNode }) {
  const role = useRole()

  if (role === undefined) {
    return null
  }

  if (role !== "admin") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <p className="text-muted-foreground text-sm">
          This page is only available to admins.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
