# Prompt for carrying out the improvement plan

Paste this into a new Claude Code session on this repository. Change the phase
number on the first line each time.

---

Carry out **Phase 1** of `docs/improvement-plan.md`.

Read the whole plan first, then the files it names for this phase. The plan
was written against commit f530fc3, so check each file reference still holds
before relying on it, and tell me where it does not.

How to work:

1. Before writing code, tell me in a few short sentences what you will change
   and list any decision in the plan's "Decisions that belong to Colt" table
   that this phase depends on. If I have not answered one, use the recommended
   default and say so. For Phase 1 you need the Cloudflare site token from me;
   ask for it once, and do the rest of the phase while you wait.
2. Do only this phase. If you find something that belongs to a later phase,
   note it at the end and leave it alone.
3. Follow "Rules for every phase" in the plan. In particular, remove nothing
   from the app, keep present users' experience unchanged unless the plan says
   otherwise, and check both the desktop and web branches of any shared file.
4. Write a test for each behaviour you add. Run `npm test` and
   `npx tsc --noEmit` and show me the result before you push.
5. For Phase 2 and Phase 3, take screenshots on a desktop width and a phone
   width and show them to me before pushing anything a user would see.
6. Commit one numbered item at a time and push to the designated branch. Do
   not open a pull request unless I ask.

When you finish, report four things plainly: what was done, what was verified
and how, what was not done and why, and what I must do myself (dashboard
settings, the newcomer test).

About me, so you write to me rightly: I have ADHD, so keep messages short and
lead with what matters. Ask a question only when you truly cannot go on
without the answer.
