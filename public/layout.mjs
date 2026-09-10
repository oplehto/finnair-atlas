import {forceSimulation, forceManyBody, forceX, forceY} from 'd3-force';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const DOMESTIC_CODES = new Set(["HEL","TKU","VAA","OUL","RVN","KTT","IVL","KAJ","KUO","JOE","JYV","MHQ","KAO","KEM","KOK","TMP"]);
const SCANDINAVIA_CODES = new Set(["ARN","OSL","CPH","KEF","GOT","BGO","TOS","TRD","BLL","SVG","BOO","ALF","KKN","UME","VBY","LHR","MAN","EDI","DUB","JFK","ORD","DFW","LAX","SEA","MIA","YYZ"]);
const EAST_CODES = new Set(["DOH","DXB","DEL","BKK","HKT","SIN","HKG","PVG","ICN","HND","NRT","KIX","NGO","MEL"]);

const CODESHARE_OFFSETS = {
  // Pacific via LAX
  SFO: {hub: 'LAX', dx: -500, dy: -140, region: 'west'},
  HNL: {hub: 'LAX', dx: -500, dy: 140, region: 'west'},

  // South America, South Asia, Africa via DOH
  EZE: {hub: 'DOH', dx: 450, dy: -700, region: 'east'},
  GRU: {hub: 'DOH', dx: 450, dy: -400, region: 'east'},
  BOM: {hub: 'DOH', dx: 450, dy: -140, region: 'east'},
  CMB: {hub: 'DOH', dx: 450, dy: 140, region: 'east'},
  MLE: {hub: 'DOH', dx: 450, dy: 420, region: 'east'},
  CAI: {hub: 'DOH', dx: 0, dy: -350, region: 'east'},
  NBO: {hub: 'DOH', dx: 0, dy: -650, region: 'east'},
  JNB: {hub: 'DOH', dx: 0, dy: -950, region: 'east'},
  CPT: {hub: 'DOH', dx: 0, dy: -1250, region: 'east'},

  // Southeast Asia & Australasia via SIN
  KUL: {hub: 'SIN', dx: -450, dy: 0, region: 'east'},
  CGK: {hub: 'SIN', dx: 0, dy: 400, region: 'east'},
  DPS: {hub: 'SIN', dx: 450, dy: 400, region: 'east'},
  MNL: {hub: 'SIN', dx: 450, dy: -400, region: 'east'},
  PER: {hub: 'SIN', dx: 900, dy: 400, region: 'east'},
  ADL: {hub: 'SIN', dx: 900, dy: 700, region: 'east'},
  SYD: {hub: 'SIN', dx: 1350, dy: 700, region: 'east'},
  BNE: {hub: 'SIN', dx: 1350, dy: 1000, region: 'east'},
  AKL: {hub: 'SIN', dx: 1800, dy: 1000, region: 'east'}
};


function regionOf(a) {
  if (DOMESTIC_CODES.has(a.code)) return "north";
  if (SCANDINAVIA_CODES.has(a.code) || a.lon < -30) return "west";
  if (EAST_CODES.has(a.code) || a.lon > 45) return "east";
  return "south";
}

