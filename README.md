# Airline Atlas

A scrollable, interactive weekly flight timetable inspired by vintage Finnair network diagrams. Each weekly service is one arrow with its departure time, flight number, days of operation, aircraft code and arrival time. Airport locations are schematic. The sheet is a printed-timetable view of a season, not a live departures board.

## Run

Requires Node.js 22 or newer. Uses D3 force layout; esbuild bundles the browser code.

```sh
npm install
npm start
# http://localhost:4173
npm test
```

The default sheet is Finnair's **published weekly timetable for the week of 14 September 2026**, collected from public schedule pages and cross-checked against Finavia flight data (see "How the built-in sheet is made"). It is an unofficial reconstruction: seasonal changes, wet-leases and last-minute changes are not reflected, partner connections are illustrative, and it must not be used to plan travel.

## Use any airline

Point the server at a JSON file or feed in the format below (see Schedule sources); the title, airports and airlines come from that file. Search matches airport codes, airline names and flight numbers, ignoring spaces, so `AY5955` finds `AY 5955` and `HEL OUL` finds the route. Clicking an airport box, or a destination code along the Helsinki edge, highlights that airport's connections in place and opens a panel with its services and, for partner cities, the journeys via the hub; clicking an arrow opens that flight's details. The panel is a pop-up only: Close or Escape dismisses it and restores the full sheet.

Flights are collapsed into **weekly services**: one arrow per flight number, route and departure clock time. A `days` field with the day marks (`#` for daily, `①`–`⑦` for Monday to Sunday) is used when present; otherwise the days are derived from the dates in the file, so a file covering a full week produces correct marks on its own.

```json
{
  "title": "Finnair, by air",
  "subtitle": "Domestic services / Kotimaan liikenne",
  "source": "Your schedule provider, retrieval date",
  "airports": [
    {"code":"HEL","name":"Helsinki","lat":60.32,"lon":24.96},
    {"code":"OUL","name":"Oulu","lat":64.93,"lon":25.35}
  ],
  "flights": [
    {
      "id":"AY-example-2026-09-10",
      "number":"AY example",
      "from":"HEL","to":"OUL",
      "departure":"2026-09-10T08:00:00+03:00",
      "arrival":"2026-09-10T09:05:00+03:00",
      "airline":"Finnair","aircraft":"Airbus A320","status":"Scheduled"
    }
  ]
}
```

Airport codes must be unique 3–4 character uppercase alphanumeric codes. Flight IDs must be unique, including across dates. Timestamps require seconds and explicit UTC offsets (or Z); write them in each airport's local timezone for correct displayed local times. Arrival must be later than departure. Optional flight fields: number, airline, aircraft, status. Maximum 150 airports, 2,500 flights, 5 MB per import.

Export an editable vector graphic using **Export SVG**. The export includes the filtered sheet and styling; it does not require this server to open.

## Schedule sources

A provider adapter or existing pipeline must produce the JSON format above. The browser loads the schedule once and does not poll; press Reload to pick up a changed file or feed.

### How the built-in sheet is made

The default sheet is Finnair's published weekly timetable for the week of 14 September 2026, baked into `public/demo.mjs`; the app does not fetch anything live.

1. The weekly pattern (flight number, route, local departure and arrival times, days of operation, aircraft) was collected from public per-flight schedule pages for every Finnair route from Helsinki, and an independent second pass over 20 routes served as a cross-check.
2. `scripts/finavia.mjs` fetches one day of Finavia's public flight information (key in `~/finavia` or `FINAVIA_KEY`, never printed; gateway `apigw.finavia.fi`) and `scripts/merge-weekly.mjs` reconciles the collected week against it: reference rows win on the routes they cover, main rows fill the rest, and any service operating on the sampled weekday whose Finnish-end time disagrees with Finavia by more than ten minutes is moved to Finavia's time with its block time kept.
3. `scripts/bake-weekly.mjs` stamps the local times onto the reference week with each airport's offset (`scripts/zones.mjs`), keeps the partner highlights whose gateway is on the sheet, and writes `public/demo.mjs`.

4. `scripts/correct-network.mjs` records a verification pass over the finished sheet: every change it makes carries the source that justifies it. Finnair's own timetable pages sit behind Akamai and answer 403 to any automated client, so the evidence is Finavia's live movement data for anything touching Finland, plus published schedule filings and route announcements beyond it. That pass added Alta, Corfu, Kirkenes, Melbourne and Preveza, re-drew Tromsø as a continuation of the Rovaniemi flight, and marked the services that are suspended, wet-leased, or not yet open.

5. `scripts/discover-network.mjs` walks the published Finnair flight index — all 368 airports Finnair departs from, and each origin's destinations with their AY flight numbers — and `scripts/rebuild-codeshares.mjs` builds the partner connections from it. `scripts/verify-codeshares.mjs` then checks every partner leg back against the route pages; it currently passes clean on all 102.

