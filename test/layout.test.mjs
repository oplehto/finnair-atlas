import test from 'node:test';
import assert from 'node:assert/strict';
import demo from '../public/demo.mjs';
import {layoutAirports} from '../public/schedule.mjs';
const overlap=(a,b,gap=0)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+gap && Math.abs(a.y-b.y)<(a.height+b.height)/2+gap;
// Boxes are drawn as convex polygons whose corners may be cut; a route may pass through the cut-off
// corner of the rectangle but never enter the polygon. Cyrus-Beck clip of the segment a-b.
const entersBox=(a,b,n)=>{
 const poly=(n.polygon||[{x:-n.width/2,y:-n.height/2},{x:n.width/2,y:-n.height/2},{x:n.width/2,y:n.height/2},{x:-n.width/2,y:n.height/2}]).map(p=>({x:p.x+n.x,y:p.y+n.y}));
 let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length];if(p.x===q.x&&p.y===q.y)continue;
  let nx=q.y-p.y,ny=p.x-q.x;if(nx*(n.x-p.x)+ny*(n.y-p.y)>0){nx=-nx;ny=-ny;}
  const len=Math.hypot(nx,ny);nx/=len;ny/=len;
  const limit=nx*p.x+ny*p.y-0.01,fa=nx*a.x+ny*a.y-limit,fb=fa+nx*dx+ny*dy;
  if(fa>=0&&fb>=0)return false;
  if(fa>=0)lo=Math.max(lo,fa/(fa-fb));else if(fb>=0)hi=Math.min(hi,fa/(fa-fb));
  if(lo>=hi)return false;
 }
 return true;
};
const routeClearsBoxes=(routes,nodes)=>{
 for(const r of routes)for(const n of nodes){
  if(n.code===r.flight.from||n.code===r.flight.to)continue;
  for(let s=0;s<r.points.length-1;s++)assert.ok(!entersBox(r.points[s],r.points[s+1],n),`${r.flight.id} crosses ${n.code}`);
 }
};
test('sizes hubs by service volume with Helsinki and Oulu visibly larger',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights),get=c=>nodes.find(a=>a.code===c);
 assert.ok(get('HEL').width>get('OUL').width*1.3);
 assert.ok(get('OUL').width>get('VAA').width*1.15);
 assert.equal(get('HEL').services,demo.flights.filter(f=>f.from==='HEL'||f.to==='HEL').length);assert.equal(get('OUL').services,demo.flights.filter(f=>f.from==='OUL'||f.to==='OUL').length);
});
test('variable airport rectangles have clear space around every box',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(!overlap(nodes[i],nodes[j],28),`${nodes[i].code} overlaps ${nodes[j].code}`);
});
test('dense coincident airports converge without collisions or input mutation',()=>{
 const airports=Array.from({length:25},(_,i)=>({code:`X${String(i).padStart(2,'0')}`,name:`City ${i}`,lat:60,lon:25}));
 const before=structuredClone(airports),nodes=layoutAirports(airports,[]);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(!overlap(nodes[i],nodes[j],28));
 assert.deepEqual(airports,before);assert.deepEqual(nodes,layoutAirports(airports,[]));
});
test('airport input order does not change the layout',()=>{
 const a=layoutAirports(demo.airports,demo.flights),b=layoutAirports([...demo.airports].reverse(),[...demo.flights].reverse());
 assert.deepEqual(a,b);
});

import {layoutFlights,placeFlightLabels,rectanglesOverlap,curvePoint} from '../public/layout.mjs';
test('flight endpoints remain outside variable-sized airport boxes and use distinct ports',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights),routes=layoutFlights(nodes,demo.flights),ports=new Set();
 assert.equal(routes.length,demo.flights.length);
 for(const r of routes)for(const [side,code]of [['start',r.flight.from],['end',r.flight.to]]){
  const n=nodes.find(n=>n.code===code),p=r[side];
  assert.ok(Math.abs(p.x-n.x)>=n.width/2||Math.abs(p.y-n.y)>=n.height/2);
  const key=`${code}:${p.x}:${p.y}`;assert.ok(!ports.has(key),'service ports must not coincide');ports.add(key);
 }
});
test('visible flight labels avoid airport boxes and one another',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights),routes=layoutFlights(nodes,demo.flights),labels=[...placeFlightLabels(routes,nodes).values()].filter(l=>!l.hidden);
 assert.ok(labels.length>=demo.flights.length*.7,'most labels should remain readable without selection');
 for(let i=0;i<labels.length;i++){
  for(const n of nodes)assert.ok(!rectanglesOverlap(labels[i],n),'label overlaps city');
  for(let j=i+1;j<labels.length;j++)assert.ok(!rectanglesOverlap(labels[i],labels[j]),'labels overlap');
 }
});
// The sheet is a weekly timetable; the single-day subsets below use the Monday of the published
// week (14 September 2026), the fullest day, as a second, smaller airport set to lay out.
const MONDAY='2026-09-14';
test('flight paths avoid unrelated airport boxes on the displayed Finnair date',()=>{
 // Checked against the drawn octagon rather than the rectangle: a lane may hug a cut corner.
 const flights=demo.flights.filter(f=>f.departure.startsWith(MONDAY));
 const nodes=layoutAirports(demo.airports,flights),routes=layoutFlights(nodes,flights);
 routeClearsBoxes(routes,nodes);
});