function buildTieredLayout(airportList, flightList, center, counts, largestBundle, bundleCounts) {
  const sortedAirports = [...airportList].sort((a, b) => a.code.localeCompare(b.code));
  
  const regionBundles = {north: [], south: [], west: [], east: []};
  for (const [key, count] of bundleCounts) {
    const codes = key.split(':');
    if (!codes.includes(center.code)) continue;
    const other = sortedAirports.find(a => a.code === codes.find(c => c !== center.code));
    if (!other) continue;
    const reg = regionOf(other);
    regionBundles[reg].push({key, count, other, span: (count - 1) * 14 + 28});
  }

  const northSpan = regionBundles.north.reduce((sum, r) => sum + r.span, 0);
  const southSpan = regionBundles.south.reduce((sum, r) => sum + r.span, 0);
  const westSpan = regionBundles.west.reduce((sum, r) => sum + r.span, 0);
  const eastSpan = regionBundles.east.reduce((sum, r) => sum + r.span, 0);

  const hubWidth = Math.max(724, northSpan + 120, southSpan + 120);
  const hubHeight = Math.max(340, westSpan + 120, eastSpan + 120);

  const HEL_X = 6000, HEL_Y = 5000;

  const nodes = sortedAirports.map(a => {
    const isHub = a.code === center.code;
    const services = counts.get(a.code) || 0;
    const laneSpace = Math.max(0, ((largestBundle.get(a.code) || 1) - 1) * 14 + 32);
    const reg = isHub ? 'north' : regionOf(a);

    let width, height;
    if (isHub) {
      width = hubWidth;
      height = hubHeight;
    } else {
      width = Math.round(Math.max(220, (a.name || a.code).length * 9 + 40, laneSpace + 40));
      height = Math.round(Math.max(130, laneSpace + 40));
    }
    return {
      ...a,
      region: reg,
      isRegionalHub: isHub,
      services,
      width,
      height,
      x: HEL_X,
      y: HEL_Y
    };
  });

  const byCode = new Map(nodes.map(n => [n.code, n]));
  const hub = byCode.get(center.code);

  // --- NORTH (Domestic Finland) ---
  const nTiers = [
    ['MHQ', 'TKU', 'TMP'],
    ['VAA', 'KOK', 'JYV', 'KUO', 'JOE'],
    ['KEM', 'OUL', 'KAJ', 'KAO'],
    ['KTT', 'RVN', 'IVL']
  ];
  const nTierY = [
    HEL_Y - hubHeight / 2 - 400,
    HEL_Y - hubHeight / 2 - 950,
    HEL_Y - hubHeight / 2 - 1500,
    HEL_Y - hubHeight / 2 - 2050
  ];
  nTiers.forEach((tier, tIdx) => {
    const present = tier.map(c => byCode.get(c)).filter(Boolean);
    const y = nTierY[tIdx];
    const count = present.length;
    const flare = 400 * tIdx;
    const xStart = HEL_X - hubWidth / 2 - flare;
    const xEnd = HEL_X + hubWidth / 2 + flare;
    present.forEach((node, cIdx) => {
      node.y = y;
      node.x = xStart + ((cIdx + 0.5) / count) * (xEnd - xStart);
    });
  });

  // --- WEST (Nordics, UK, Ireland, Iceland, North America) ---
  const wTiers = [
    ['UME', 'ARN', 'VBY', 'GOT', 'BLL', 'CPH'],
    ['KKN', 'ALF', 'TOS', 'BOO', 'TRD', 'OSL', 'BGO', 'SVG'],
    ['KEF', 'EDI', 'MAN', 'DUB', 'LHR'],
    ['SEA', 'YYZ', 'ORD', 'JFK', 'DFW', 'LAX', 'MIA']
  ];
  const wTierX = [
    HEL_X - hubWidth / 2 - 600,
    HEL_X - hubWidth / 2 - 1400,
    HEL_X - hubWidth / 2 - 2200,
    HEL_X - hubWidth / 2 - 3100
  ];
  wTiers.forEach((tier, tIdx) => {
    const present = tier.map(c => byCode.get(c)).filter(Boolean);
    const x = wTierX[tIdx];
    const count = present.length;
    const flare = 250 * tIdx;
    const yStart = HEL_Y - hubHeight / 2 - flare;
    const yEnd = HEL_Y + hubHeight / 2 + flare;
    present.forEach((node, cIdx) => {
      node.x = x;
      node.y = yStart + ((cIdx + 0.5) / count) * (yEnd - yStart);
    });
  });

  // --- EAST (Middle East, South Asia, East Asia, Japan, Australia) ---
  const eTiers = [
    ['DOH', 'DXB', 'DEL'],
    ['ICN', 'PVG', 'HKG', 'BKK', 'HKT', 'SIN'],
    ['HND', 'NRT', 'NGO', 'KIX', 'MEL']
  ];
  const eTierX = [
    HEL_X + hubWidth / 2 + 650,
    HEL_X + hubWidth / 2 + 1550,
    HEL_X + hubWidth / 2 + 2450
  ];
  eTiers.forEach((tier, tIdx) => {
    const present = tier.map(c => byCode.get(c)).filter(Boolean);
    const x = eTierX[tIdx];
    const count = present.length;
    const flare = 200 * tIdx;
    const yStart = HEL_Y - hubHeight / 2 - flare;
    const yEnd = HEL_Y + hubHeight / 2 + flare;
    present.forEach((node, cIdx) => {
      node.x = x;
      node.y = yStart + ((cIdx + 0.5) / count) * (yEnd - yStart);
    });
  });

  // --- SOUTH (Europe, Baltics, Mediterranean) ---
  const sTiers = [
    ['HAM', 'BER', 'GDN', 'TLL', 'URE', 'TAY', 'RIX', 'VNO'],
    ['AMS', 'BRU', 'LUX', 'DUS', 'FRA', 'MUC', 'PRG', 'WAW', 'KRK'],
    ['CDG', 'GVA', 'ZRH', 'INN', 'SZG', 'VIE', 'BUD', 'LJU', 'SPU', 'DBV'],
    ['NCE', 'TRN', 'MXP', 'LIN', 'VRN', 'BLQ', 'FLR', 'VCE', 'TIA', 'SKG'],
    ['OPO', 'LIS', 'FAO', 'MAD', 'BCN', 'VLC', 'ALC', 'PMI', 'AGP', 'FCO', 'NAP', 'CTA', 'ATH', 'AYT', 'GZP'],
    ['FNC', 'TFS', 'LPA', 'FUE', 'ACE', 'CFU', 'ZTH', 'CHQ', 'HER', 'JTR', 'KGS', 'RHO', 'PFO', 'LCA']
  ];
  const sTierY = [
    HEL_Y + hubHeight / 2 + 500,
    HEL_Y + hubHeight / 2 + 1150,
    HEL_Y + hubHeight / 2 + 1800,
    HEL_Y + hubHeight / 2 + 2450,
    HEL_Y + hubHeight / 2 + 3150,
    HEL_Y + hubHeight / 2 + 3850
  ];
  sTiers.forEach((tier, tIdx) => {
    const present = tier.map(c => byCode.get(c)).filter(Boolean);
    const y = sTierY[tIdx];
    const count = present.length;
    const flare = 450 * tIdx;
    const xStart = HEL_X - hubWidth / 2 - flare;
    const xEnd = HEL_X + hubWidth / 2 + flare;
    present.forEach((node, cIdx) => {
      node.y = y;
      node.x = xStart + ((cIdx + 0.5) / count) * (xEnd - xStart);
    });
  });

  // Any non-predefined airports placed in an outer tier according to their region
  
  // Gateway hub sizing for partner connections
  const sin = byCode.get('SIN');
  if (sin && sortedAirports.some(a => CODESHARE_OFFSETS[a.code])) { sin.height = 280; sin.width = 240; }
  const doh = byCode.get('DOH');
  if (doh && sortedAirports.some(a => CODESHARE_OFFSETS[a.code])) { doh.height = 280; doh.width = 240; }
  const lax = byCode.get('LAX');
  if (lax && sortedAirports.some(a => CODESHARE_OFFSETS[a.code])) { lax.height = 180; lax.width = 240; }

  // Assign codeshare positions relative to partner hubs
  for (const node of nodes) {
    if (CODESHARE_OFFSETS[node.code]) {
      const cfg = CODESHARE_OFFSETS[node.code];
      const partnerHub = byCode.get(cfg.hub);
      if (partnerHub) {
        node.x = partnerHub.x + cfg.dx;
        node.y = partnerHub.y + cfg.dy;
        node.region = cfg.region;
      }
    }
  }

  const placed = new Set([...nTiers, ...wTiers, ...eTiers, ...sTiers, Object.keys(CODESHARE_OFFSETS)].flat());
  for (const node of nodes) {
    if (node === hub || placed.has(node.code)) continue;
    if (node.region === 'north') {
      node.y = HEL_Y - hubHeight / 2 - 2500;
      node.x = HEL_X + (node.lon - center.lon) * 60;
    } else if (node.region === 'west') {
      node.x = HEL_X - hubWidth / 2 - 3500;
      node.y = HEL_Y + (60 - node.lat) * 50;
    } else if (node.region === 'east') {
      node.x = HEL_X + hubWidth / 2 + 3000;
      node.y = HEL_Y + (40 - node.lat) * 40;
    } else {
      node.y = HEL_Y + hubHeight / 2 + 4400;
      node.x = HEL_X + (node.lon - 15) * 50;
    }
  }

  function separateBoxes(gap) {
    let pushes = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (a === hub || b === hub || CODESHARE_OFFSETS[a.code] || CODESHARE_OFFSETS[b.code]) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.width + b.width) / 2 + gap - Math.abs(dx);
        const oy = (a.height + b.height) / 2 + gap - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          pushes++;
          if (ox < oy) {
            const push = (ox + 0.5) * (dx < 0 ? -1 : 1);
            a.x -= push * 0.5;
            b.x += push * 0.5;
          } else {
            const push = (oy + 0.5) * (dy < 0 ? -1 : 1);
            a.y -= push * 0.5;
            b.y += push * 0.5;
          }
        }
      }
    }
    for (const n of nodes) {
      if (n === hub || CODESHARE_OFFSETS[n.code]) continue;
      if (n.region === 'north') n.y = Math.min(n.y, hub.y - (hub.height + n.height) / 2 - gap);
      if (n.region === 'south') n.y = Math.max(n.y, hub.y + (hub.height + n.height) / 2 + gap);
      if (n.region === 'west') n.x = Math.min(n.x, hub.x - (hub.width + n.width) / 2 - gap);
      if (n.region === 'east') n.x = Math.max(n.x, hub.x + (hub.width + n.width) / 2 + gap);
    }
    return pushes;
  }

  for (let s = 0; s < 30; s++) separateBoxes(40);

  const left = Math.min(...nodes.map(n => n.x - n.width / 2));
  const top = Math.min(...nodes.map(n => n.y - n.height / 2));
  return sortedAirports.map(a => byCode.get(a.code)).map(n => {
    const node = {
      ...n,
      x: n.x - left + 100,
      y: n.y - top + 200
    };
    return {
      ...node,
      ...airportPolygon(node)
    };
  });
}

