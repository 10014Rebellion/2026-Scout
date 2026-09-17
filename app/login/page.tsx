"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function LoginPage() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [role, setRole] = useState<"scout" | "admin">("scout")
  const [pin, setPin] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await signIn("pin", { role, pin })
      router.push("/")
    } catch {
      toast.error("Incorrect PIN")
      setPin("")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-6">
      <div className="caution-stripes fixed inset-x-0 top-0 h-1.5" />
      <form
        onSubmit={handleSubmit}
        className="panel-depth animate-stagger-in flex w-full max-w-xs flex-col gap-6 rounded-lg border border-sidebar-border bg-card p-8"
      >
        <div className="flex flex-col gap-1 text-center">
          <h1 className="font-heading text-2xl font-black tracking-tight">
            Team 10014 Scouting
          </h1>
          <p className="text-sm text-muted-foreground">Enter the team PIN to continue</p>
        </div>

        <Tabs value={role} onValueChange={(value) => setRole(value as "scout" | "admin")}>
          <TabsList className="w-full">
            <TabsTrigger value="scout" className="flex-1">
              Scout
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex-1">
              Admin
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pin">PIN</Label>
          <Input
            id="pin"
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            className="text-center font-mono text-2xl tracking-[0.5em]"
            maxLength={8}
          />
        </div>

        <Button type="submit" disabled={isSubmitting || pin.length === 0} size="lg">
          {isSubmitting ? "Checking..." : "Sign in"}
        </Button>
      </form>
    </div>
  )
}
