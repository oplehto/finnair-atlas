# Airline Atlas

A scrollable, interactive flight timetable inspired by vintage Finnair network diagrams. Each flight is an arrow with its departure time, flight number and arrival time. Airport locations are schematic.

## Run

Requires Node.js 22 or newer. Uses D3 force layout; esbuild bundles the browser code.

```sh
npm install
npm start
# http://localhost:4173
npm test
```

The default sheet is an **illustrative Finnair-style dataset**, not a verified current timetable. Flight numbers, times, aircraft and some routes are synthetic. Do not use it to plan travel.

## Use any airline

Click **Import schedule** with a JSON file in the format below. The title, airports and airlines come from that file. The import stays in the browser's memory and pauses feed refresh; reloading or pressing Refresh schedule returns to the server feed. Search matches airport codes, airline names and flight numbers. Departure dates use the local date written in each timestamp.

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

## Automatically refreshed schedules

A provider adapter or existing pipeline must produce the same JSON format. This version does **not** ship with a verified Finnair/Finavia API adapter or data subscription.

To watch an existing schedule file (replace it atomically when updating):

```sh
SCHEDULE_FILE=/absolute/path/schedule.json npm start
```

To fetch an HTTPS JSON feed:

```sh
SCHEDULE_URL=https://your-provider.example/schedule.json npm start
```

An optional `SCHEDULE_TOKEN` environment variable adds a server-side Bearer token. Never put credentials in client files. Provider data is cached for 60 seconds, and visible browser tabs poll every minute. The last successfully displayed sheet remains on screen if fetching fails, with an error notice. Metadata says when the browser loaded the data; provider freshness should be included in `source`.

The local server binds only to 127.0.0.1. `PORT` overrides 4173. Hosting and a public deployment are not configured.

## Structure and limitations

- `public/schedule.mjs`: shared validation and filters.
- `public/layout.mjs`: D3 force layout, airport sizing, parallel flight lanes, angular obstacle routing and label placement.
- `public/app.mjs`: interactive SVG rendering and browser controls.
- `public/demo.mjs`: synthetic first-run Finnair example.
- `server.mjs`: static server and normalized schedule feed.
- `test/`: data integrity, time handling, layout and HTTP handler tests.
- `docs/landscape.md`: existing products and data-source research.

Layout uses D3 repulsion and geographic anchors, followed by rectangular collision resolution. Airport boxes and type scale with service volume relative to the sheet’s median, using a capped logarithmic scale. Flights share an evenly spaced parallel route bundle, clipped against the edges of the city boxes. A visibility-graph router adds sharp bends around intervening airports while keeping lane spacing consistent. Busy city boxes grow to fit their largest route bundle. Labels use measured, locally hosted condensed fonts and try several positions and suppress unavoidable overlaps until hover, focus or selection. Layout is deterministic and cached across zoom and unchanged refreshes. Busy networks can still have crossing flight lines; filter and zoom for legibility. It is a first version for regional sheets, not a full global route-layout optimizer. It does not yet import arbitrary airline webpages, PDF schedules, SSIM or raw vendor responses. Codeshares should be deduplicated by your input pipeline when you want one arrow per physical flight.

## Vintage design

The visual reference is Finnair’s 1974 international network timetable: [archived sheet](https://www.timetableimages.com/ttimages/ay/ay74/ay74-4.jpg). The [1968 timetable](https://www.timetableimages.com/ttimages/ay6811.htm) also informed the blue/black print palette and compact type. These are design references; their scans are not bundled into the app.

Oswald 600 supplies the condensed headings and city names. Roboto Condensed 400/700 supplies schedule details and controls. These are contemporary open-licensed approximations of the period’s condensed lettering, not an assertion about the original fonts. Fonts are served locally; the build copies their license files to `public/dist/fonts`. SVG exports embed the fonts and styles.

The map fills the browser window. Drag to pan, scroll or pinch to zoom, and use Fit to show the sheet. The floating filters and timetable panels collapse via their headings. With the map focused, arrow keys pan, +/− zoom, and 0 fits. Each route receives a separate interval on the airport edge, with perpendicular approaches and fixed 14-unit parallel lane spacing.

The example network includes 40 representative international destinations across Europe, Asia and North America, plus the domestic airports (52 airports, 128 illustrative services in total). Destination reference: [Finavia's summer/autumn 2026 route listing](https://www.finavia.fi/en/newsroom/2026/route-listing-where-can-you-fly-finavia-airports-during-summer-and-autumn-2026). It is not a complete live Finnair schedule; times, frequencies, flight numbers and aircraft assignments are examples. International timestamps use explicit local UTC offsets, including Delhi's half-hour offset.

The 1974 timetable reference guides notation: departure and arrival times appear at the corresponding airport edges as `13.35`; flight number and compact aircraft type sit along the line. Paper-coloured gaps separate crossing lines. Worldwide distances are compressed, with geographical ordering and collision constraints keeping the diagram compact. Hub dimensions grow with service volume.
