import { createContext } from "react";
export type DraftState = {
  dirty: boolean;
  busy: boolean;
  label: string;
  privateDraft: boolean;
};
export type NavigationSafetyValue = {
  register: (id: symbol, read: () => DraftState) => () => void;
  changed: () => void;
  allow: (run: () => void) => void;
  request: (run: () => void) => void;
};
export const NavigationSafetyContext =
  createContext<NavigationSafetyValue | null>(null);
