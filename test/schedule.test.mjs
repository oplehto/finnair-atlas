import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule, filterFlights, layoutAirports} from '../public/schedule.mjs';
const sample = {airports:[{code:'HEL',name:'Helsinki',lat:60,lon:25},{code:'OUL',name:'Oulu',lat:65,lon:25}],flights:[{id:'AY1',from:'HEL',to:'OUL',departure:'2026-09-10T23:30:00+03:00',arrival:'2026-09-11T00:40:00+03:00',airline:'Finnair',aircraft:'A320'}]};
test('accepts overnight flights with timezone offsets',()=>assert.equal(validateSchedule(sample).flights.length,1));
test('rejects missing airports and impossible chronology',()=>{assert.throws(()=>validateSchedule({...sample,airports:sample.airports.slice(0,1)}),/airport/i);assert.throws(()=>validateSchedule({...sample,flights:[{...sample.flights[0],arrival:'2026-09-10T00:40:00+03:00'}]}),/arrival/i);});
test('requires explicit timezones and unique flight identities',()=>{assert.throws(()=>validateSchedule({...sample,flights:[{...sample.flights[0],departure:'2026-09-10T23:30:00'}]}),/timezone/i);assert.throws(()=>validateSchedule({...sample,flights:[sample.flights[0],sample.flights[0]]}),/duplicate/i);});
test('filters using departure-local calendar date and route search',()=>{assert.equal(filterFlights(sample.flights,{date:'2026-09-10',query:'oul'}).length,1);assert.equal(filterFlights(sample.flights,{date:'2026-09-11'}).length,0);});
test('layout separates airports at identical coordinates',()=>{const p=layoutAirports([{code:'A',lat:60,lon:25},{code:'B',lat:60,lon:25}]);assert.ok(Math.abs(p[0].x-p[1].x)>=(p[0].width+p[1].width)/2+28 || Math.abs(p[0].y-p[1].y)>=(p[0].height+p[1].height)/2+28);});

import {weeklyServices,connectionFlights,flightNumber} from '../public/schedule.mjs';
const svc=(id,number,from,to,dep,arr,extra={})=>({id,number,from,to,departure:dep,arrival:arr,...extra});
test('weekly services collapse dated repeats and derive days marks',()=>{
 const mon=svc('a-1','AY1','HEL','OUL','2026-09-07T08:00:00+03:00','2026-09-07T09:05:00+03:00');
 const wed={...mon,id:'a-3',departure:'2026-09-09T08:00:00+03:00',arrival:'2026-09-09T09:05:00+03:00'};
 const marked=svc('b','AY2','HEL','TKU','2026-09-07T10:00:00+03:00','2026-09-07T10:40:00+03:00',{days:'⑥'});
 const weekly=weeklyServices([wed,mon,marked]);
 assert.equal(weekly.length,2);
 assert.equal(weekly.find(f=>f.number==='AY1').days,'①③');
 assert.equal(weekly.find(f=>f.number==='AY2').days,'⑥');
 const week=Array.from({length:7},(_,i)=>({...mon,id:`w${i}`,departure:`2026-09-${String(7+i).padStart(2,'0')}T08:00:00+03:00`,arrival:`2026-09-${String(7+i).padStart(2,'0')}T09:05:00+03:00`}));
 assert.equal(weeklyServices(week)[0].days,'#');
});
test('connection flights keep the earliest feasible partner departure and the latest feasible feeder',()=>{
 const own=[svc('o1','AY1331','HEL','LHR','2026-09-10T07:50:00+03:00','2026-09-10T09:05:00+01:00',{days:'#'}),svc('o2','AY1332','LHR','HEL','2026-09-10T12:15:00+01:00','2026-09-10T17:20:00+03:00',{days:'①②③④⑤'})];
 const partner=[
  svc('p-early','AY 5951','LHR','ABZ','2026-09-10T09:50:00+01:00','2026-09-10T11:20:00+01:00',{days:'#',via:'LHR',codeshare:true}),
  svc('p-next','AY 5953','LHR','ABZ','2026-09-10T11:00:00+01:00','2026-09-10T12:30:00+01:00',{days:'#',via:'LHR',codeshare:true}),
  svc('p-late','AY 5955','LHR','ABZ','2026-09-10T14:00:00+01:00','2026-09-10T15:30:00+01:00',{days:'#',via:'LHR',codeshare:true}),
  svc('p-in','AY 5956','ABZ','LHR','2026-09-10T09:30:00+01:00','2026-09-10T11:00:00+01:00',{days:'#',via:'LHR',codeshare:true}),
  svc('p-weekend','AY 5958','ABZ','LHR','2026-09-10T10:00:00+01:00','2026-09-10T11:05:00+01:00',{days:'⑥⑦',via:'LHR',codeshare:true})
 ];
 const kept=connectionFlights(own,partner,{minMinutes:60});
 assert.deepEqual(kept.map(f=>f.id),['p-next','p-in']);
 const out=kept.find(f=>f.id==='p-next');
 assert.equal(out.connection.number,'AY1331');assert.equal(out.connection.wait,115);assert.equal(out.connection.direction,'out');assert.equal(out.connection.overnight,false);
 const inbound=kept.find(f=>f.id==='p-in');
 assert.equal(inbound.connection.number,'AY1332');assert.equal(inbound.connection.wait,75);assert.equal(inbound.connection.direction,'in');
 assert.equal(partner.find(f=>f.id==='p-next').connection,undefined,'input must not be mutated');
});
test('overnight connections wait for the next day and flight numbers get timetable spacing',()=>{
 const own=[svc('o','AY1','HEL','LAX','2026-09-10T13:00:00+03:00','2026-09-10T17:40:00-07:00',{days:'#'})];
 const partner=[svc('p','AY 4050','LAX','SFO','2026-09-10T11:15:00-07:00','2026-09-10T12:40:00-07:00',{days:'#',via:'LAX',codeshare:true})];
 const [kept]=connectionFlights(own,partner);
 assert.equal(kept.connection.wait,1055);assert.equal(kept.connection.overnight,true);
 assert.equal(flightNumber({number:'AY431'}),'AY 431');assert.equal(flightNumber({number:'AY 5955'}),'AY 5955');assert.equal(flightNumber({id:'X'}),'X');
});
