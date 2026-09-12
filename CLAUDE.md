# Working on Finnair Atlas

An unofficial weekly Finnair network timetable drawn as an SVG sheet in the style of the 1974
printed Finnair timetable. Vanilla ES modules, no framework. `npm test` runs the suite with
`node --test`; `npm run build` bundles with esbuild and writes the static site to `site/`.

Read [docs/style-guide.md](docs/style-guide.md) before changing anything visual and
[docs/sources.md](docs/sources.md) before changing anything factual. This file is the short version
of what those two have learned the hard way.

## The sheet only prints what a source said

Every service carries a `source` field naming where its schedule was read, and a test fails if one
does not. This is the project's central claim, so:

- **Never invent a flight number, a time, a day mark or an aircraft type.** Not to fill a gap, not
  to make a route look complete, not because a plausible value is obvious. A route whose schedule is
  not published is drawn with no timings at all and an `opens` date — the schema allows exactly that.
- Finnair's own timetable API answers **403 to every automated client**. Do not spend turns on
  `finnair.com` or `api.finnair.com`; Akamai blocks the timetable path specifically.
- Prefer Finavia's movement feed for anything touching Finland, and the published Finnair route
  pages beyond it. `scripts/flightmapper.mjs` reads the latter and both correction scripts share it.
- When a source disagrees with the sheet, the source wins — but read the source carefully first. Its
  parser has been wrong three times, and each bug made real routes look missing.

## Measure the layout; never eyeball it

The layout has been declared clean while visibly broken more than once, because the tests did not
measure the thing that was wrong. Before claiming a layout is fine, measure it. When you find a
defect, **write the failing test first**, then fix it.

What the tests now measure, and what each was written for:

| Check | Written because |
| --- | --- |
| No route enters an unrelated box | — |
| No two routes cross inside a gateway's partner grid | Singapore carried 24 crossings while every test passed |
| No route exceeds 1.6× its straight-line distance | a route ran 4.4× its own distance, looping right around a grid |
| No edge time falls on a box with no room for it | every partner box had its city name struck through |
| Sheet area stays under its ceiling | sprawl creeps in one tier at a time |
| Every named asset is content-hashed | a stale cache made a correct deploy look broken, three times |

A gateway's partner fan is clean when **every route leaves on its own bearing and no box stands
between the gateway and another box**. A single column satisfies that; so does a row above the
gateway, stackable into a second row. A second column beside a column does not — the deeper boxes
sit behind the nearer ones and the router goes around the outside, crossing everything.

Layout positions in `public/layout.mjs` were chosen by search, not by reasoning, and the comments
say so. A destination returning to the sheet needs its slot searched again rather than guessed.

## Conventions

- Comments explain **why**, never what. Match the density and voice of the surrounding code.
- Prose in docs and commit messages: plain, specific, no marketing. Say what broke and what it cost.
- Times are local clock times with each airport's real offset on the reference week
  (`2026-09-14`), stamped by the bake scripts using `scripts/zones.mjs`.
- The sheet is a **weekly** timetable: one arrow per weekly service with its days of operation, not
  a live departures board.
- Partner connections are a deliberate selection — the most important destination in each region a
  gateway opens up — not the whole network. Dallas alone carries 82 Finnair-coded destinations.
- Browser checks run **headless**. Never open a visible browser for a test.

## Verifying a change

1. `npm test` — the suite is the arbiter, not a screenshot.
2. `npm run build`, then load `site/` or `npm start` and check the region you touched at a zoom
   where the text is legible.
3. **Beware your own cache.** Assets are content-hashed precisely because a stale bundle has
   repeatedly looked like a broken fix. If the page disagrees with the files, compare the served
   file's hash to the local one before concluding anything.
4. Report what the numbers say. If a test fails, say so with the output.

## Publishing

`.github/workflows/pages.yml` publishes `site/` to <https://oplehto.github.io/finnair-atlas/> on
every push to `main`, running the tests first. There is no other host and no deploy token.

## What is not ours

The Finnair name and the 1968 logotype are trademarks of Finnair Oyj, used for illustration only in
an unofficial project. The 1974 reference scan is deliberately **not** in this repository — the
style guide carries its lessons in prose instead. The sheet must never be presented as usable for
travel planning.
