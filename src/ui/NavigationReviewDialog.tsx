import { useRef } from "react";
import * as Alert from "@radix-ui/react-alert-dialog";
import { Button } from "./primitives";

export type NavigationReviewProps = {
  busy: boolean;
  labels: string[];
  cancel: () => void;
  discard: () => void;
};

export default function NavigationReviewDialog({
  busy,
  labels,
  cancel,
  discard,
}: NavigationReviewProps) {
  const stay = useRef<HTMLButtonElement>(null);
  return (
    <Alert.Root
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <Alert.Portal>
        <Alert.Overlay className="gt-navigation-backdrop" />
        <Alert.Content
          className="gt-navigation-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            stay.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <Alert.Title asChild>
            <h2>
              {busy ? "An operation is still running" : "Leave unsaved work?"}
            </h2>
          </Alert.Title>
          <Alert.Description asChild>
            <p>
              {busy
                ? "Stay here until the current operation finishes so you can see whether it succeeded."
                : "Leaving may discard edits or unsent text. Stay to save or finish your work first."}
            </p>
          </Alert.Description>
          {labels.length > 0 && (
            <ul>
              {labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
          <div className="gt-button-row">
            <Alert.Cancel ref={stay} className="gt-button gt-button-secondary">
              Stay here
            </Alert.Cancel>
            {!busy && (
              <Button variant="danger" onClick={discard}>
                Discard and leave
              </Button>
            )}
          </div>
        </Alert.Content>
      </Alert.Portal>
    </Alert.Root>
  );
}
