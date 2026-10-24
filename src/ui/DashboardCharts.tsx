type Registration = {
  id: string;
  title: string;
  internal: number;
  external: number;
};
type Funding = { status: string; count: number; amount: string };
const statuses: Record<string, string> = {
  pending: "Awaiting approval",
  "team-lead-approved": "Team approved",
  "admin-approved": "Chapter approved",
  completed: "Received",
};
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
// Text and an optional data table carry every value; bars are decorative, so
// magnification, screen readers and forced colors don't lose chart information.
export function RegistrationChart({
  items,
  totalEvents,
}: {
  items: Registration[];
  totalEvents: number;
}) {
  const maximum = Math.max(
    1,
    ...items.map((item) => item.internal + item.external),
  );
  return (
    <>
      <p className="gt-helper">
        The latest {items.length} of {totalEvents} events you can access.
        Internal signups and recorded external attendees are shown separately.
      </p>
      {!items.length ? (
        <p>No events to chart yet.</p>
      ) : (
        <>
          <ul className="gt-overview-bars">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <span>{item.title}</span>
                  <strong>{item.internal + item.external}</strong>
                </div>
                <span className="gt-overview-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${(100 * (item.internal + item.external)) / maximum}%`,
                    }}
                  />
                </span>
                <small>
                  {item.internal} internal · {item.external} external
                </small>
              </li>
            ))}
          </ul>
          <details>
            <summary>View registration data table</summary>
            <div className="gt-table-scroll">
              <table className="gt-table">
                <caption>Registrations by event</caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Internal</th>
                    <th scope="col">External</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.title}</th>
                      <td>{item.internal}</td>
                      <td>{item.external}</td>
                      <td>{item.internal + item.external}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}
export function FundingChart({ items }: { items: Funding[] }) {
  const maximum = Math.max(1, ...items.map((item) => Number(item.amount)));
  return (
    <>
      <p className="gt-helper">
        Incoming funding in your scope, in USD. Approved amounts remain separate
        from money received. Draft, rejected and cancelled records are excluded.
      </p>
      {items.some((item) => item.count) && (
        <ul className="gt-overview-bars">
          {items.map((item) => (
            <li key={item.status}>
              <div>
                <span>{statuses[item.status] || item.status}</span>
                <strong>{usd.format(Number(item.amount))}</strong>
              </div>
              <span className="gt-overview-track" aria-hidden="true">
                <span
                  style={{ width: `${(100 * Number(item.amount)) / maximum}%` }}
                />
              </span>
              <small>
                {item.count} {item.count === 1 ? "record" : "records"}
              </small>
            </li>
          ))}
        </ul>
      )}
      {!items.some((item) => item.count) && (
        <p>No incoming funding records yet.</p>
      )}
    </>
  );
}