test('each route uses straight parallel lanes with constant spacing in both directions',()=>{
 const flights=demo.flights.filter(f=>f.departure.startsWith(MONDAY));
 const nodes=layoutAirports(demo.airports,flights),routes=layoutFlights(nodes,flights),bundle=routes.filter(r=>[r.flight.from,r.flight.to].sort().join(':')==='HEL:OUL');
 const canonical=bundle.map(r=>r.flight.from==='HEL'?r.points:[...r.points].reverse());
 for(const r of bundle)assert.ok(!/[QC]/.test(r.path),'routes must not curve');
 for(let j=1;j<canonical.length;j++)for(let i=0;i<canonical[0].length-1;i++){
  const a=canonical[j-1][i],b=canonical[j-1][i+1],p=canonical[j][i],q=canonical[j][i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  assert.ok(Math.abs((q.x-p.x)*dy-(q.y-p.y)*dx)<1e-5,'corresponding segments must stay parallel');
  assert.ok(Math.abs(Math.abs(((p.x-a.x)*(-dy)+(p.y-a.y)*dx)/len)-14)<1e-5,'lanes stay 14 units apart through bends');
 }
});
test('Helsinki ingress lanes are perpendicular and separated across route bundles',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights),routes=layoutFlights(nodes,demo.flights);
 const segments=routes.map(r=>r.flight.from==='HEL'?r.points.slice(0,2):r.points.slice(-2).reverse());
 for(let i=0;i<segments.length;i++){
  const [a,b]=segments[i];assert.ok(a.x===b.x||a.y===b.y);
  for(let j=i+1;j<segments.length;j++){
   const [c,d]=segments[j];if(a.x===b.x&&c.x===d.x&&a.y===c.y)assert.ok(Math.abs(a.x-c.x)>=13.99);
   if(a.y===b.y&&c.y===d.y&&a.x===c.x)assert.ok(Math.abs(a.y-c.y)>=13.99);
  }
 }
});

test('international geography keeps continents and Scandinavia on their expected sides',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights),get=c=>nodes.find(n=>n.code===c),hel=get('HEL');
 for(const c of ['JFK','DFW','LAX','LHR','CDG','ARN','OSL'])assert.ok(get(c).x<hel.x,`${c} should be west of Helsinki`);
 for(const c of ['HND','SIN','HKG','DEL'])assert.ok(get(c).x>hel.x,`${c} should be east of Helsinki`);
 for(const c of ['CDG','FCO','MAD'])assert.ok(get(c).y>hel.y,`${c} should be south of Helsinki`);
 for(const c of ['OUL','RVN','IVL'])assert.ok(get(c).y<hel.y,`${c} should be north of Helsinki`);
});
test('all flight ports fit on the physical edge of their expanded airport',()=>{
 const nodes=layoutAirports(demo.airports,demo.flights),byCode=new Map(nodes.map(n=>[n.code,n]));
 for(const r of layoutFlights(nodes,demo.flights))for(const [point,code]of [[r.start,r.flight.from],[r.end,r.flight.to]]){
  const n=byCode.get(code),dx=Math.abs(point.x-n.x),dy=Math.abs(point.y-n.y);
  assert.ok((Math.abs(dx-n.width/2-8)<.001&&dy<=n.height/2)||(Math.abs(dy-n.height/2-8)<.001&&dx<=n.width/2),`${code} has a port beyond its edge`);
 }
});

