---
name: update-sheet
description: Refresh the Finnair Atlas sheet's schedule data — add or correct routes, partner connections and winter services from published sources, then verify. Use when the network has changed, a route looks wrong, or the reference week moves.
---

# Updating the sheet's data

The sheet's central claim is that every service was read from a source. Hold that line: **never
invent a flight number, a time, a day mark or an aircraft type**, not to fill a gap and not because
a plausible value is obvious. A route whose schedule is not published is drawn with no timings and
an `opens` date; the schema allows exactly that.

## What you can and cannot read

`finnair.com` and `api.finnair.com` answer **403 to every automated client** — headless browser,
ordinary automated browser, and `curl` with the application's own `x-client-id: FCOM` headers.
Akamai blocks the timetable path specifically. Do not spend turns there.

| Source | Script | Good for |
| --- | --- | --- |
| Finavia public flight information | `scripts/finavia.mjs` | anything touching Finland, observed at a real airport on a real day |
| Published Finnair route pages | `scripts/flightmapper.mjs` | AY number, operating carrier and flight, equipment, days, times, per schedule period |
| Published Finnair flight index | `scripts/discover-network.mjs` | which destinations Finnair actually codes from a given airport |

Finavia needs a key in `~/finavia` or `$FINAVIA_KEY`. It is never printed and never committed.

## Steps

1. **Read [docs/sources.md](../../../docs/sources.md)** for what each source covers and where it
   stops. Route-page coverage ends at the last day of the current schedule season, so a future
   season simply is not there.

2. **Find the truth before changing anything.**
   - A whole network view: `node scripts/discover-network.mjs --out /tmp/net.json --from HEL`
   - One city pair, both directions: read it through `scripts/flightmapper.mjs`, which caches pages
     under `.cache/flightmapper` so re-runs are free.
   - Anything Finnish: `node scripts/finavia.mjs --out /tmp/today.json`, then diff the airports and
     routes it reports against `public/demo.mjs`. This is how four silently-dropped airports and a
     misdrawn Tromsø were found.

3. **Apply it with the right script**, each of which records provenance on what it writes:
   - `scripts/correct-from-routes.mjs HEL-XXX` — replace one city pair's services with every
     published row covering the sheet's week. Use this when the sheet and the source disagree.
   - `scripts/rebuild-codeshares.mjs` — rebuild all partner connections. Edit its `SELECTION` to
     change which destinations each gateway draws.
   - `scripts/add-winter-season.mjs` — destinations that open later, with real numbers and no times.
   - `scripts/tag-sources.mjs` — fill in `source` on anything that lacks it.

4. **A new airport needs three things** or it is silently dropped: coordinates in the script that
   introduces it, an IANA zone in `scripts/zones.mjs`, and a layout slot (see the `optimize-layout`
   skill). A missing zone or missing coordinates is reported as a gap, not an error.

5. **Verify, in this order.**
   - `node scripts/verify-codeshares.mjs` — must report every partner leg OK.
   - `npm test` — includes the guard that every service records a source.
   - `npm run build`, then look at the region you changed at a legible zoom.

## Honesty rules that have mattered

- A leg with no published period covering the sheet's week keeps its `status` saying so, rather than
  implying the week was verified.
- A source's own 404 is an answer. A Finnair route page that redirects to the carrier-agnostic page
  means "no Finnair code here" — that is how 47 fabricated partner legs were found.
- A clean audit is evidence, not proof. Its parser has been wrong three times, and each bug made
  real routes look missing. If a route you expect is absent, suspect the parser before the airline.
- Report gaps rather than filling them. One-directional legs and unpublished returns belong in the
  script's output and in `docs/sources.md`.
