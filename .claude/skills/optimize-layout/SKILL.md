---
name: optimize-layout
description: Diagnose and fix Finnair Atlas layout problems — route crossings, detours, text clobbering box names, sprawl, or placing a new destination. Use whenever the sheet looks wrong or a new airport needs a slot.
---

# Optimizing the sheet's layout

This layout has been declared clean while visibly broken more than once, every time because the
tests did not measure the thing that was wrong. So:

**Measure first. Write the failing test. Then fix it.** Never conclude from a screenshot alone, and
never conclude from a passing suite that the sheet is right — only that the measured properties are.

## Measure before you touch anything

Run the layout in node and compute the property you suspect. This is faster and far more reliable
than looking, and it tells you the size of the problem:

```js
const flights = [...demo.flights, ...demo.codeshareFlights];
const codes = new Set(flights.flatMap(f => [f.from, f.to]));
const nodes = layoutAirports([...demo.airports, ...demo.codeshareAirports].filter(a => codes.has(a.code)), flights);
const routes = layoutFlights(nodes, flights);
```

From there: path length against straight-line distance for detours, pairwise segment intersection
for crossings, `endpointLabels(route, nodes)` positions against node boxes for text clobbering.

Beware measuring in the browser. `getBBox()` returns local coordinates inside a rotated group, and
at a fit-view zoom everything is a couple of pixels wide, so adjacent elements appear to collide.
Measure in sheet units in node, or in screen space with `getBoundingClientRect()` on both sides —
not a mixture. A mixture produced a confident false positive on 88 labels that were perfectly fine.

## What the tests already measure

| Check | Written because |
| --- | --- |
| No route enters an unrelated box | — |
| No two routes cross inside a gateway's partner grid | Singapore carried 24 crossings while every test passed |
| No route exceeds 1.6× its straight-line distance | one ran 4.4×, looping around a grid it could not enter |
| No edge time falls on a box with no room for it | every partner box had its city name struck through |
| Ports fit on their box edge, labels avoid boxes | — |
| Sheet area under its ceiling | sprawl creeps in one tier at a time |

If your defect is not in that list, it is not measured. Add it.

## The geometry that actually works

**A partner fan is clean when every route leaves the gateway on its own bearing and no box stands
between the gateway and another box.** Two shapes satisfy that:

- a **single column** beside the gateway, each box at a distinct height;
- a **row** above the gateway, each at a distinct horizontal offset, stackable into a second row.

A second column beside a column does **not**. The deeper boxes sit behind the nearer ones, their
routes must thread the corridors between them, and when a corridor is too narrow the router goes
right around the outside of the grid and crosses everything on the way. That is exactly how
Singapore ended up with 24 crossings and a 4.4× detour.

Also: the port comb along a gateway edge is much shorter than the column it serves, so routes leave
at steep angles. Keep the column far enough out that those angles stay shallow, or the router will
approach a box from its top edge and sweep back across its neighbours. About 520 units worked.

## Placing a new destination

Positions in `public/layout.mjs` were chosen by search, not by reasoning, and the comments say so.
A returning destination needs its slot searched again rather than guessed.

1. Put it in the right region set (`DOMESTIC_CODES`, `SCANDINAVIA_CODES`, `FAR_NORTH_CODES`,
   `EAST_CODES`) or it lands wherever the fallback puts it — which once dropped Miami 6,000 units
   off to the left.
2. Give it an explicit slot in its tier or column. Without one, the fallback applies.
3. **Search the offset**: try several values in a loop, running the suite for each, and take one
   that passes. Reasoning about which gap is free does not survive contact with the router.
4. A destination reached by continuing another flight belongs beside its feeder, not where its
   geography suggests. Tromsø, Alta and Kirkenes are Norwegian but sit above the domestic fan,
   because from the west column the leg back to Lapland cuts straight across Oulu.

## When a constraint has to move

Test thresholds encode real calibration, so do not raise one to make a failure go away. Raise it
only when the sheet has genuinely gained content, and then update the comment to say what it now
holds and why. The compactness ceiling has moved twice, both times for a real new tier.

## Finally

- `npm test` must pass, and the new test must fail on the old code — check that it does.
- Look at the region you changed at a zoom where the text is legible, not at the fit view.
- If the page disagrees with the files, compare the served asset's hash to the local one before
  concluding the fix failed. A stale bundle has faked a broken fix three times.
