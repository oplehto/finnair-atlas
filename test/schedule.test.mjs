import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule, filterFlights, layoutAirports} from '../public/schedule.mjs';
const sample = {airports:[{code:'HEL',name:'Helsinki',lat:60,lon:25},{code:'OUL',name:'Oulu',lat:65,lon:25}],flights:[{id:'AY1',from:'HEL',to:'OUL',departure:'2026-09-10T23:30:00+03:00',arrival:'2026-09-11T00:40:00+03:00',airline:'Finnair',aircraft:'A320'}]};
test('accepts overnight flights with timezone offsets',()=>assert.equal(validateSchedule(sample).flights.length,1));
test('rejects missing airports and impossible chronology',()=>{assert.throws(()=>validateSchedule({...sample,airports:sample.airports.slice(0,1)}),/airport/i);assert.throws(()=>validateSchedule({...sample,flights:[{...sample.flights[0],arrival:'2026-09-10T00:40:00+03:00'}]}),/arrival/i);});
test('requires explicit timezones and unique flight identities',()=>{assert.throws(()=>validateSchedule({...sample,flights:[{...sample.flights[0],departure:'2026-09-10T23:30:00'}]}),/timezone/i);assert.throws(()=>validateSchedule({...sample,flights:[sample.flights[0],sample.flights[0]]}),/duplicate/i);});
test('filters using departure-local calendar date and route search',()=>{assert.equal(filterFlights(sample.flights,{date:'2026-09-10',query:'oul'}).length,1);assert.equal(filterFlights(sample.flights,{date:'2026-09-11'}).length,0);});
test('layout separates airports at identical coordinates',()=>{const p=layoutAirports([{code:'A',lat:60,lon:25},{code:'B',lat:60,lon:25}]);assert.ok(Math.abs(p[0].x-p[1].x)>=(p[0].width+p[1].width)/2+28 || Math.abs(p[0].y-p[1].y)>=(p[0].height+p[1].height)/2+28);});
