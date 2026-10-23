# AgxntSix AI developer assessment

## About us

AgxntSix AI is an AI products studio. We build and ship AI operating systems for businesses: teams of AI agents that work inside a company's CRM, inbox and data, alongside the people who run it. Many of our clients are clinics and other healthcare businesses, so the data our agents touch is often protected health information (PHI). We treat that as an engineering constraint, not a legal footnote.

We hire engineers who understand the fundamentals and also use AI tools well. Shipping fast with an agent is easy. Shipping something a clinic can trust is the job.

Every dataset in this assessment is synthetic, including the one we run your code against. No real patient data exists anywhere in it. Treat it as if it were real anyway; that is part of what we look at.

## How this works

The assessment is built from checkpoints, one ticket at a time. Submitting a ticket unlocks the next one, and sometimes a change request arrives first.

Expect about 90 minutes of focused work in total. You have 48 hours from running setup to finish, so you can split it up. The server records when you start and when you submit each checkpoint. We are not grading speed, but we do want to see how you budget your time.

1. Make a private copy of this repo (see Deliverables). Do not fork it.
2. Get your candidate token at https://hiring.agxntsix.ai, then run `./setup.sh <candidate-token>`. It confirms the server URL (press Enter for the default), shows what we record and asks for your consent, then saves your first ticket to `TICKETS/AGX-200.md`.
3. Work on the ticket. Commit and push to your private repo.
4. Run `bun run submit`. It checks that everything is committed and pushed, sends your commit, your `UPDATES.md` entry for the ticket and a few short answers about your decisions, then asks two or three questions about the work. When you answer, the next ticket lands in `TICKETS/`.
5. A ticket is locked once you submit it. Submit when you would be happy to ship.