test('regional groups dock on their assigned Helsinki edges',()=>{
 for(const flights of [demo.flights,demo.flights.filter(f=>f.departure.startsWith(MONDAY))]){
  const nodes=layoutAirports(demo.airports,flights),hub=nodes.find(n=>n.code==='HEL'),byCode=new Map(nodes.map(n=>[n.code,n]));
  for(const r of layoutFlights(nodes,flights)){
   if(r.flight.from!=='HEL'&&r.flight.to!=='HEL')continue; // Umeå-Vaasa does not touch the hub
   const outgoing=r.flight.from==='HEL',other=byCode.get(outgoing?r.flight.to:r.flight.from),port=outgoing?r.start:r.end;
   if(other.region==='west'){assert.ok(other.x+other.width/2<hub.x-hub.width/2);assert.ok(Math.abs(port.x-(hub.x-hub.width/2-8))<.001);}
   if(other.region==='east'){assert.ok(other.x-other.width/2>hub.x+hub.width/2);assert.ok(Math.abs(port.x-(hub.x+hub.width/2+8))<.001);}
   if(other.region==='south'){assert.ok(other.y-other.height/2>hub.y+hub.height/2);assert.ok(Math.abs(port.y-(hub.y+hub.height/2+8))<.001);}
   if(other.region==='north'){assert.ok(other.y+other.height/2<hub.y-hub.height/2);assert.ok(Math.abs(port.y-(hub.y-hub.height/2-8))<.001);}
  }
 }
});

test('the displayed weekly sheet with partner codeshares stays compact, clear and routable',()=>{
 // Built exactly as the app does: every weekly service with partner codeshares, and the active
 // airports are those used by the visible flights.
 const flights=[...demo.flights,...demo.codeshareFlights];
 const codes=new Set(flights.flatMap(f=>[f.from,f.to]));
 const nodes=layoutAirports([...demo.airports,...demo.codeshareAirports].filter(a=>codes.has(a.code)),flights),routes=layoutFlights(nodes,flights),byCode=new Map(nodes.map(n=>[n.code,n]));
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(!overlap(nodes[i],nodes[j],39.9),`${nodes[i].code} is closer than 40 to ${nodes[j].code}`);
 for(const r of routes){
  for(const [point,code]of [[r.start,r.flight.from],[r.end,r.flight.to]]){
   const n=byCode.get(code),dx=Math.abs(point.x-n.x),dy=Math.abs(point.y-n.y);
   assert.ok((Math.abs(dx-n.width/2-8)<.001&&dy<=n.height/2)||(Math.abs(dy-n.height/2-8)<.001&&dx<=n.width/2),`${code} has a port beyond its edge`);
  }
 }
 routeClearsBoxes(routes,nodes);
 // Sheet compactness: the bounding box of all airport boxes. The hub alone is about 10 M square
 // units; the tiers and partner satellites around it must not spread the sheet past 49 M
 // (about 9,300 x 5,100: the west fan needs its three columns 500, 950 and 1,400 outside the
 // hub and London's four satellite columns to draw without crossings).
 const left=Math.min(...nodes.map(n=>n.x-n.width/2)),right=Math.max(...nodes.map(n=>n.x+n.width/2)),top=Math.min(...nodes.map(n=>n.y-n.height/2)),bottom=Math.max(...nodes.map(n=>n.y+n.height/2));
 assert.ok((right-left)*(bottom-top)<49e6,`sheet ${Math.round(right-left)} x ${Math.round(bottom-top)} is not compact`);
});

test('the domestic fan of the full weekly sheet draws without route crossings',()=>{
 // Every weekly service with partner codeshares, as the app shows it with no date filter.
 const flights=[...demo.flights,...demo.codeshareFlights],codes=new Set(flights.flatMap(f=>[f.from,f.to]));
 const nodes=layoutAirports([...demo.airports,...demo.codeshareAirports].filter(a=>codes.has(a.code)),flights),routes=layoutFlights(nodes,flights),byCode=new Map(nodes.map(n=>[n.code,n])),hub=byCode.get('HEL');
 const north=new Set(nodes.filter(n=>n!==hub&&n.region==='north').map(n=>n.code));
 assert.equal(north.size,13); // Helsinki's domestic destinations on the published sheet
 for(const c of north)assert.ok(byCode.get(c).y+byCode.get(c).height/2<hub.y-hub.height/2,`${c} is not above Helsinki`);
 const keyOf=r=>[r.flight.from,r.flight.to].sort().join(':'),touchesNorth=r=>north.has(r.flight.from)||north.has(r.flight.to);
 const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
 const segmentsCross=(p1,p2,p3,p4)=>{const e=1e-6,d1=cross(p3,p4,p1),d2=cross(p3,p4,p2),d3=cross(p1,p2,p3),d4=cross(p1,p2,p4);return((d1>e&&d2<-e)||(d1<-e&&d2>e))&&((d3>e&&d4<-e)||(d3<-e&&d4>e));};
 const domestic=routes.filter(touchesNorth);
 assert.ok(domestic.length>=80);
 for(const a of domestic)for(const b of routes){
  if(a===b||keyOf(a)===keyOf(b))continue;
  for(let s=0;s<a.points.length-1;s++)for(let t=0;t<b.points.length-1;t++)assert.ok(!segmentsCross(a.points[s],a.points[s+1],b.points[t],b.points[t+1]),`${a.flight.id} crosses ${b.flight.id}`);
 }
});

