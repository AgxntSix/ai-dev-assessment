# AgxntSix AI developer assessment

## About us

AgxntSix AI is an AI products studio. We build and ship AI operating systems for businesses: teams of AI agents that work inside a company's CRM, inbox and data, alongside the people who run it. Many of our clients are clinics and other healthcare businesses, so the data our agents touch is often protected health information (PHI). We treat that as an engineering constraint, not a legal footnote.

We hire engineers who understand the fundamentals and also use AI tools well. Shipping fast with an agent is easy. Shipping something a clinic can trust is the job.

Every dataset in this assessment is synthetic, including the one we run your code against. No real patient data exists anywhere in it. Treat it as if it were real anyway; that is part of what we look at.

## How this works

The assessment is built from checkpoints, one ticket at a time. Submitting a ticket unlocks the next one, and sometimes a change request arrives first.

Expect about 90 minutes of focused work in total. You have 48 hours from running setup to finish, so you can split it up. The server records when you start and when you submit each checkpoint. We are not grading speed, but we do want to see how you budget your time.

1. Make a private copy of this repo in your own GitHub account. Do not fork it. From a terminal, with the [GitHub CLI](https://cli.github.com) logged in:

   ```
   git clone https://github.com/AgxntSix/ai-dev-assessment
   cd ai-dev-assessment
   git remote remove origin
   gh repo create ai-dev-assessment --private --source . --push
   gh api -X PUT repos/<your-github-user>/ai-dev-assessment/collaborators/aiwithabidi -f permission=read
   ```

   The last command shares the repo with our reviewer account, `aiwithabidi`. Do it now, before AGX-200, so we can see your repo from the start. The final submit checks it again.
2. Apply through our MCP server at `https://hiring.agxntsix.ai/mcp`: your AI tool calls `get_application_password`, then `submit_application`, which returns your candidate token. Then run setup with it (see "Keep your token out of the conversation" below for the safe way inside an AI tool), for example `./setup.sh <candidate-token>` in a plain terminal. It confirms the server URL (press Enter for the default), shows what we record and asks for your consent, then saves your first ticket to `TICKETS/AGX-200.md`.
3. Work on the ticket. Commit and push to your private repo.
4. Run `bun run submit`. It checks that everything is committed and pushed, sends your commit, your `UPDATES.md` entry for the ticket and a few short answers about your decisions, then asks two or three questions about the work. When you answer, the next ticket lands in `TICKETS/`.
5. A ticket is locked once you submit it. Submit when you would be happy to ship.

You need [Bun](https://bun.sh) 1.4 or later and git. Use Claude Code, Cursor, Codex or anything else you like.

### Working from your AI tool

Your AI tool can run every command here, including setup and submit. Two things stay with you:

- **Consent.** Run setup with your own answer: `--consent-hooks yes` (or `no`), as in the token-safe command below. Without a terminal and without that flag, setup stops and asks for it.
- **Decision answers.** Without a terminal, `bun run submit` writes `answers/<TICKET>.md` with one section per decision. Fill it in, commit, push and run submit again. If the server then asks follow-up questions, they land in `answers/<TICKET>-followup.md`; answer them there and run `bun run submit --followup`. We read these answers as yours, and we ask about them on the call.

**Keep your token out of the conversation.** Anything typed into your AI session can end up in the transcript you commit. Inside an AI tool, copy the token to your clipboard and pipe it in, so it never appears in a command:

```
pbpaste | ./setup.sh --token-stdin --consent-hooks yes      # macOS (Linux: wl-paste or xclip -o)
```

In Claude Code, put `!` in front to run it yourself from the session. In a plain terminal, `./setup.sh <candidate-token>` is fine. `AGX_CANDIDATE_TOKEN` in the environment also works. `bun run submit` refuses to send anything while a token appears in `transcripts/`, `UPDATES.md`, `DECISIONS.md` or `WRITEUP.md`, and tells you the file and line to redact.

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

For offline work and tests, the fake model replays recorded responses from `fixtures/llm/` instead of calling the proxy: `bun run leadflow:fake` and `bun run eval:fake` (the same as setting `LEADFLOW_LLM=fake`).

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

1. **Source code** in your private repo, shared with `aiwithabidi` (step 1 above). Not a fork, and no pull requests to this repo.
2. **`WRITEUP.md`** in the repo root. Fill in the template. It asks for assumptions, analysis, decisions and rationale, challenges and future improvements.
   - **AI tools I use (required):** a section on the tools, models and setups you use day to day and used here.
   - **Skills I've built (optional):** any agent skills, rules or prompts you have made (Claude Code skills, Cursor rules, `AGENTS.md`), committed under `shared-skills/` or linked. We use them only to understand how you work. Leave out secrets and anything confidential to an employer or client.
3. **Your agent trajectory.** Commit an export of your coding agent conversation to `transcripts/` as JSON, TXT or MD. In Claude Code, `/export` does this. Other tools have their own export.
4. **A 5 to 7 minute video.** Walk us through your diagnosis, what you built and how you know it works. Record it however you like, then either upload the file from the terminal with `bun run submit --video <file>` (mp4, mov or webm, up to 500 MB), or put `Video: <link>` near the top of `WRITEUP.md` (Loom, unlisted YouTube, Drive). The final submit will not go through without one.

Keep `UPDATES.md` current as you go: one entry per ticket covering what you did, how you tested it, what's left and the decisions you made.

You do not need to email us. The final `bun run submit` sends everything: it checks that your repo is private and shared with `aiwithabidi`, then sends the repo link, your final commit and your video. Pass `--repo-url https://github.com/<owner>/<repo>` if your remote is not a GitHub URL.

To check where you are at any point, ask your AI tool to call the `check_status` tool on our MCP server (`https://hiring.agxntsix.ai/mcp`).

## Recording and consent

If you agree during setup, `./setup.sh` installs Claude Code hooks in `.claude/settings.local.json` (gitignored). They send each prompt, tool call and session event from Claude Code sessions in this repo to our assessment server, tagged with a hook-only token that can send recordings and nothing else. We record nothing outside this repo, keep the data for 90 days, and use it only to assess your application. The hooks never block your session. Delete that file to stop recording at any time.

Model calls through the proxy are logged too, as they would be in production.

If you use another tool, or say no to the hooks, the committed trajectory file is your record. Saying no does not count against you.

## What happens after

We read your code, `UPDATES.md`, `WRITEUP.md` and your video, and run our checks against your final commit. If it is a fit, we book a 30-minute screen share: you walk us through one ticket, then we change a requirement and you re-decide it live.

Questions are welcome: `laura@agxntsix.ai`.
