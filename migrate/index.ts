// AGX-200: clinic contact migration.
//
// Usage: bun run migrate --input <csv> [--apply] [--db <path>] [--report <path>]
//   --input   CSV export in the old schema (FullName, Email, Phone, DOB, Consent, Status, Notes)
//   --apply   write to the database. Without it, the run is a dry run and writes nothing.
//   --db      SQLite database path (default: LEADFLOW_DB or leadflow.db)
//   --report  where to write the JSON report (counts only)
//
// Report shape:
//   { rows_in, loaded, merged, quarantined, rejected, reasons: { <reason>: count }, dry_run }
//
// LEADFLOW_FAIL_AT_ROW=<n> must make the run throw at row n (our CI uses it to test recovery).

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    apply: { type: "boolean", default: false },
    db: { type: "string" },
    report: { type: "string" },
  },
});

if (!values.input) {
  console.error("usage: bun run migrate --input <csv> [--apply] [--db <path>] [--report <path>]");
  process.exit(2);
}

console.error("migrate: not implemented");
process.exit(1);