export function layoutAirports(airports, flights = []) {
  if (!airports.length) return [];
  const sortedAirports = [...airports].sort((a, b) => a.code.localeCompare(b.code));
  const sortedFlights = [...flights].sort((a, b) => a.id.localeCompare(b.id));

  const counts = new Map(), bundleCounts = new Map(), largestBundle = new Map();
  for (const f of sortedFlights) {
    for (const code of [f.from, f.to]) counts.set(code, (counts.get(code) || 0) + 1);
    const key = [f.from, f.to].sort().join(':');
    bundleCounts.set(key, (bundleCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of bundleCounts) {
    for (const code of key.split(':')) largestBundle.set(code, Math.max(largestBundle.get(code) || 0, count));
  }

  const center = [...sortedAirports].sort((a, b) => (counts.get(b.code) || 0) - (counts.get(a.code) || 0) || a.code.localeCompare(b.code))[0];

  const isFinnair = center?.code === 'HEL' && sortedAirports.some(a => a.code === 'OUL' || a.code === 'TKU');
  if (isFinnair) {
    return buildTieredLayout(sortedAirports, sortedFlights, center, counts, largestBundle, bundleCounts);
  }

  // Fallback force simulation for generic imported schedules & unit tests
  const minLat = Math.min(...sortedAirports.map(a => a.lat)), maxLat = Math.max(...sortedAirports.map(a => a.lat));
  const minLon = Math.min(...sortedAirports.map(a => a.lon)), maxLon = Math.max(...sortedAirports.map(a => a.lon));
  const typical = Math.max(1, [...counts.values()].sort((a, b) => a - b)[Math.floor(counts.size / 2)] || 1);
  const areaScale = Math.max(1, Math.sqrt(sortedAirports.length / 14));
  const global = maxLon - minLon > 45;
  const hubServices = counts.get(center.code) || 0;
  const hubWidth = Math.max(724, hubServices * 14 + 80);
  const hubHeight = Math.max(340, hubServices * 10);

  const nodes = sortedAirports.map(a => {
    const services = counts.get(a.code) || 0, importance = clamp(Math.log2(Math.max(1, services / typical)), 0, 2.5);
    const laneSpace = Math.max(0, ((largestBundle.get(a.code) || 1) - 1) * 14 + 32);
    const width = Math.round(Math.max(services > 20 ? services * 14 + 80 : 0, (global ? 260 : 184) + 112 * importance + 260 * Math.max(0, importance - 1.5), (a.name || a.code).length * 8 + 32, laneSpace));
    const height = Math.round(Math.max((global ? 180 : 150) + 64 * importance, laneSpace, services > 20 ? services * 10 : 0));
    const region = regionOf(a), isRegionalHub = global && a.code === center.code;
    let x = 180 + ((a.lon - minLon) / (maxLon - minLon || 1)) * 1140 * areaScale;
    let y = 210 + ((maxLat - a.lat) / (maxLat - minLat || 1)) * 1250 * areaScale;
    if (global) {
      x = 2200; y = 1800;
      if (!isRegionalHub) {
        if (region === 'west') { x -= hubWidth / 2 + 400 + Math.max(0, (15 - a.lon) * 12); y += (58 - a.lat) * 45; }
        if (region === 'east') { x += hubWidth / 2 + 500 + Math.max(0, (a.lon - 75) * 14); y += (35 - a.lat) * 35; }
        if (region === 'south') { x += (a.lon - 12) * 55; y += hubHeight / 2 + 300 + Math.max(0, (58 - a.lat) * 65); }
        if (region === 'north') { x += (a.lon - center.lon) * 100; y -= hubHeight / 2 + 250 + Math.max(0, (a.lat - center.lat) * 120); }
      }
    }
    return { ...a, x, y, anchorX: x, anchorY: y, width, height, services, importance, region, isRegionalHub };
  });

  const byCode = new Map(nodes.map(a => [a.code, a])), routeKeys = [...new Set(sortedFlights.map(f => [f.from, f.to].sort().join(':')))].sort();
  const routes = routeKeys.map(k => k.split(':').map(c => byCode.get(c))).filter(pair => pair.every(Boolean));

  function separate(gap) {
    let collisions = 0;
    if (global) {
      const hub = byCode.get(center.code);
      for (const n of nodes) {
        if (n === hub) continue;
        if (n.region === 'north') n.y = Math.min(n.y, hub.y - (hub.height + n.height) / 2 - gap);
        if (n.region === 'south') n.y = Math.max(n.y, hub.y + (hub.height + n.height) / 2 + gap);
        if (n.region === 'west') n.x = Math.min(n.x, hub.x - (hub.width + n.width) / 2 - gap);
        if (n.region === 'east') n.x = Math.max(n.x, hub.x + (hub.width + n.width) / 2 + gap);
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (global && a.region === b.region) {
          for (const [axis, geo, threshold, sign] of [['y', 'lat', 8, -1], ['x', 'lon', 30, 1]]) {
            const difference = (b[geo] - a[geo]) * sign;
            if (Math.abs(difference) <= threshold) continue;
            const direction = Math.sign(difference), overrun = 32 - (b[axis] - a[axis]) * direction;
            if (overrun > 0) {
              collisions++;
              const share = (1 + b.importance) / (2 + a.importance + b.importance);
              a[axis] -= direction * overrun * share;
              b[axis] += direction * overrun * (1 - share);
            }
          }
        }
        const dx = b.x - a.x, dy = b.y - a.y, ox = (a.width + b.width) / 2 + gap - Math.abs(dx), oy = (a.height + b.height) / 2 + gap - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          collisions++;
          const ma = 1 / (1 + a.importance), mb = 1 / (1 + b.importance), share = ma / (ma + mb);
          if (ox < oy) {
            const push = (ox + 0.5) * (dx < 0 ? -1 : 1);
            a.x -= push * share;
            b.x += push * (1 - share);
          } else {
            const push = (oy + 0.5) * (dy < 0 ? -1 : 1);
            a.y -= push * share;
            b.y += push * (1 - share);
          }
        }
      }
    }
    return collisions;
  }

  const simulation = forceSimulation(nodes).stop().velocityDecay(0.65)
    .force('charge', forceManyBody().strength(n => -1600 * (1 + n.importance)))
    .force('longitude', forceX(n => n.anchorX).strength(0.16))
    .force('latitude', forceY(n => n.anchorY).strength(0.2));

  for (let step = 0; step < 240; step++) {
    simulation.tick();
    for (const [a, b] of (global ? [] : routes)) {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      for (const n of nodes) {
        if (n === a || n === b) continue;
        const t = ((n.x - a.x) * dx + (n.y - a.y) * dy) / (length * length);
        if (t < 0.08 || t > 0.92) continue;
        const distance = (n.x - a.x) * nx + (n.y - a.y) * ny, clearance = Math.abs(nx) * n.width / 2 + Math.abs(ny) * n.height / 2 + 35;
        if (Math.abs(distance) < clearance) {
          const shift = Math.min(6, (clearance - Math.abs(distance)) * 0.22) * (distance < 0 ? -1 : 1);
          n.x += nx * shift;
          n.y += ny * shift;
        }
      }
    }
    separate(145);
  }
  for (let step = 0; step < 1500 && separate(145); step++);
  const left = Math.min(...nodes.map(n => n.x - n.width / 2)), top = Math.min(...nodes.map(n => n.y - n.height / 2));
  return nodes.map(({anchorX, anchorY, index, vx, vy, ...n}) => {
    const node = {...n, x: n.x - left + 80, y: n.y - top + 170};
    return {
      ...node,
      ...airportPolygon(node)
    };
  });
}

export function curvePoint(route, t) {
  const points = route.points || [route.start, route.end];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let distance = lengths.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const u = distance / (lengths[i] || 1);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * u,
        y: points[i].y + (points[i + 1].y - points[i].y) * u
      };
    }
    distance -= lengths[i];
  }
  return points[0];
}

