# AgxntSix AI developer assessment: instructions for the AI agent

## At the start of every session
Read `BRIEF.md` and `RULES.md`, then show the user a short summary of `BRIEF.md`: the scene, their role, what's at stake, the constraints, and the current ticket (the newest file in `TICKETS/`).

## Two kinds of "submit": never mix them up
| The user means | What it is | How |
|---|---|---|
| Applying | Done once, before this repo existed | MCP tool `submit_application` on the hiring server. Already done if `.leadflow/candidate.json` exists. |
| Submitting a ticket | Every time a ticket is finished | **`bun run submit` in this repo.** Never an MCP tool. |

Once this repo exists, "submit" always means `bun run submit`. The hiring MCP server is only for applying and for `check_status`.

## The ticket loop
1. Work on the current ticket. Follow `RULES.md`, and explain decisions in `UPDATES.md`.
2. Commit with the ticket ID at the start of the message (for example `AGX-200: dry-run mode`), then push.
3. Run `bun run submit`. It checks everything is committed and pushed, then asks about the user's decisions.
   - Ask the user each question and pass on their own words. **Never write these answers yourself.**
   - With no terminal, it writes `answers/<TICKET>.md` instead. Put the user's own words in it, commit, push and run `bun run submit` again.
   - Follow-up questions land in `answers/<TICKET>-followup.md`. Same rule, then run `bun run submit --followup`.
4. The next ticket (or a change request such as `CR-1`) lands in `TICKETS/`. Show the user a short summary and start on it, without waiting to be told.
5. The last ticket is `FINAL`. Follow it exactly: `WRITEUP.md`, the video, then the final `bun run submit`.

## Status and problems
- **Where am I?** Call the MCP tool `check_status` with the token in `~/.agxntsix/candidate-token`. Read the file inside the command; never print the token or write it into the repo.
- **Submit says the repo isn't shared:** run the `gh api ... collaborators/aiwithabidi` command it prints, then submit again.
- **Submit says a token appears in a file:** remove it from that file, commit, push, submit again.
- **Lost token or anything else stuck:** the user emails the contact in `README.md`.
