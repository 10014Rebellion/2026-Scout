import Link from "next/link"
import { Users, Wrench, FlagTriangleRight, Kanban, Sparkles } from "lucide-react"

const quickLinks = [
  { label: "Team List", href: "/teams", icon: Users },
  { label: "Pit Scouting", href: "/pit-scouting", icon: Wrench },
  { label: "Match Scouting", href: "/match-scouting", icon: FlagTriangleRight },
  { label: "Pick List", href: "/pick-list", icon: Kanban },
  { label: "AI Analysis", href: "/ai-analysis", icon: Sparkles },
]

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Team 10014 Scouting</h1>
        <p className="text-sm text-muted-foreground">
          Pick a workspace below to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {quickLinks.map(({ label, href, icon: Icon }, index) => (
          <Link
            key={href}
            href={href}
            className="animate-stagger-in panel-depth group flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary"
            style={{ animationDelay: `${100 + index * 60}ms` }}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-transform group-hover:scale-105">
              <Icon className="size-5" />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