function segmentBlocked(a, b, r) {
  let lo = 0, hi = 1;
  for (const [position, delta, min, max] of [
    [a.x, b.x - a.x, r.x - r.width / 2 + 0.01, r.x + r.width / 2 - 0.01],
    [a.y, b.y - a.y, r.y - r.height / 2 + 0.01, r.y + r.height / 2 - 0.01]
  ]) {
    if (Math.abs(delta) < 1e-8) {
      if (position <= min || position >= max) return false;
    } else {
      const t1 = (min - position) / delta, t2 = (max - position) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo >= hi) return false;
    }
  }
  return hi > 0 && lo < 1;
}

function bundlePath(a, b, obstacles, margin) {
  const boxes = obstacles.map(n => ({...n, width: n.width + margin * 2, height: n.height + margin * 2}));
  if (!boxes.some(r => segmentBlocked(a, b, r))) return [a, b];
  const vertices = [
    a,
    b,
    ...boxes.flatMap(r => [-1, 1].flatMap(x => [-1, 1].map(y => ({x: r.x + x * r.width / 2, y: r.y + y * r.height / 2}))))
  ];
  const distance = vertices.map(() => Infinity), prev = vertices.map(() => -1), done = new Set();
  distance[0] = 0;
  for (let count = 0; count < vertices.length; count++) {
    let u = -1;
    for (let i = 0; i < vertices.length; i++) {
      if (!done.has(i) && (u < 0 || distance[i] < distance[u])) u = i;
    }
    if (u < 0 || !Number.isFinite(distance[u])) break;
    if (u === 1) break;
    done.add(u);
    for (let v = 0; v < vertices.length; v++) {
      if (done.has(v) || u === v) continue;
      const score = distance[u] + Math.hypot(vertices[u].x - vertices[v].x, vertices[u].y - vertices[v].y);
      if (score < distance[v] && !boxes.some(r => segmentBlocked(vertices[u], vertices[v], r))) {
        distance[v] = score;
        prev[v] = u;
      }
    }
  }
  if (prev[1] < 0) return [a, b];
  const path = [];
  for (let i = 1; i >= 0; i = prev[i]) path.unshift(vertices[i]);
  return path;
}

