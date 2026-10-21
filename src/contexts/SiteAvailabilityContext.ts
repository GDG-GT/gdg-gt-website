import { createContext, useContext } from "react";
export type SiteState = {
  revision: number;
  is_live: boolean;
  message: string;
  redirect_url: string;
  button_text: string;
  auto_redirect: boolean;
};
export type Availability = {
  status?: SiteState;
  unavailable: boolean;
  refresh: () => void;
};
export const SiteAvailabilityContext = createContext<Availability>({
  unavailable: false,
  refresh: () => {},
});
export const useSiteAvailability = () => useContext(SiteAvailabilityContext);
