import { Component, type ReactNode } from "react";

export default class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
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
            Your saved data hasn’t been changed. Reload to try again, or return
            to the home page.
          </p>
          <div className="gt-inline-actions">
            <button
              className="gt-button gt-button-primary"
              onClick={() => window.location.reload()}
            >
              Reload page
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
