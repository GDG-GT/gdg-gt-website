import { useId } from "react";
import { Button } from "@/components/ui/button";

/** Display only: no provider redirect, identity claim, session or form proof. */
export default function GeorgiaTechSsoOption({
  purpose = "login",
}: {
  purpose?: "login" | "form";
}) {
  const descriptionId = useId();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled
        aria-describedby={descriptionId}
        className="h-auto min-h-11 w-full whitespace-normal py-3"
      >
        {purpose === "login" ? "Sign in" : "Verify"} with Georgia Tech SSO ·
        Coming soon
      </Button>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        {purpose === "login"
          ? "Campus SSO is not connected yet. Use your chapter email and password for now. SSO will not automatically grant admin access."
          : "Campus SSO verification is planned but not connected. Existing access links and email verification remain unchanged."}
      </p>
    </div>
  );
}
