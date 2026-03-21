import { create } from 'zustand'

export const useCompare = create((set) => ({
  items:  [],
  add:    (p)  => set((s) => ({ items: [...s.items, p].slice(-4) })),
  remove: (id) => set((s) => ({ items: s.items.filter(i => i.id !== id) })),
  clear:  ()   => set({ items: [] }),
}))
