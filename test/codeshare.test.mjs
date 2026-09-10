import test from 'node:test';
import assert from 'node:assert/strict';
import demo from '../public/demo.mjs';
import {validateSchedule, filterFlights} from '../public/schedule.mjs';
import {layoutAirports, layoutFlights, curvePoint} from '../public/layout.mjs';

test('validates 58 codeshare destinations and partner flights', () => {
  assert.equal(demo.codeshareAirports.length, 58);
  assert.equal(demo.codeshareFlights.length, 116);

  const validated = validateSchedule({
    ...demo,
    airports: [...demo.airports, ...demo.codeshareAirports],
    flights: [...demo.flights, ...demo.codeshareFlights]
  });

  assert.equal(validated.airports.length, 180);
  assert.equal(validated.flights.length, 592);
});

test('partner codeshares include key oneworld partner airlines and hubs', () => {
  const qatarFlights = demo.codeshareFlights.filter(f => f.operator === 'Qatar Airways');
  const qantasFlights = demo.codeshareFlights.filter(f => f.operator === 'Qantas');
  const americanFlights = demo.codeshareFlights.filter(f => f.operator === 'American Airlines');
  const alaskaFlights = demo.codeshareFlights.filter(f => f.operator === 'Alaska Airlines');
  const jalFlights = demo.codeshareFlights.filter(f => f.operator === 'Japan Airlines');
  const cathayFlights = demo.codeshareFlights.filter(f => f.operator === 'Cathay Pacific');

  assert.ok(qatarFlights.length >= 28, 'Includes Qatar Airways flights via Doha');
  assert.ok(qantasFlights.length >= 24, 'Includes Qantas flights via Singapore');
  assert.ok(americanFlights.length >= 30, 'Includes American Airlines flights via Miami, Dallas, LA');
  assert.ok(alaskaFlights.length >= 4, 'Includes Alaska Airlines flights via Seattle');
  assert.ok(jalFlights.length >= 6, 'Includes Japan Airlines flights via Tokyo Haneda');
  assert.ok(cathayFlights.length >= 2, 'Includes Cathay Pacific flights via Hong Kong');

  const australasia = ['SYD', 'BNE', 'PER', 'ADL', 'AKL', 'CBR', 'CHC', 'CNS', 'DRW', 'HBA', 'OOL'];
  for (const code of australasia) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Australasia destination ${code}`);
  }

  const southAmerica = ['BOG', 'LIM', 'MDE', 'UIO', 'SCL', 'GIG', 'GRU', 'MVD', 'EZE'];
  for (const code of southAmerica) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes South America destination ${code}`);
  }

  const africa = ['JNB', 'CPT', 'NBO', 'CAI', 'ZNZ'];
  for (const code of africa) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Africa destination ${code}`);
  }

  const japan = ['CTS', 'FUK', 'OKA'];
  for (const code of japan) {
    assert.ok(demo.codeshareAirports.some(a => a.code === code), `Includes Japan destination ${code}`);
  }
});

test('combined 180-airport network layout has zero box overlaps', () => {
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
  assert.equal(withCS.length, 592);
  assert.equal(withoutCS.length, 476);
});
