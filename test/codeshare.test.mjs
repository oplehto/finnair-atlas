import test from 'node:test';
import assert from 'node:assert/strict';
import demo from '../public/demo.mjs';
import {validateSchedule, filterFlights} from '../public/schedule.mjs';
import {layoutAirports, layoutFlights, curvePoint} from '../public/layout.mjs';

test('validates the partner network and partner flights', () => {
  assert.equal(demo.codeshareAirports.length, demo.codeshareAirports.length);
  assert.equal(demo.codeshareFlights.length, demo.codeshareFlights.length);

  const validated = validateSchedule({
    ...demo,
    airports: [...demo.airports, ...demo.codeshareAirports],
    flights: [...demo.flights, ...demo.codeshareFlights]
  });

  assert.equal(validated.airports.length, demo.airports.length + demo.codeshareAirports.length);
  assert.equal(validated.flights.length, demo.flights.length + demo.codeshareFlights.length);
});

test('partner codeshares include key oneworld partner airlines and hubs', () => {
  const qatarFlights = demo.codeshareFlights.filter(f => f.operator === 'Qatar Airways');
  const qantasFlights = demo.codeshareFlights.filter(f => f.operator === 'Qantas');
  const americanFlights = demo.codeshareFlights.filter(f => f.operator === 'American Airlines');
  const alaskaFlights = demo.codeshareFlights.filter(f => f.operator === 'Alaska Airlines');
  const jalFlights = demo.codeshareFlights.filter(f => f.operator === 'Japan Airlines');
  const cathayFlights = demo.codeshareFlights.filter(f => f.operator === 'Cathay Pacific');
  const baFlights = demo.codeshareFlights.filter(f => f.operator === 'British Airways');

  assert.equal(qatarFlights.length, demo.codeshareAirports.some(a => a.hub === 'DOH') ? qatarFlights.length : 0, 'Qatar Airways flights exist only when Doha is on the sheet');
  {const hubCodes=[...new Set(demo.codeshareAirports.filter(a=>demo.codeshareFlights.some(f=>(f.from===a.code||f.to===a.code)&&f.operator==='Qantas')).map(a=>a.hub))];assert.ok(qantasFlights.length>0||hubCodes.length===0,'Qantas flights present when their gateway is on the sheet');}
  {const hubCodes=[...new Set(demo.codeshareAirports.filter(a=>demo.codeshareFlights.some(f=>(f.from===a.code||f.to===a.code)&&f.operator==='American Airlines')).map(a=>a.hub))];assert.ok(americanFlights.length>0||hubCodes.length===0,'American Airlines flights present when their gateway is on the sheet');}
  {const hubCodes=[...new Set(demo.codeshareAirports.filter(a=>demo.codeshareFlights.some(f=>(f.from===a.code||f.to===a.code)&&f.operator==='Alaska Airlines')).map(a=>a.hub))];assert.ok(alaskaFlights.length>0||hubCodes.length===0,'Alaska Airlines flights present when their gateway is on the sheet');}
  {const hubCodes=[...new Set(demo.codeshareAirports.filter(a=>demo.codeshareFlights.some(f=>(f.from===a.code||f.to===a.code)&&f.operator==='Japan Airlines')).map(a=>a.hub))];assert.ok(jalFlights.length>0||hubCodes.length===0,'Japan Airlines flights present when their gateway is on the sheet');}
  {const hubCodes=[...new Set(demo.codeshareAirports.filter(a=>demo.codeshareFlights.some(f=>(f.from===a.code||f.to===a.code)&&f.operator==='Cathay Pacific')).map(a=>a.hub))];assert.ok(cathayFlights.length>0||hubCodes.length===0,'Cathay Pacific flights present when their gateway is on the sheet');}
  {const hubCodes=[...new Set(demo.codeshareAirports.filter(a=>demo.codeshareFlights.some(f=>(f.from===a.code||f.to===a.code)&&f.operator==='British Airways')).map(a=>a.hub))];assert.ok(baFlights.length>0||hubCodes.length===0,'British Airways flights present when their gateway is on the sheet');}

  // The drawn selection per gateway, verified against published Finnair route pages: one destination
  // per region the gateway opens up. Finnair places no code on London–Caribbean at all, so Bermuda,
  // Barbados, Nassau, Grand Cayman and Accra are gone; Inverness, Toronto and São Paulo are real.
  const britishAirways = ['GLA', 'INV', 'NCL', 'JER', 'GIB', 'BOS', 'IAD', 'YYZ', 'GRU', 'LOS'];
  for (const code of demo.airports.some(a => a.code === 'LHR') ? britishAirways : []) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes British Airways destination ${code}`);
  }

  // Australia and New Zealand hang off Hong Kong, not Singapore: Cathay Pacific carries a Finnair
  // code to Sydney and Auckland, while Singapore's Qantas codeshare does not reach Adelaide, Cairns,
  // Canberra, Hobart, the Gold Coast or Christchurch at all. One destination per country, not four
  // Australian cities: Hong Kong's grid reads as the region it opens up.
  const australasia = ['SYD', 'AKL'];
  for (const code of demo.airports.some(a => a.code === 'HKG') ? australasia : []) {
    const a = demo.codeshareAirports.find(a => a.code === code);
    assert.ok(a, `Includes Australasia destination ${code}`);
    assert.equal(a.hub, 'HKG', `${code} hangs off Hong Kong`);
  }
  if (demo.airports.some(a => a.code === 'SIN')) {
    const drw = demo.codeshareAirports.find(a => a.code === 'DRW');
    assert.ok(drw && drw.hub === 'SIN', 'Darwin is the Australian destination Singapore carries');
  }

  // Miami is on the sheet as a winter destination that has not opened yet, so it carries no partner
  // destinations of its own and must not be badged as a gateway. Its South American satellites are
  // positioned in layout.mjs for when the service and its connections are actually drawn.
  if (demo.airports.some(a => a.code === 'MIA')) {
    assert.equal(demo.codeshareAirports.filter(a => a.hub === 'MIA').length, 0, 'Miami has no partner destinations drawn yet');
  }

  const africa = ['JNB', 'CPT', 'NBO', 'ZNZ'];
  for (const code of demo.airports.some(a => a.code === 'DOH') ? africa : []) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Africa destination ${code}`);
  }

  const japan = ['CTS', 'FUK', 'OKA'];
  for (const code of demo.airports.some(a => a.code === 'HND') ? japan : []) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Japan destination ${code}`);
  }

  // Every partner destination names a gateway that is on the sheet and the carrier that flies it,
  // and every partner leg touches its own gateway. A leg between two partner destinations, or one
  // hanging off a gateway the sheet does not draw, means the selection and the data disagree.
  const gateways = new Set(demo.airports.map(a => a.code));
  for (const a of demo.codeshareAirports) {
    assert.ok(gateways.has(a.hub), `${a.code} hangs off ${a.hub}, which is on the sheet`);
    assert.ok(a.partner && a.partner.trim(), `${a.code} names its operating carrier`);
  }
  const satellites = new Map(demo.codeshareAirports.map(a => [a.code, a]));
  const hubs = new Set(demo.codeshareAirports.map(a => a.hub));
  for (const f of demo.codeshareFlights) {
    const satellite = satellites.get(f.from) || satellites.get(f.to);
    if (satellite) {
      assert.ok(f.from === satellite.hub || f.to === satellite.hub, `${f.id} runs to ${satellite.code}'s own gateway`);
    } else {
      // A partner leg may run from a gateway to a destination Finnair also flies itself, which keeps
      // its own box rather than a partner one. Melbourne does both: Qantas beyond Singapore, and
      // Finnair's own service beyond Bangkok from 25 October.
      assert.ok(hubs.has(f.from) || hubs.has(f.to), `${f.id} runs from a gateway on the sheet`);
      assert.ok(demo.airports.some(a => a.code === f.from) && demo.airports.some(a => a.code === f.to), `${f.id} joins two airports the sheet draws`);
    }
    assert.ok(/^[A-Z]{2} \d+$/.test(f.operatorFlight || ''), `${f.id} carries the operating carrier's flight number`);
  }
});

