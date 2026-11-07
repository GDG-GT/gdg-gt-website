import { forwardRef, useEffect, type ReactNode, type FormHTMLAttributes } from "react";
import { usePublicBootstrap } from "@/contexts/PublicBootstrapContext";
// Server-rendered forms cannot submit through a native GET before React has
// attached validation, privacy/queue handling and the application submit action.
export const HydratedForm = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(function HydratedForm({ children, ...props }, ref) {
  const bootstrap = usePublicBootstrap();
  return <form {...props} {...(bootstrap ? { inert: "" } : {})}
    ref={(node) => {
      if (node) node.inert = false;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }}>{children}</form>;
});
export function PublicHydrationBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.getElementById("root")?.removeAttribute("data-gdg-ssr");
    document.getElementById("gdg-public-bootstrap")?.remove();
  }, []);
  return <>{children}</>;
}
