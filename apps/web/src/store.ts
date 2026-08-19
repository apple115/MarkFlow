import { create } from 'zustand'
import type { Note } from '@markflow/contract'

interface NoteState {
  notes: Note[]
  selectedId: string | null
  loading: boolean
  error: string | null
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  updateNote: (note: Note) => void
  removeNote: (id: string) => void
  selectNote: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  selectedId: null,
  loading: false,
  error: null,
  setNotes: (notes) => set({ notes }),
  addNote: (note) =>
    set((state) => ({
      notes: [note, ...state.notes],
      selectedId: note.id,
    })),
  updateNote: (note) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.id === note.id ? note : n)),
    })),
  removeNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),
  selectNote: (id) => set({ selectedId: id }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))