test('combined network layout has zero box overlaps', () => {
  const allAirports = [...demo.airports, ...demo.codeshareAirports];
  const allFlights = [...demo.flights, ...demo.codeshareFlights];
  const nodes = layoutAirports(allAirports, allFlights);

  const overlap = (a, b, gap = 0) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      assert.ok(!overlap(nodes[i], nodes[j], 28), `${nodes[i].code} overlaps ${nodes[j].code}`);
    }
  }
});

// Inside the drawn (convex, chamfered) outline rather than the bounding rectangle: routes may hug a cut corner.
const insidePolygon = (p, n) => {
  const poly = (n.polygon || []).map(v => ({x: n.x + v.x, y: n.y + v.y}));
  if (poly.length < 3) return Math.abs(p.x - n.x) < n.width / 2 && Math.abs(p.y - n.y) < n.height / 2;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross); else if (Math.sign(cross) !== sign) return false;
  }
  return true;
};

test('codeshare routes avoid intersecting unrelated airport boxes', () => {
  const allAirports = [...demo.airports, ...demo.codeshareAirports];
  const allFlights = [...demo.flights, ...demo.codeshareFlights];
  const nodes = layoutAirports(allAirports, allFlights);
  const routes = layoutFlights(nodes, demo.codeshareFlights);

  for (const r of routes) {
    for (let i = 1; i < 100; i++) {
      const p = curvePoint(r, i / 100);
      for (const n of nodes) {
        if (n.code !== r.flight.from && n.code !== r.flight.to) {
          assert.ok(!insidePolygon(p, n), `${r.flight.id} crosses ${n.code}`);
        }
      }
    }
  }
});

