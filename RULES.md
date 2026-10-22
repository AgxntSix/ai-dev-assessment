# Rules

These apply to every ticket. They are the same as the Rules section of the README.

1. `data/prod_export.csv` stands in for a client's production export. Do not open it, print it or search it, and do not let your AI tool read it. Build and test against `fixtures/sample_contacts.csv` and data you write yourself.
2. Log `contact_id` only. Never log names, emails, phone numbers or dates of birth, including in errors and test output.
3. Start every commit message with the ticket ID, for example `AGX-200: dry-run mode for migration`.
4. Do not add a dependency unless you explain why in `UPDATES.md`.
5. Never commit `.env` files, keys or tokens.

All data in this repo and on our side is synthetic. Treat it as real patient data anyway.
