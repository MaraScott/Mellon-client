import { create } from "zustand";

interface UndoRedoState {
  past: any[];
  present: any | null;
  future: any[];
  setPresent: (newState: any) => void;
  undo: () => void;
  redo: () => void;
}

export const useUndoRedoStore = create<UndoRedoState>((set) => ({
  past: [],
  present: { nodes: [], edges: [] },
  future: [],

  setPresent: (newPresent) =>
      set((state) => {
      if (JSON.stringify(state.present) === JSON.stringify(newPresent)) return state; // Avoid duplicate history entries
      return {
          past: [...state.past, state.present], 
          present: newPresent, 
          future: [] 
      };
      }),

  undo: () => set((state) => {
      if (state.past.length === 0) return state;

      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);

      return { 
      past: newPast, 
      present: previous, 
      future: [state.present, ...state.future] 
      };
  }),

  redo: () => set((state) => {
      if (state.future.length === 0) return state;

      const next = state.future[0];
      const newFuture = state.future.slice(1);

      return { 
      past: [...state.past, state.present], 
      present: next, 
      future: newFuture 
      };
  })
}));