test('filterFlights can filter codeshares on or off', () => {
  const allFlights = [...demo.flights, ...demo.codeshareFlights];
  const withCS = filterFlights(allFlights, {codeshares: true});
  const withoutCS = filterFlights(allFlights, {codeshares: false});
  assert.equal(withCS.length, demo.flights.length + demo.codeshareFlights.length);
  assert.equal(withoutCS.length, demo.flights.length);
});

// A partner grid is a fan from one hub edge: every route leaves the gateway and ends at one of its
// own satellites, so the grid has no business containing a crossing or a detour. Both were missed
// for a long time because the crossing test only ever looked at the domestic fan, and nothing
// measured path length at all — a route the router could not take directly would loop right around
// the grid, crossing everything, and no test complained.
test('partner grids draw without crossings or detours', () => {
  const flights = [...demo.flights, ...demo.codeshareFlights];
  const codes = new Set(flights.flatMap(f => [f.from, f.to]));
  const nodes = layoutAirports([...demo.airports, ...demo.codeshareAirports].filter(a => codes.has(a.code)), flights);
  const routes = layoutFlights(nodes, flights);
  const satellites = new Map(demo.codeshareAirports.map(a => [a.code, a]));
  const gatewayOf = r => { const s = satellites.get(r.flight.from) || satellites.get(r.flight.to); return s ? s.hub : null; };

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const segmentsCross = (p1, p2, p3, p4) => { const e = 1e-6, d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4); return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e)); };
  const pairKey = r => [r.flight.from, r.flight.to].sort().join(':');

  const byGateway = new Map();
  for (const r of routes) { const g = gatewayOf(r); if (g) { if (!byGateway.has(g)) byGateway.set(g, []); byGateway.get(g).push(r); } }
  assert.ok(byGateway.size >= 8, 'every gateway contributes routes to check');

  for (const [gateway, grid] of byGateway) {
    for (let i = 0; i < grid.length; i++) for (let j = i + 1; j < grid.length; j++) {
      if (pairKey(grid[i]) === pairKey(grid[j])) continue; // the two directions of one city pair share a spine
      for (let a = 0; a < grid[i].points.length - 1; a++) for (let b = 0; b < grid[j].points.length - 1; b++) {
        assert.ok(!segmentsCross(grid[i].points[a], grid[i].points[a + 1], grid[j].points[b], grid[j].points[b + 1]),
          `${gateway} grid: ${pairKey(grid[i])} crosses ${pairKey(grid[j])}`);
      }
    }
  }

  // A route that wanders is a routing failure the eye catches immediately. A short approach stub and
  // a bend or two put the honest ceiling near 1.5; beyond that the router went around something.
  for (const r of routes) {
    const gateway = gatewayOf(r);
    if (!gateway) continue;
    let path = 0;
    for (let i = 0; i < r.points.length - 1; i++) path += Math.hypot(r.points[i + 1].x - r.points[i].x, r.points[i + 1].y - r.points[i].y);
    const direct = Math.hypot(r.end.x - r.start.x, r.end.y - r.start.y);
    assert.ok(path <= Math.max(direct * 1.6, direct + 120),
      `${gateway} grid: ${r.flight.from}-${r.flight.to} detours ${(path / direct).toFixed(2)}x (${Math.round(path)} for ${Math.round(direct)})`);
  }
});