Every service carries a `source` field naming where its schedule was read, shown in the selected-flight panel; [docs/sources.md](docs/sources.md) says what each source is, how far it can be trusted, and where it runs out. `scripts/tag-sources.mjs` fills that field in for the originally collected week.

The partner selection is deliberate rather than exhaustive: Dallas alone carries 82 Finnair-coded destinations, so each gateway draws the most important destination in each region it opens up. An earlier selection was invented, and the audit found none of its 142 legs matched published data while 47 were sectors Finnair places no code on at all. Australia and New Zealand now hang off Hong Kong, where Cathay Pacific actually carries them, rather than Singapore. Times at foreign airports are as published, not estimated.

Finnair reaches several destinations only by continuing a flight beyond its first stop, and the sheet draws each as two legs sharing one flight number rather than as a phantom nonstop: Umeå beyond Vaasa, Tromsø beyond Rovaniemi, Alta beyond Kittilä, Kirkenes beyond Ivalo, and — from 25 October 2026 — Melbourne beyond Bangkok. Melbourne is the one airport reachable both ways, so it carries Finnair's own future service from Bangkok and today's Qantas codeshare from Singapore at once.

## Structure and limitations

- `public/schedule.mjs`: shared validation, filters, weekly-service collapsing and partner connection selection.
- `public/layout.mjs`: D3 force layout, airport sizing, parallel flight lanes, angular obstacle routing and label placement.
- `public/app.mjs`: interactive SVG rendering and browser controls.
- `public/demo.mjs`: the baked weekly Finnair sheet (see "How the built-in sheet is made").
- `server.mjs`: static server and normalized schedule feed.
- `test/`: data integrity, time handling, layout and HTTP handler tests.
- `docs/landscape.md`: existing products and data-source research.

The Finnair sheet uses a tiered layout: domestic Finland above the hub, Scandinavia, Britain and North America to the left in three columns, Asia to the right in two, and Europe below in six rows, with partner satellites placed on the side of their gateway that faces away from Helsinki. Imported schedules without a Helsinki hub fall back to D3 repulsion with geographic anchors, followed by rectangular collision resolution. Airport boxes and type scale with service volume relative to the sheet’s median, using a capped logarithmic scale. Flights share an evenly spaced parallel route bundle, clipped against the edges of the city boxes. A visibility-graph router adds sharp bends around intervening airports while keeping lane spacing consistent. Busy city boxes grow to fit their largest route bundle. Labels use measured, locally hosted condensed fonts and try several positions and suppress unavoidable overlaps until hover, focus or selection. Layout is deterministic and cached across zoom and unchanged refreshes. Busy networks can still have crossing flight lines; filter and zoom for legibility. It is a first version for regional sheets, not a full global route-layout optimizer. It does not yet import arbitrary airline webpages, PDF schedules, SSIM or raw vendor responses. Codeshares should be deduplicated by your input pipeline when you want one arrow per physical flight.

## Vintage design

The demo sheet carries Finnair's 1968–1999 logotype (blue disc with the winged F and the italic wordmark) in its masthead and panel, from the vector at [logos-download.com](https://logos-download.com/brands/finnair) (`public/logo.mjs`). It is a Finnair trademark used here for the illustrative sheet only; schedules without a `logo` field show their title as a plain wordmark.

