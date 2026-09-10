import test from 'node:test';
import assert from 'node:assert/strict';
import demo from '../public/demo.mjs';
import {validateSchedule, filterFlights} from '../public/schedule.mjs';
import {layoutAirports, layoutFlights, curvePoint} from '../public/layout.mjs';

test('validates 20 codeshare destinations and partner flights', () => {
  assert.equal(demo.codeshareAirports.length, 20);
  assert.equal(demo.codeshareFlights.length, 40);

  const validated = validateSchedule({
    ...demo,
    airports: [...demo.airports, ...demo.codeshareAirports],
    flights: [...demo.flights, ...demo.codeshareFlights]
  });

  assert.equal(validated.airports.length, 142);
  assert.equal(validated.flights.length, 516);
});

test('partner codeshares include Qatar Airways and Qantas connections', () => {
  const qatarFlights = demo.codeshareFlights.filter(f => f.operator === 'Qatar Airways');
  const qantasFlights = demo.codeshareFlights.filter(f => f.operator === 'Qantas');
  assert.ok(qatarFlights.length >= 20, 'Includes Qatar Airways flights via Doha');
  assert.ok(qantasFlights.length >= 10, 'Includes Qantas flights via Singapore/LAX');

  const australasia = ['SYD', 'BNE', 'PER', 'ADL', 'AKL'];
  for (const code of australasia) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Australasia destination ${code}`);
  }

  const africa = ['JNB', 'CPT', 'NBO', 'CAI'];
  for (const code of africa) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Africa destination ${code}`);
  }
});

test('combined 142-airport network layout has zero box overlaps', () => {
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
          assert.ok(Math.abs(p.x - n.x) >= n.width / 2 || Math.abs(p.y - n.y) >= n.height / 2, `${r.flight.id} crosses ${n.code}`);
        }
      }
    }
  }
});

test('filterFlights can filter codeshares on or off', () => {
  const allFlights = [...demo.flights, ...demo.codeshareFlights];
  const withCS = filterFlights(allFlights, {codeshares: true});
  const withoutCS = filterFlights(allFlights, {codeshares: false});
  assert.equal(withCS.length, 516);
  assert.equal(withoutCS.length, 476);
});
