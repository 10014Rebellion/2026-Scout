"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import {
  Users,
  Wrench,
  FlagTriangleRight,
  Kanban,
  Sparkles,
  Settings,
  Shuffle,
  LogOut,
  Menu,
  ExternalLink,
  type LucideIcon,
} from "lucide-react"

import { useRole } from "@/lib/use-role"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { label: "Team List", href: "/teams", icon: Users },
  { label: "Pit Scouting", href: "/pit-scouting", icon: Wrench },
  { label: "Match Scouting", href: "/match-scouting", icon: FlagTriangleRight },
  { label: "Pick List", href: "/pick-list", icon: Kanban },
  { label: "AI Analysis", href: "/ai-analysis", icon: Sparkles },
  { label: "Event Setup", href: "/event-setup", icon: Settings, adminOnly: true },
  { label: "Scout Assignment", href: "/scout-assignment", icon: Shuffle, adminOnly: true },
]

export function AppShell({ children }: { children: ReactNode }) {
  const role = useRole()
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen)
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  const visibleItems = navItems.filter((item) => !item.adminOnly || role === "admin")

  return (
    <div className="flex min-h-svh w-full">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <SidebarContent items={visibleItems} />
      </aside>

      <Sheet open={isSidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-72"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent items={visibleItems} onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="caution-stripes h-1 w-full shrink-0" />
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu />
          </Button>
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            10014 Scout
          </span>
        </div>
        <main className="min-w-0 flex-1 bg-background">{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({
  items,
  onNavigate,
}: {
  items: NavItem[]
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuthActions()

  async function handleSignOut() {
    onNavigate?.()
    await signOut()
    router.push("/login")
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-0.5 border-b border-sidebar-border px-4 py-5">
        <span className="font-heading text-xl font-black tracking-tight">10014 Scout</span>
        <span className="text-xs text-sidebar-foreground/60">FRC Scouting System</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <li
                key={item.href}
                className="animate-stagger-in"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  data-active={isActive}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 border-t border-sidebar-border px-4 py-4">
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
        <a
          href="https://www.thebluealliance.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
        >
          Powered by The Blue Alliance
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  )
}
