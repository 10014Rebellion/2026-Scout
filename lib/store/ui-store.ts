import { create } from "zustand"

type PickListView = "primary" | "mine"

interface UiState {
  isSidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  // Mirrors of connectivity/offline-queue state that lives in localStorage
  // (see lib/offline-queue.ts) -- kept here only so components can react to
  // it, not as the source of truth.
  isOnline: boolean
  setOnline: (online: boolean) => void
  queuedCount: number
  setQueuedCount: (count: number) => void
  pickListView: PickListView
  setPickListView: (view: PickListView) => void
  draggingTeamId: string | null
  setDraggingTeamId: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: false,
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  isOnline: true,
  setOnline: (online) => set({ isOnline: online }),
  queuedCount: 0,
  setQueuedCount: (count) => set({ queuedCount: count }),
  pickListView: "primary",
  setPickListView: (view) => set({ pickListView: view }),
  draggingTeamId: null,
  setDraggingTeamId: (id) => set({ draggingTeamId: id }),
}))
