# Where the schedules come from

Every service on the sheet carries a `source` field naming where its schedule was read, and the
selected-flight panel shows it. This page says what each source is, how far it can be trusted, and
where it runs out. The sheet is an unofficial hobby project and must not be used for travel; this
page exists so that any individual line on it can be questioned.

## Why not Finnair's own timetable

Finnair publishes a timetable at `finnair.com/fi-en/timetables`, and it would be the right source.
It cannot be read by a program: the page is a client-side application, and the endpoint behind it
(`api.finnair.com/d/fcom/instantsearch-prod/current/api/timetable`) answers **403** to every
automated client tried — headless Chrome, an ordinary browser driven by automation, and `curl` with
the application's own `x-client-id: FCOM` and `x-session-id` headers. Akamai blocks that path
specifically; the sibling location-lookup API on the same host answers normally. So everything below
is a substitute, and none of it is Finnair speaking directly.

## The sources

| Source | Services | What it is |
| --- | --- | --- |
| `published per-flight schedule pages, reconciled against Finavia` | 571 | The originally collected week. Second-hand and the oldest material here. |
| `flightmapper.net Finnair route page` | 113 | One published page per Finnair route, carrying the AY marketing number, the operating carrier and its flight, the equipment, the days and the times, per schedule period. |
| `Finavia public flight information` | 11 | The Finnish airport authority's own movement feed, via `apigw.finavia.fi`. A service tagged to it was observed at a Finnish airport on a real day. |
| `flightmapper.net Finnair route page, previous season's numbers; winter 2026/27 not published` | 10 | Winter destinations: real flight numbers from the last published winter, and **no times at all**. |
| `Finavia public flight information, Alta leg reconstructed from the Helsinki arrival` | 2 | Finavia sees Alta only as an estimated back-calculation, so these two legs' times are a reconstruction. |
| `route announcement; no timetable filed` | 1 | Tampere's return on 25 October: announced, nothing filed. No number, no times. |

### Finavia

`scripts/finavia.mjs` reads the public flight information feed for all Finnish airports, roughly
today and tomorrow. It is authoritative for anything touching Finland and worthless for anything
that does not: Singapore–Melbourne never appears in it. Finavia gives one scheduled timestamp per
movement at a Finnish airport, so a domestic leg seen from both ends has two real times while a
foreign end is estimated from great-circle distance and marked in the service's status.

This feed is what caught the sheet's four silently dropped airports (Alta, Corfu, Kirkenes,
Preveza) and established that Tromsø is not a Helsinki nonstop but AY 541/542 continuing beyond
Rovaniemi. It needs an API key, read from `~/finavia` or `FINAVIA_KEY` and never printed.

### The Finnair route pages

`scripts/flightmapper.mjs` reads them and `scripts/discover-network.mjs` walks the published Finnair
flight index — all 368 airports Finnair departs from, each with its destinations and their AY flight
numbers — which is how the partner selection was chosen rather than guessed.

Two limits are worth knowing. First, a route Finnair does not serve redirects to a carrier-agnostic
page that 404s; that is the source answering "no Finnair code here", and it is how the audit
established that 47 of the sheet's former partner legs were sectors Finnair places no code on at
all. Second, coverage stops at **24 October 2026**, the last day of the summer season, so the winter
schedules simply are not there.

Eight partner legs have no published period covering the sheet's own week — Inverness, Newcastle,
Jersey, Norfolk and Honolulu — and their times come from the nearest period that is published. Each
says so in its status rather than implying the week was verified.

## Checking it

`scripts/verify-codeshares.mjs` compares every partner leg on the sheet back against the route pages
and prints what disagrees. It currently passes clean on all of them. It was written because the
partner connections were once invented: the first run found that **none** of the 142 legs then on
the sheet matched published data.

The audit is only as good as its parser, and its parser has been wrong three times — an airport's
terminal token is optional, not numeric; a row runs until the prose after the schedule table, and
without that the last row of every page was dropped; and some schedule periods omit the operating
carrier that neighbouring periods of the same flight name. Each of those made real routes look
missing. Treat a clean audit as evidence, not proof.

## What this does not cover

The sheet's own layout — which side of Helsinki a destination sits on, where a partner grid hangs —
is a design decision recorded in the [style guide](style-guide.md), not a fact from any source.
Partner connections are a deliberate selection of the most important destination in each region a
gateway opens up, not the whole network: Dallas alone carries 82 Finnair-coded destinations.
