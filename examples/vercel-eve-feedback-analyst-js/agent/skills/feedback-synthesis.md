---
description: Use when asked to synthesize customer feedback, find themes, explain a funnel drop, or decide what product should look into next.
---

# Feedback synthesis workflow

Work through these in order. Do not skip to the answer.

## 1. Fix the scope

Pin the window, the surfaces, and the segment before searching. If the request
names a period ("the last six weeks"), convert it to explicit dates and use them
in every call so the qualitative and quantitative views cover the same window.
State the scope in one line at the top of your answer.

## 2. Read the feedback before counting it

Run several narrow `search_feedback` calls, one per candidate theme, rather than
a single broad one. Search the vocabulary customers actually use, not internal
names: "permissions", "workspace", "invite", "key", "build", "cache", "credits".
Read the verbatim text. Themes come from what people describe, not from the
`product_area` they picked.

## 3. Size each theme

For every candidate theme, call `feedback_stats` with the same keyword and record
both responses and distinct organizations. Note repeat writers: the same account
appearing three times is one account with a persistent problem, which is a
different fact from three accounts with the same problem. Both are worth
reporting, and they are not the same signal.

`feedback_stats` groups on one dimension at a time. When sizing needs two — plan
against week, surface against product area — or needs the per-org distribution
behind a count rather than just its total, use `run_analysis` over
`data/dashboard-feedback-export.json` instead of eyeballing several separate
groupings.

## 4. Corroborate against the numbers

Pull the relevant funnel, trend, or service health data with
`query_product_analytics`, then pull `annotations` for the same window. Check
whether a metric move lines up with a release, an instrumentation change, or an
incident. Read the export's `known_gaps` every time and carry forward the ones
that bear on the claim.

Putting the two sources on the same weekly axis is the step worth scripting: use
`run_analysis` to join feedback volume per week against the relevant trend or
funnel stage, and read the shape rather than comparing two tool outputs by eye.
Alignment in a joined table is still correlation — carry it into step 5, not into
a causal claim.

## 5. Try to break your own story

Before committing to an explanation, name at least one alternative that fits the
same evidence — a change in what is measured, a self-selection effect, a shift in
traffic mix, a coincidence of timing. Say which one the current data cannot rule
out. If the obvious story survives, say why; if it does not, lead with the
weaker, more honest version.

## 6. Build the report, do not type it out

The deliverable is an HTML page, not a wall of chat text. Use `run_analysis` to
write `/workspace/report/index.html`, then call `publish_report` and hand back
the URL.

Write the page from Python in one script, and do both of these for every chart —
they serve different purposes, so neither replaces the other:

1. `savefig` the figure to a `.png` in the report folder, so the user can
   download the image on its own.
2. Embed that same PNG's bytes into the page as a base64 `data:` URI.

The page must not contain a single `<img src="something.png">`. Referencing the
file means the HTML breaks the moment it is saved or mailed on its own; inlining
means one URL is genuinely the whole deliverable. Put the CSS in a `<style>`
block for the same reason.
Never print the HTML to stdout; write it to the file. Save the underlying
figures and any summary table as `.png` / `.csv` in the same folder, since that
folder is served and those become the user's downloads.

Build every download link from the same variable you saved the file under, in
the same script — never retype a filename into the HTML. A link whose name
drifts from the file on disk 404s at the one moment the user clicks it. Before
you publish, `os.listdir` the report folder and assert that every `href` you
emitted is in it.

The page carries the full argument, in this order:

- **Scope** — window, sources, how many responses and organizations.
- **Themes** — ranked strongest first. Each gets a one-line claim, the counts
  (responses / distinct orgs), one or two short verbatim quotes with their ids,
  and any quantitative corroboration.
- **What the numbers show** — the funnel or trend movement, with the dataset
  named and any adjacent annotation flagged as a lead rather than a cause.
- **What we cannot tell yet** — the specific instrumentation and coverage gaps
  that would change the ranking, not generic caveats.
- **Next questions for product** — three at most, each phrased so an answer would
  actually change a decision.
- **Safest useful next action** — one reversible step, and the question it
  resolves.

At least two charts, and only charts that carry an argument the reader would
otherwise have to reconstruct from a table: a theme ranked by distinct orgs
rather than raw responses, a funnel step's movement across the window, a
qualitative series lined up against a quantitative one.

**Every chart has to survive being screenshotted on its own**, because that is
how it will travel. Assume no caption and no surrounding paragraph:

- The title states the finding, not the variables. "Invite rate fell 35% after
  the July 8 permissions change" — never "Invite rate by week".
- Both axes labelled with units. Annotate the bars or points with their values
  so nobody measures against gridlines.
- Say what n is on the chart itself, and when responses and distinct orgs differ,
  show both — a bar of 11 responses from 5 orgs must not read as 11 customers.
- Mark the event you are implying with a dated annotation line, and word the
  label so it reads as timing rather than proof.
- Footer the dataset name and window inside the figure.

No pie charts, no dual axes, no decoration that is not data.

## 6b. Your chat reply is a link, not a summary

Once the report is published, reply with at most three sentences — the single
most important finding, then the URL. The user opens the page for the rest.
Restating the report in chat defeats the point of building it.

## 7. Offer a draft, never a filing

If a theme is ready to hand off, offer to produce a `draft_issue`. It renders a
draft and stops there; the call pauses for human approval first. Report the draft
back as a draft. Never say an issue was created, filed, or shared.