function offsetPath(points, offset) {
  const normals = points.slice(1).map((p, i) => {
    const dx = p.x - points[i].x, dy = p.y - points[i].y, len = Math.hypot(dx, dy) || 1;
    return {x: -dy / len, y: dx / len};
  });
  return points.map((p, i) => {
    const a = normals[Math.max(0, i - 1)], b = normals[Math.min(i, normals.length - 1)];
    const divisor = 1 + a.x * b.x + a.y * b.y;
    return {
      x: p.x + (a.x + b.x) * offset / Math.max(0.1, divisor),
      y: p.y + (a.y + b.y) * offset / Math.max(0.1, divisor)
    };
  });
}

function routePorts(nodes, bundles, byCode) {
  const ports = new Map();
  for (const node of nodes) {
    const sides = {top: [], bottom: [], left: [], right: []};
    for (const [key, services] of bundles) {
      const codes = key.split(':');
      if (!codes.includes(node.code)) continue;
      const other = byCode.get(codes.find(c => c !== node.code));
      if (!other) continue;
      const dx = other.x - node.x, dy = other.y - node.y;
      const side = node.isRegionalHub
        ? ({north: 'top', south: 'bottom', west: 'left', east: 'right'}[other.region])
        : Math.abs(dx) / (node.width / 2) > Math.abs(dy) / (node.height / 2)
          ? (dx < 0 ? 'left' : 'right')
          : (dy < 0 ? 'top' : 'bottom');
      sides[side].push({key, other, span: (services.length - 1) * 14 + 28});
    }
    for (const [side, items] of Object.entries(sides)) {
      const vertical = side === 'left' || side === 'right', sign = side === 'left' || side === 'top' ? -1 : 1;
      const bearing = item => vertical
        ? (item.other.y - node.y) / Math.max(1, Math.abs(item.other.x - node.x))
        : (item.other.x - node.x) / Math.max(1, Math.abs(item.other.y - node.y));
      items.sort((a, b) => bearing(a) - bearing(b) || a.key.localeCompare(b.key));
      const total = items.reduce((sum, i) => sum + i.span, 0);
      let cursor = -total / 2;
      for (const item of items) {
        const along = cursor + item.span / 2;
        cursor += item.span;
        const port = {
          x: node.x + (vertical ? sign * (node.width / 2 + 8) : along),
          y: node.y + (vertical ? along : sign * (node.height / 2 + 8))
        };
        const normal = {x: vertical ? sign : 0, y: vertical ? 0 : sign};
        ports.set(node.code + ':' + item.key, {
          port,
          normal,
          escape: {x: port.x + normal.x * 40, y: port.y + normal.y * 40}
        });
      }
    }
  }
  return ports;
}

