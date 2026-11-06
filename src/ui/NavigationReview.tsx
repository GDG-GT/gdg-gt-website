import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { NavigationReviewProps } from "./NavigationReviewDialog";

const Dialog = lazy(() => import("./NavigationReviewDialog"));

// A blocked navigation remains blocked while its review UI loads or fails.
// The native modal provides focus containment and Escape during that interval;
// only the loaded review offers destructive approval.
function PendingReview({
  cancel,
  failed = false,
}: {
  cancel: () => void;
  failed?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal?.();
    stay.current?.focus();
    return () => {
      if (node.open) node.close();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="gt-navigation-dialog gt-navigation-pending"
      aria-labelledby="navigation-review-loading-title"
      aria-describedby="navigation-review-loading-description"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <h2 id="navigation-review-loading-title">
        {failed
          ? "Navigation review could not load"
          : "Preparing navigation review"}
      </h2>
      <p id="navigation-review-loading-description">
        {failed
          ? "Your navigation is still paused. Stay here to keep your work. Copy any unsaved text before reloading this tab."
          : "Your navigation is paused. You can stay here while the review loads."}
      </p>
      <button
        ref={stay}
        className="gt-button gt-button-secondary"
        onClick={cancel}
      >
        Stay on this page
      </button>
    </dialog>,
    document.body,
  );
}

class ReviewBoundary extends Component<
  { children: ReactNode; cancel: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <PendingReview failed cancel={this.props.cancel} />
    ) : (
      this.props.children
    );
  }
}

export default function NavigationReview(props: NavigationReviewProps) {
  const previousFocus = useRef(document.activeElement as HTMLElement | null),
    restore = useRef(true);
  useEffect(
    () => () => {
      if (restore.current && previousFocus.current?.isConnected)
        previousFocus.current.focus();
    },
    [],
  );
  return (
    <ReviewBoundary cancel={props.cancel}>
      <Suspense fallback={<PendingReview cancel={props.cancel} />}>
        <Dialog
          {...props}
          discard={() => {
            restore.current = false;
            props.discard();
          }}
        />
      </Suspense>
    </ReviewBoundary>
  );
}
