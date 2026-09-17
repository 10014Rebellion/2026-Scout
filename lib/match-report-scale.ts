// Point-by-point descriptions shown under each match report slider. Kept as
// one editable config so scale wording can be tuned during an event without
// touching component code.
export type SliderKey =
  | "teleopScoring"
  | "autoScoring"
  | "defense"
  | "reliability"
  | "strategy"
  | "driverSkill"
  | "confidence"

export const SLIDER_ORDER: SliderKey[] = [
  "autoScoring",
  "teleopScoring",
  "defense",
  "reliability",
  "strategy",
  "driverSkill",
  "confidence",
]

export const SLIDER_SCALE: Record<
  SliderKey,
  { label: string; rationalePrompt: string; points: Record<1 | 2 | 3 | 4 | 5, string> }
> = {
  autoScoring: {
    label: "Auto Scoring",
    rationalePrompt: "What did their auto routine actually do?",
    points: {
      1: "Did not move or scored no FUEL in auto",
      2: "Moved but only scored a cycle or two of FUEL",
      3: "Reliable single-cycle auto into the HUB",
      4: "Multi-cycle auto with consistent HUB scoring",
      5: "Max-effort auto: full FUEL cycling plus reached Level 1",
    },
  },
  teleopScoring: {
    label: "Teleop Scoring",
    rationalePrompt: "How did their FUEL output look through the match?",
    points: {
      1: "Did not score in teleop",
      2: "Occasional cycles, mostly idle",
      3: "Steady cycling at a moderate pace",
      4: "Fast, consistent cycling most of the match",
      5: "Constant high-value cycling, a clear scoring threat all match",
    },
  },
  defense: {
    label: "Defense",
    rationalePrompt: "Did they play defense, and how effective was it?",
    points: {
      1: "No defensive play at all",
      2: "Attempted defense but easily beaten or out of position",
      3: "Occasional effective blocking of an opponent",
      4: "Sustained, disruptive defense for most of the match",
      5: "Dominant defense that shut down an opposing alliance's scoring",
    },
  },
  reliability: {
    label: "Reliability",
    rationalePrompt: "Any mechanical issues, stalls, or disconnects?",
    points: {
      1: "Broke down, disconnected, or was non-functional for most of the match",
      2: "Multiple stalls or malfunctions that cost real time",
      3: "One notable hiccup but mostly recovered",
      4: "Ran clean with at most a minor bobble",
      5: "Flawless -- no mechanical or software issues observed",
    },
  },
  strategy: {
    label: "Strategy",
    rationalePrompt: "How well did they play to the alliance's needs?",
    points: {
      1: "Played out of position or worked against their alliance",
      2: "Little apparent game plan",
      3: "Reasonable decisions, followed the obvious play",
      4: "Clearly coordinated with alliance partners on shifts/roles",
      5: "Excellent field awareness -- adapted role to what the alliance needed",
    },
  },
  driverSkill: {
    label: "Driver Skill",
    rationalePrompt: "How did the driver handle the robot under pressure?",
    points: {
      1: "Frequent collisions, penalties, or loss of control",
      2: "Noticeably shaky driving, slow to react",
      3: "Competent, got the job done without incident",
      4: "Smooth, confident driving, good spatial awareness",
      5: "Exceptional control -- precise, fast, never in an avoidable tangle",
    },
  },
  confidence: {
    label: "Confidence",
    rationalePrompt: "How sure are you of the ratings you just gave?",
    points: {
      1: "Barely saw this robot, mostly guessing",
      2: "Distracted for parts of the match, filled gaps with assumption",
      3: "Watched most of the match with a clear view",
      4: "Watched closely the whole match, minor uncertainty",
      5: "Watched every second with a clear, unobstructed view",
    },
  },
}