export function layoutFlights(nodes, flights) {
  const byCode = new Map(nodes.map(n => [n.code, n])), bundles = new Map(), result = [];
  for (const f of flights) {
    const key = [f.from, f.to].sort().join(':');
    if (!bundles.has(key)) bundles.set(key, []);
    bundles.get(key).push(f);
  }
  const ports = routePorts(nodes, bundles, byCode);
  for (const [key, services] of [...bundles].sort(([a], [b]) => a.localeCompare(b))) {
    const [from, to] = key.split(':'), a = byCode.get(from), b = byCode.get(to);
    if (!a || !b) continue;
    const pa = ports.get(from + ':' + key), pb = ports.get(to + ':' + key);
    const middle = bundlePath(pa.escape, pb.escape, nodes.filter(n => n !== a && n !== b), (services.length - 1) * 7 + 26);
    const spine = [pa.port, ...middle, pb.port];
    services.sort((a, b) => a.from.localeCompare(b.from) || a.departure.localeCompare(b.departure) || a.id.localeCompare(b.id));
    services.forEach((flight, i) => {
      const offset = (i - (services.length - 1) / 2) * 14, points = offsetPath(spine, offset);
      if (flight.from !== from) points.reverse();
      const start = points[0], end = points.at(-1);
      result.push({
        flight,
        start,
        end,
        points,
        control: {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2},
        path: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
      });
    });
  }
  return result;
}

