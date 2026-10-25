# 📋 Your brief: read this first

## 🎬 The scene
You just joined **AgxntSix AI** as an **AI developer**. We are an AI services firm: we help companies build external-facing AI products or put AI to work inside their business.

Your client is a **clinic network** moving about **40,000 patient contacts** into our CRM, `leadflow`, where our AI agents work alongside their staff.

## 🧑‍💻 Your role
You are the engineer on this job, **end to end**: decide, build, test, explain. We review each ticket like a pull request from a teammate.

## ⚠️ What's at stake
This is **patient data (PHI)**. Every dataset here is synthetic, but work **as if HIPAA applies**:
- **Touch only what you need.**
- **Keep PHI out** of logs, reports, tests and commits.
- **Treat production with care.**

## 🚧 Constraints
- 🔒 **Never open `data/prod_export.csv`**, and don't let your AI tool read it. It stands in for production. Use `fixtures/` and data you write yourself.
- 🪪 **Log `contact_id` only.** Never names, emails, phone numbers or dates of birth.
- 🛡️ **Anything that touches production must be safe to run.** What "safe" means is your call: explain it.
- 📦 **No new dependency** without a reason in `UPDATES.md`.
- 🔑 **No secrets** in the repo.

The full rules are in `RULES.md`.

## ⏱️ How it runs
- **One ticket at a time.** Change requests can land mid-way, like on a real project.
- **About 90 minutes** of work inside a **48-hour window**. We look at how you budget time, not speed.
- **When a ticket is done:** commit, push and run `bun run submit`. It asks a few short questions about your decisions (answer in your own words), then the next ticket lands in `TICKETS/`.

## 🔍 What we look at
1. **Your decisions and why**, in `UPDATES.md`.
2. **Tests that would catch real bugs**, not just pass.
3. **How you direct your AI tool.** This job is mostly directing AI agents well.
4. **Care with patient data**, every step of the way.

## ▶️ Start
Open **`TICKETS/AGX-200.md`**.