You need [Bun](https://bun.sh) 1.4 or later and git. Use Claude Code, Cursor, Codex or anything else you like.

## Rules

These apply to every ticket. They are also in `RULES.md`.

1. `data/prod_export.csv` stands in for a client's production export. Do not open it, print it or search it, and do not let your AI tool read it. Build and test against `fixtures/sample_contacts.csv` and data you write yourself.
2. Log `contact_id` only. Never log names, emails, phone numbers or dates of birth, including in errors and test output.
3. Start every commit message with the ticket ID, for example `AGX-200: dry-run mode for migration`.
4. Do not add a dependency unless you explain why in `UPDATES.md`.
5. Never commit `.env` files, keys or tokens.

## What we expect

Production grade, not demo grade:

- Tests that fail when the behaviour breaks. We run our own checks against your tests.
- Errors that surface instead of being swallowed.
- Validation at every boundary. Model output counts as untrusted input.
- Structured logs.
- Clear written updates. Assume the reader is a founder who will not ask a follow-up question.

We do not expect you to solve everything. This is a simulation of a real work day: decide what matters most and spend your time there.

## The system

`leadflow` is a small agent system that a junior engineer on the team built quickly, mostly with AI. It is TypeScript on Bun with a SQLite CRM (`contacts`, `companies`, `deals`, `activities`, `agent_writes`).

- The intake agent (`agents/intake.ts`) classifies an inbound message as `new_lead`, `follow_up` or `support`.
- The match agent (`agents/match.ts`) finds or creates the contact.
- The router agent (`agents/router.ts`) proposes the deal stage and owner.
- The agents write to the CRM through `tools/` (`create_contact`, `update_deal`, `log_activity`).

```
bun run leadflow                 # process inbox/*.json
bun run leadflow --inbox <dir>   # process another folder
bun test                         # run the tests
```

The agents call a model through our LLM proxy. Setup stores your personal proxy token in `.leadflow/candidate.json`; it has a spend cap, expires with the assessment and only works with the model in `config.ts`. You never need a provider key of your own.

For offline work and tests, `LEADFLOW_LLM=fake` replays recorded responses from `fixtures/llm/` instead of calling the model.

### Configuration and fault injection used by our CI

`config.ts` reads these environment variables. Our CI uses the fault hooks to test your work, so keep them working.

| Variable | Default | What it does |
|---|---|---|
| `LEADFLOW_LLM` | `proxy` | `fake` or `proxy` |
| `LEADFLOW_FAKE_FIXTURES` | `fixtures/llm` | Folder of fake responses, one file per agent, keyed by input hash with a fallback per agent |
| `LEADFLOW_FAKE_LOG` | unset | Appends one JSON line per fake model call (`{agent, ts}`) |
| `LEADFLOW_FAIL_AFTER_WRITE` | unset | Tool name. Throws a timeout once, after that tool's database write commits |
| `LEADFLOW_TOOL_ERROR` | unset | Tool name. Makes that tool's database operation throw |
| `LEADFLOW_DB` | `leadflow.db` | SQLite database path |
| `LEADFLOW_FAIL_AT_ROW` | unset | For the migration: it must throw at row n. You implement this |
| `LEADFLOW_LLM_BASE_URL`, `LEADFLOW_PROXY_TOKEN` | from `.leadflow/candidate.json` | Proxy settings |

## Checkpoint 1: AGX-200, PHI contact migration

> A clinic client is moving from their old system to our CRM. Write the migration that cleans their contacts and loads them into `contacts`. Their export has about 40,000 rows, and you can't see it. (It is synthetic, like everything here, but it is built to look like the real thing.)

- Map the old columns in `fixtures/sample_contacts.csv` (`FullName, Email, Phone, DOB, Consent, Status, Notes`) to the new schema in `db/schema.sql`.
- Clean the data: normalise phone numbers and emails, merge duplicates, and handle missing or bad values. The clinic is in the Philippines, so a phone number with no country code is a `PH` number.
- It must be safe to run against production. Decide what "safe" means, and explain it in `UPDATES.md`.
- The migration must produce a report we can review without seeing any patient data.

The sample only contains easy rows. The real export is messier.

We run your migration against the clinic export with this command, so keep to it:

```
bun run migrate --input <csv> [--apply] [--db <path>] [--report <path>]
```

- Without `--apply`, it is a dry run.
- The report is JSON with counts only: `{rows_in, loaded, merged, quarantined, rejected, reasons: {<reason>: count}, dry_run}`.
- `LEADFLOW_FAIL_AT_ROW=<n>` must make the run throw at row n. We use it to test what a failed run leaves behind.

`migrate/index.ts` is a stub that parses the arguments and exits. Later tickets arrive from the server after you submit this one.

## Deliverables

1. **Source code.** Create a new private GitHub repository, push a copy of this repo to it (clone, then change the remote; not a fork, and no pull requests to this repo), and share it with `abidi@agxntsix.ai` and `laura@agxntsix.ai`.
2. **`WRITEUP.md`** in the repo root. Write whatever best shows your thinking. Some sections that usually help: assumptions, problem analysis and approach, technical decisions and rationale, implementation details and challenges, and future improvements.
3. **A 5 to 7 minute video.** Walk us through your diagnosis, what you built, how you know it works, and anything else you think matters. Any link we can open works (Loom, YouTube unlisted, Drive).
4. **Your agent trajectory.** Commit an export of your coding agent conversation to `transcripts/` as JSON, TXT or MD. In Claude Code, `/export` does this. Other tools have their own export.

Keep `UPDATES.md` current as you go: one entry per ticket covering what you did, how you tested it, what's left and the decisions you made. Put the video link at the top of `WRITEUP.md`, run `bun run submit` for the final checkpoint, then email the repo link and the video link to both addresses above with the subject "AgxntSix AI assessment".

## Recording and consent

If you agree during setup, `./setup.sh` installs Claude Code hooks in `.claude/settings.local.json` (gitignored). They send each prompt, tool call and session event from Claude Code sessions in this repo to our assessment server, tagged with your candidate token. We record nothing outside this repo, keep the data for 90 days, and use it only to assess your application. The hooks never block your session. Delete that file to stop recording at any time.

Model calls through the proxy are logged too, as they would be in production.

If you use another tool, or say no to the hooks, the committed trajectory file is your record. Saying no does not count against you.

## What happens after

We read your code, `UPDATES.md`, `WRITEUP.md` and the video, and run our checks against your final commit. If it is a fit, we book a 30-minute screen share: you walk us through one ticket, then we change a requirement and you re-decide it live.

Questions are welcome. Email `abidi@agxntsix.ai` and `laura@agxntsix.ai`.