function corners({x, y, width, height, angle = 0}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: x + a * width / 2 * c - b * height / 2 * s,
    y: y + a * width / 2 * s + b * height / 2 * c
  }));
}

export function rectanglesOverlap(a, b) {
  const aa = corners(a), bb = corners(b);
  for (const p of [aa, bb]) {
    for (let i = 0; i < 2; i++) {
      const dx = p[i + 1].x - p[i].x, dy = p[i + 1].y - p[i].y;
      const project = arr => arr.map(v => v.x * (-dy) + v.y * dx);
      const pa = project(aa), pb = project(bb);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

export function placeFlightLabels(routes, nodes, measure = text => text.length * 6.2) {
  const occupied = nodes.map(n => ({...n, width: n.width + 20, height: n.height + 20})), labels = new Map();
  for (const r of [...routes].sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y) - Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) || a.flight.id.localeCompare(b.flight.id))) {
    const f = r.flight;
    const freq = f.days || f.frequency || '#';
    const num = f.number || f.id;
    const text = `${num}  ${freq}  ${aircraftNotation(f.aircraft)}`;
    const width = measure(text) + 12;
    let label;
    for (const t of [0.5, 0.38, 0.62, 0.26, 0.74, 0.17, 0.83]) {
      const p = curvePoint(r, t), before = curvePoint(r, t - 0.01), after = curvePoint(r, t + 0.01);
      let angle = Math.atan2(after.y - before.y, after.x - before.x);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      const candidate = {
        x: p.x + Math.sin(angle) * 9,
        y: p.y - Math.cos(angle) * 9,
        width,
        height: 17,
        angle,
        text,
        hidden: false
      };
      if (!label) label = candidate;
      if (!occupied.some(box => rectanglesOverlap(candidate, box))) {
        label = candidate;
        occupied.push(candidate);
        break;
      }
      label = {...label, hidden: true};
    }
    labels.set(f.id, label);
  }
  return labels;
}

