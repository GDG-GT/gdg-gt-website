import { Component, type ReactNode } from "react";
import { refreshPageAssets } from "@/lib/route-assets";

export default class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; reloading: boolean }
> {
  state = { failed: false, reloading: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="gt-container gt-route-loading" role="alert">
          <p className="gt-eyebrow">Something went wrong</p>
          <h1>This page couldn’t load.</h1>
          <p>
            Reload to try again, or return to the home page. If a save was
            interrupted, check its outcome before submitting again.
          </p>
          <div className="gt-inline-actions">
            <button
              className="gt-button gt-button-primary"
              disabled={this.state.reloading}
              onClick={async () => {
                this.setState({ reloading: true });
                try { await refreshPageAssets(); }
                finally { window.location.reload(); }
              }}
            >
              {this.state.reloading ? "Refreshing page assets…" : "Reload page"}
            </button>
            <a className="gt-button gt-button-secondary" href="/">
              Return home
            </a>
          </div>
        </section>
      );
    return this.props.children;
  }
}
