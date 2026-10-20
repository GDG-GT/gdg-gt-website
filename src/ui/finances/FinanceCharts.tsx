import { type Capabilities, type Listing, dollars, human } from "./types";
import { financeStates } from "../../../shared/finances.mjs";
export default function FinanceCharts({
  capabilities,
  listing,
}: {
  capabilities?: Capabilities;
  listing?: Listing;
}) {
  const approved =
    capabilities?.fundingReferences.filter((f) => f.state === "Approved") || [];
  const highest = Math.max(1, ...approved.map((f) => Number(f.amount)));
  const counts = listing?.stateCounts || {};
  const maxCount = Math.max(1, ...Object.values(counts));
  return (
    <div className="gt-finance-report-grid">
      {approved.length > 0 && (
        <section
          className="gt-panel"
          aria-label="Approved planning funding by source"
        >
          <h2>Approved planning funding</h2>
          <p className="gt-helper">
            PRD references only, shown separately by source. Not a live balance
            or approval to spend.
          </p>
          <dl className="gt-finance-bars">
            {approved.map((f) => (
              <div key={f.source}>
                <dt>{f.source}</dt>
                <dd>
                  <span>{dollars(f.amount)}</span>
                  <meter
                    min={0}
                    max={highest}
                    value={Number(f.amount)}
                    aria-label={`${f.source}: ${dollars(f.amount)}`}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section
        className="gt-panel"
        aria-label="Authorized request counts by state"
      >
        <h2>Requests by state</h2>
        <p className="gt-helper">
          Current filters and authorized records only. Counts, not dollar
          totals.
        </p>
        {listing ? (
          <dl className="gt-finance-bars">
            {financeStates.map((s: string) => (
              <div key={s}>
                <dt>{human(s)}</dt>
                <dd>
                  <span>{counts[s] || 0}</span>
                  <meter
                    min={0}
                    max={maxCount}
                    value={counts[s] || 0}
                    aria-label={`${human(s)}: ${counts[s] || 0} requests`}
                  />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p role="status">Loading authorized counts…</p>
        )}
      </section>
    </div>
  );
}
