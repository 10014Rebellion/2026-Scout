import { Users } from "lucide-react"
import { PlaceholderPage } from "@/components/placeholder-page"

export default function TeamsPage() {
  return (
    <PlaceholderPage
      title="Team List"
      description="This will show every team at the active event, pulled from The Blue Alliance, with quick access to each team's pit and match scouting history."
      icon={Users}
    />
  )
}
