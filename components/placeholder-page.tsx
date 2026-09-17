import { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  children?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in panel-depth flex flex-col gap-3 rounded-lg border border-border p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Icon className="size-5" />
          </span>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <span className="w-fit rounded-full bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
          Coming soon
        </span>
        {children}
      </div>
    </div>
  )
}