The visual reference is Finnair’s 1974 international network timetable: [archived sheet](https://www.timetableimages.com/ttimages/ay/ay74/ay74-4.jpg). The [1968 timetable](https://www.timetableimages.com/ttimages/ay6811.htm) also informed the blue/black print palette and compact type. These are design references; their scans are not bundled into the app.

Oswald 600 supplies the condensed headings and city names. Roboto Condensed 400/700 supplies schedule details and controls. These are contemporary open-licensed approximations of the period’s condensed lettering, not an assertion about the original fonts. Fonts are served locally; the build copies their license files to `public/dist/fonts`. SVG exports embed the fonts and styles.

The map fills the browser window. Drag to pan, scroll or pinch to zoom, and use Fit to show the sheet. The floating filters and timetable panels collapse via their headings. With the map focused, arrow keys pan, +/− zoom, and 0 fits. Each route receives a separate interval on the airport edge, with perpendicular approaches and fixed 14-unit parallel lane spacing.

The example network includes all destinations across Europe, the Nordics, Asia, the Middle East and North America, plus all domestic airports (122 direct airports, 476 illustrative services in total with complete frequencies and operating days). Destination reference: [Finavia's summer/autumn 2026 route listing](https://www.finavia.fi/en/newsroom/2026/route-listing-where-can-you-fly-finavia-airports-during-summer-and-autumn-2026) and Finnair global network announcements. Times, operating day frequencies (`#` for daily, `①`–`⑦` for days of week), flight numbers and aircraft assignments reflect Summer/Autumn 2026 timetable patterns. International timestamps use explicit local UTC offsets, including Delhi's half-hour offset.

In addition to the direct network, the atlas includes a set of illustrative partner connections via key oneworld partners British Airways (via London Heathrow `LHR`), Qatar Airways (via Doha `DOH`), Qantas (via Singapore `SIN`), American Airlines (via Miami `MIA`, Dallas `DFW`, Los Angeles `LAX`), Alaska Airlines (via Seattle `SEA`), Japan Airlines (via Tokyo Haneda `HND`), and Cathay Pacific (via Hong Kong `HKG`):
- **United Kingdom & Crown Territories (via LHR with British Airways)**: Belfast City (`BHD`), Glasgow (`GLA`), Aberdeen (`ABZ`), Newcastle (`NCL`), Jersey (`JER`), Gibraltar (`GIB`), Grand Cayman (`GCM`).
- **Atlantic, Caribbean & West Africa (via LHR with British Airways)**: Boston (`BOS`), Washington Dulles (`IAD`), Bermuda (`BDA`), Barbados (`BGI`), Nassau (`NAS`), Lagos (`LOS`), Accra (`ACC`).
- **Australia & New Zealand (via SIN with Qantas)**: Sydney (`SYD`), Brisbane (`BNE`), Perth (`PER`), Adelaide (`ADL`), Canberra (`CBR`), Cairns (`CNS`), Darwin (`DRW`), Hobart (`HBA`), Gold Coast (`OOL`), Auckland (`AKL`), Christchurch (`CHC`), complementing Finnair's direct service to Melbourne (`MEL`).
- **South America & Caribbean (via MIA with American Airlines)**: Bogotá (`BOG`), Lima (`LIM`), Medellín (`MDE`), Quito (`UIO`), Santiago (`SCL`), Rio de Janeiro (`GIG`), São Paulo (`GRU`), Montevideo (`MVD`), Buenos Aires (`EZE`), San Juan (`SJU`).
- **Mexico & Texas (via DFW with American Airlines)**: Mexico City (`MEX`), Cancún (`CUN`), Austin (`AUS`).
- **Western USA & Pacific (via LAX with American Airlines)**: San Francisco (`SFO`), Las Vegas (`LAS`), Phoenix (`PHX`), San Diego (`SAN`), Denver (`DEN`), Honolulu (`HNL`).
- **Midwest (via ORD with American Airlines)**: Minneapolis (`MSP`), Detroit (`DTW`), St. Louis (`STL`), Nashville (`BNA`).
- **East Coast (via JFK with American Airlines)**: Charlotte (`CLT`), Philadelphia (`PHL`), Raleigh-Durham (`RDU`), Orlando (`MCO`).
- **Pacific Northwest & Alaska (via SEA with Alaska Airlines)**: Anchorage (`ANC`), Portland (`PDX`).
- **Japan Domestic (via HND with Japan Airlines)**: Sapporo New Chitose (`CTS`), Fukuoka (`FUK`), Okinawa Naha (`OKA`).
- **East & Southeast Asia (via SIN & HKG)**: Denpasar/Bali (`DPS`), Jakarta (`CGK`), Kuala Lumpur (`KUL`), Penang (`PEN`), Ho Chi Minh City (`SGN`), Hanoi (`HAN`), Manila (`MNL`), Taipei (`TPE`), Cebu (`CEB`).
- **Africa & Middle East (via DOH with Qatar Airways)**: Cairo (`CAI`), Amman (`AMM`), Nairobi (`NBO`), Zanzibar (`ZNZ`), Johannesburg (`JNB`), Cape Town (`CPT`), Mahé/Seychelles (`SEZ`), Muscat (`MCT`), Riyadh (`RUH`), Jeddah (`JED`).
- **South Asia & Indian Ocean (via DOH with Qatar Airways)**: Mumbai (`BOM`), Bengaluru (`BLR`), Colombo (`CMB`), Malé/Maldives (`MLE`).

Partner flights are not shown exhaustively. For each partner hub the sheet keeps only the **most likely connections**: for every Finnair arrival at the hub, the earliest partner departure to each destination at least 60 minutes later (the next day if nothing fits), and for every Finnair departure the latest partner arrival that still leaves 60 minutes. Days of operation must overlap. The details panel names the Finnair flight each partner service connects with and the waiting time. The demo carries one partner flight per direction per destination, so all of them remain as highlights. A "Partner connections at oneworld hubs" toggle in the toolbar switches between the direct Finnair network and the combined network with partner connections. Codeshare routes are highlighted in vintage amber (`#b36200`) with dashed routing, partner carrier indicators (`op. by British Airways`, `op. by Qatar Airways`, `op. by Qantas`, `op. by American Airlines`, `op. by Alaska Airlines`, `op. by Japan Airlines`, `op. by Cathay Pacific`), operator flight numbers, and connecting hub badges (`VIA LHR`, `VIA DOH`, `VIA SIN`, `VIA MIA`, `VIA DFW`, `VIA LAX`, `VIA SEA`, `VIA HND`, `VIA HKG`).

The 1974 timetable reference guides notation: departure and arrival times run along each lane beside the arrow endpoint as `13.35`, outside ordinary airport boxes and just inside large hubs. The flight number, operating days and aircraft code (`AY431 # A321`) sit inline on the route in the route's own ink, on a paper plate that interrupts the line. Every route also carries a 7-unit paper under-stroke, so where routes cross, the line passing underneath shows a small break as on the printed sheet. Layout routing keeps airport boxes at least 40 units apart and routes every bundle around unrelated boxes. Route crossings are unavoidable in a network this dense; ports along each hub edge are ordered by bearing from a fan centre behind the edge, which halved the crossing count, and every crossing is drawn with a paper break in the lower line.

Rendering performance is optimized for high-density networks: the route router searches a corridor of boxes near each bundle (320 then 900 units) instead of every corner on the sheet, which keeps the full weekly layout under 200 ms; label placement rejects candidates by bounding box before the rotated-rectangle test; airports, routes and labels are laid out in separate tasks so the page stays responsive, and the three fonts are preloaded so the first paint does not shift; event handling on the SVG map and flight list is fully delegated, viewport transformations are batched via `requestAnimationFrame`, and flight selection uses targeted DOM class toggling without full-tree re-renders. Labels are rendered on a separate top layer and linked to their route by id, so hover, focus and selection highlight the line, its edge times and its label together.

Airport boxes are chamfered eight-sided polygons with white paper fill, a thin near-black outline and blue city names, following the reference. Partner-served codeshare airports use a dashed brown outline with black names and a `VIA LHR · British Airways` line; gateway hubs use a heavier blue outline. The central hub carries a double rule and a title sized to its box; its interior is otherwise left quiet, as on the reference. The engine also supports stepped/notched polygons (`shape: "stepped"`), hexagons (`shape: "hexagon"`) and custom vertex arrays (`polygon: [[x, y], ...]`) via imported schedule files.

The winter 2026/27 destinations — Miami, Phuket, Las Palmas, Tenerife, Innsbruck and the return of Tampere — are drawn with their real flight numbers and **no timings at all**. The winter schedules are not published yet: every route page stops at 24 October 2026, the last day of the summer season. Rather than invent clock times for an unpublished season, those routes carry only their opening date. Tampere carries not even a number, because none is filed.

Three reference marks cover services the week itself cannot show, each explained in the notation column with a drawn line sample. A route that has not opened yet keeps its ink and turns to fine dots, with its first date on the label as `▷25.10.`; a suspended route takes a long dash-dot and no times; a wet-leased aircraft gets a dagger after the flight label, because Finnair operates no 737s of its own and every one on the sheet is a leased airframe. A fifth-freedom sector, which sells as a flight in its own right without the Helsinki leg, is marked `⁵`.

Helsinki's hub box reads `HELSINKI / HELSINGFORS · SEUTULA`: the airport was officially Seutula until it was renamed Helsinki-Vantaa in 1977, so the sheet's own 1974 reference would have said so.

The sheet is composed like a printed timetable: a masthead with the title, edition line, date and counts sits above a framed diagram, and a three-column explanations box (days of operation, the aircraft codes present on the sheet, and notation with drawn line samples) sits at its foot. Masthead and legend scale with sheet width, so they remain legible at the Fit view even for a 600-flight network. Illustrative data is marked as such in the masthead.

## Licence

Code and documentation are released under the [MIT License](LICENSE); see [NOTICE](NOTICE) for what is excluded: the Finnair name and logotype (Finnair Oyj trademarks, used for illustration only), the reference scans, and the fonts under their own licences. The schedule data is illustrative and must not be relied on for travel.

## Publishing

`npm run build` also writes a self-contained static site to `site/`: the page, bundle, fonts, cache and `nosniff` headers, and the baked `schedule.json`. The static page names that file in a `schedule-source` meta tag, so it reads the baked schedule directly and never calls `api/schedule`. Any host that serves the folder as is will work.

The live sheet is deployed to Cloudflare from `wrangler.jsonc`, which serves `site/` as static assets:

```
npm run deploy
```

That builds first, then uploads.

Production deploys are automatic. Cloudflare builds the repository on every push to `main`, running `npm ci && npm test && npm run build` and then `npx wrangler deploy`, so a failing test blocks the deploy. No API token is stored in GitHub. The workflow in `.github/workflows/ci.yml` runs the same tests on pull requests.
