import { ActionLink } from "./primitives";

export default function NotFoundContent() {
  return (
    <section className="gt-error-page gt-container">
      <span className="gt-error-number">404</span>
      <h1>A little off the beaten path.</h1>
      <p>We couldn’t find this page. Let’s get you back to the community.</p>
      <div className="gt-inline-actions">
        <ActionLink to="/" arrow>
          Back to home
        </ActionLink>
        <ActionLink to="/events" variant="secondary">
          Explore events
        </ActionLink>
      </div>
    </section>
  );
}