export function aircraftNotation(aircraft = '') {
  return aircraft.replace('Airbus A', 'A').replace('Embraer ', 'E').replace('ATR ', 'AT');
}

export function endpointLabels(route, nodes) {
  return [[route.start, route.flight.from, route.flight.departure], [route.end, route.flight.to, route.flight.arrival]].map(([p, code, time]) => {
    const n = nodes.find(n => n.code === code);
    const vertical = Math.abs(Math.abs(p.y - n.y) - n.height / 2 - 8) < 0.01;
    const nx = vertical ? 0 : Math.sign(p.x - n.x), ny = vertical ? Math.sign(p.y - n.y) : 0;
    return {
      x: p.x - nx * 35,
      y: p.y - ny * 35,
      angle: vertical ? -90 : 0,
      text: time.slice(11, 16).replace(':', '.')
    };
  });
}

export function airportPolygon(node) {
  const w = node.width, h = node.height;
  const hw = w / 2, hh = h / 2;
  const shape = node.shape || 'octagon';

  if (Array.isArray(node.polygon) && node.polygon.length >= 3) {
    const pts = node.polygon.map(p => Array.isArray(p) ? {x: p[0], y: p[1]} : {x: p.x, y: p.y});
    return {
      polygon: pts,
      polygonPoints: pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    };
  }

  let vertices;
  if (shape === 'stepped' || shape === 'notched') {
    const s = Math.min(16, Math.max(6, Math.round(h * 0.12)));
    vertices = [
      [-hw + s, -hh],
      [hw - s, -hh],
      [hw - s, -hh + s],
      [hw, -hh + s],
      [hw, hh - s],
      [hw - s, hh - s],
      [hw - s, hh],
      [-hw + s, hh],
      [-hw + s, hh - s],
      [-hw, hh - s],
      [-hw, -hh + s],
      [-hw + s, -hh + s]
    ];
  } else if (shape === 'hexagon-h' || shape === 'hexagon') {
    const c = Math.min(18, Math.max(8, Math.round(w * 0.08)));
    vertices = [
      [-hw + c, -hh],
      [hw - c, -hh],
      [hw, 0],
      [hw - c, hh],
      [-hw + c, hh],
      [-hw, 0]
    ];
  } else if (shape === 'hexagon-v') {
    const c = Math.min(18, Math.max(8, Math.round(h * 0.12)));
    vertices = [
      [0, -hh],
      [hw, -hh + c],
      [hw, hh - c],
      [0, hh],
      [-hw, hh - c],
      [-hw, -hh + c]
    ];
  } else if (shape === 'rect') {
    vertices = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh]
    ];
  } else {
    // Default: 8-sided faceted chamfered octagon
    let c = node.chamfer ?? (
      node.code === 'HEL' ? 44 :
      (node.code === 'DOH' || node.code === 'SIN' || node.code === 'LAX') ? 14 :
      node.isRegionalHub ? 16 :
      (node.importance && node.importance > 0.15) ? 12 : 10
    );
    c = Math.min(c, hw - 10, hh - 10);
    vertices = [
      [-hw + c, -hh],
      [hw - c, -hh],
      [hw, -hh + c],
      [hw, hh - c],
      [hw - c, hh],
      [-hw + c, hh],
      [-hw, hh - c],
      [-hw, -hh + c]
    ];
  }

  const result = {
    polygon: vertices.map(([x, y]) => ({x, y})),
    polygonPoints: vertices.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  };

  if (node.isRegionalHub) {
    const inset = 8;
    const ihw = hw - inset, ihh = hh - inset;
    const c_inner = Math.max(4, (node.chamfer ?? 44) - 3);
    const innerVertices = [
      [-ihw + c_inner, -ihh],
      [ihw - c_inner, -ihh],
      [ihw, -ihh + c_inner],
      [ihw, ihh - c_inner],
      [ihw - c_inner, ihh],
      [-ihw + c_inner, ihh],
      [-ihw, ihh - c_inner],
      [-ihw, -ihh + c_inner]
    ];
    result.innerPolygon = innerVertices.map(([x, y]) => ({x, y}));
    result.innerPolygonPoints = innerVertices.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }

  return result;
}