test('airport polygons are non-rectangular with chamfered, faceted, or stepped geometry', () => {
 // Corners are cut per corner from the routed bundles (see the style guide): a corner a bundle
 // passes diagonally or bends around gets a large 45-degree cut, up to 40% of the smaller box
 // dimension; a quiet corner keeps a small one; no cut comes within 10 of a port on its edges.
 const nodes = layoutAirports(demo.airports, demo.flights), routes = layoutFlights(nodes, demo.flights);
 const hel = nodes.find(n => n.code === 'HEL');
 const cornerOf = (n, dx, dy) => n.chamfers[dy < 0 ? (dx < 0 ? 0 : 1) : (dx < 0 ? 3 : 2)];
 for (const n of nodes) {
  assert.equal(n.chamfers.length, 4, `${n.code} has one chamfer per corner`);
  for (const c of n.chamfers) assert.ok(c >= 0 && c <= Math.max(44, Math.round(0.4 * Math.min(n.width, n.height))) && c <= Math.min(n.width, n.height) / 2 - 10, `${n.code} chamfer ${c} out of range`);
 }
 assert.ok(nodes.some(n => !n.isRegionalHub && n.chamfers.some(c => c >= 28)), 'some corners beside diagonal bundles are cut large');
 assert.ok(nodes.some(n => !n.isRegionalHub && n.chamfers.some(c => c <= 8)), 'quiet corners keep a small cut');
 for (const r of routes) for (const [p, code] of [[r.start, r.flight.from], [r.end, r.flight.to]]) {
  const n = nodes.find(n => n.code === code), dx = p.x - n.x, dy = p.y - n.y;
  const onTopOrBottom = Math.abs(Math.abs(dy) - n.height / 2 - 8) < .001;
  const room = onTopOrBottom ? n.width / 2 - Math.abs(dx) : n.height / 2 - Math.abs(dy);
  assert.ok(room >= cornerOf(n, dx, dy) + 10, `${code} port is cut by its corner chamfer`);
 }
 assert.ok(Array.isArray(hel.polygon));
 assert.equal(hel.polygon.length, 8, 'Helsinki hub has 8-sided faceted outer polygon');
 assert.ok(Array.isArray(hel.innerPolygon), 'Helsinki hub has inner concentric polygon');
 assert.equal(hel.innerPolygon.length, 8);
 assert.ok(hel.polygonPoints.includes(','), 'Helsinki has SVG polygonPoints attribute');

 const hw = hel.width / 2, hh = hel.height / 2;
 const hasCutCorner = hel.polygon.some(p => Math.abs(p.x) < hw && Math.abs(p.y) === hh);
 assert.ok(hasCutCorner, 'polygon vertices bevel the rectangular corners');

 const oul = nodes.find(n => n.code === 'OUL');
 assert.equal(oul.polygon.length, 8);
 assert.equal(hel.innerPolygon.length, 8, 'Helsinki keeps its double rule after routing');

 const custom = layoutAirports([
  {code: 'STP', name: 'Stepped City', lat: 60, lon: 25, shape: 'stepped'},
  {code: 'HEX', name: 'Hex City', lat: 61, lon: 25, shape: 'hexagon'},
  {code: 'CST', name: 'Custom City', lat: 62, lon: 25, polygon: [[-50, -30], [50, -30], [60, 0], [50, 30], [-50, 30]]}
 ], []);
 const stp = custom.find(n => n.code === 'STP');
 assert.equal(stp.polygon.length, 12, 'Stepped shape has 12 vertices');
 const hex = custom.find(n => n.code === 'HEX');
 assert.equal(hex.polygon.length, 6, 'Hexagon shape has 6 vertices');
 const cst = custom.find(n => n.code === 'CST');
 assert.equal(cst.polygon.length, 5, 'Custom polygon preserves 5 vertices');
});
