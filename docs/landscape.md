# Existing products and source options

Checked 2026-09-10. This is a focused landscape check, not proof of worldwide uniqueness. Product descriptions reflect publicly accessible pages rather than a hands-on evaluation of every feature.

| Product | Relevant overlap | Difference to investigate |
| --- | --- | --- |
| [FlightConnections, Finnair](https://www.flightconnections.com/route-map-finnair-ay) | Interactive Finnair routes and destinations | Geographic route exploration; no vintage per-flight parallel-arrow sheet found |
| [explore.flights](https://explore.flights/) | Flight schedules, flight lookup, airport networks and changes | Strong schedule browsing precedent, with a limited set of supported carriers |
| [AirGantt](https://airgantt.com/) | Web-based airline schedule visualization, scroll/zoom, real-time events | Operations-oriented Gantt timelines rather than geographic timetable sheets; page age means current maintenance needs checking |
| [ScapeLens](https://scapelens.com/) | Airport/airline network explorer with schedule records and aircraft details | Modern route-map interface; close functional overlap |
| [RouteMapper](https://www.routemapper.com/about.html) | Route visualization and airline schedule snapshot comparisons | Professional geographic route analysis rather than a line for each timed service |
| [Finnair timetables](https://www.finnair.com/en/timetables) | Official route-by-route calendar with flight times and aircraft details | Source/reference, not a full-network graphic |

Conclusion: similar tools definitely exist. The potential distinction is a readable, exportable, vintage-inspired network timetable that exposes each flight's times directly on parallel directional lines. The search did not identify an exact replica of the supplied reference as a current live web app. This is a design opportunity, not a uniqueness guarantee.

## Current Finnair schedule data

[Finnair's own timetable](https://www.finnair.com/en/timetables) is the authoritative consumer-facing reference. It includes all flights marketed under AY; the operating airline can be a partner. This distinction matters when deciding whether “Finnair” means marketed or operated flights. The page warns schedules can change.

[Finavia's developer portal](https://apiportal.finavia.fi/) advertises a free public-flights API for Finnish airports with signup. It is a candidate for a Finland-first feed, not evidence of complete global Finnair schedule coverage. Endpoint schemas and credentials still need to be obtained and tested before building a provider-specific adapter.

A full multi-airline schedule product needs a confirmed data source with suitable coverage and redistribution terms. Airline Atlas currently accepts a documented common format from any such source and refreshes it. No current schedule feed has been connected, and the default dataset is synthetic.
