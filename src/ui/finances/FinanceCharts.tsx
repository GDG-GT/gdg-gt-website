import { type Listing, human } from "./types";
import { financeStates } from "../../../shared/finances.mjs";
export default function FinanceCharts({ listing }: { listing?: Listing }) {
  const counts = listing?.stateCounts || {};
  const maxCount = Math.max(1, ...Object.values(counts));
  return (
    <div className="gt-finance-report-grid">
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
