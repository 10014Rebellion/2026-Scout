"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

export function useRole() {
  return useQuery(api.auth.currentRole)
}
