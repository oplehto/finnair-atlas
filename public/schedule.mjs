export function validateSchedule(data) {
  if (!data || !Array.isArray(data.airports) || !Array.isArray(data.flights)) throw Error('Provide airports and flights arrays.');
  if (data.airports.length>150 || data.flights.length>2500) throw Error('Limit each sheet to 150 airports and 2,500 flights.');
  const codes=new Set(), ids=new Set();
  for(const a of data.airports){
    if(!/^[A-Z0-9]{3,4}$/.test(a.code) || typeof a.name!=='string' || !a.name.trim() || !Number.isFinite(a.lat) || Math.abs(a.lat)>90 || !Number.isFinite(a.lon) || Math.abs(a.lon)>180) throw Error('Each airport needs a code, name, latitude and longitude.');
    if(codes.has(a.code)) throw Error('Duplicate airport code.'); codes.add(a.code);
  }
  for(const f of data.flights){
    if(!codes.has(f.from)||!codes.has(f.to)||f.from===f.to) throw Error('Flight references an invalid airport.');
    if(typeof f.id!=='string'||!f.id.trim()) throw Error('Each flight needs an id.');
    if(ids.has(f.id)) throw Error('Duplicate flight id; include the date for repeated services.');ids.add(f.id);
    for(const key of ['departure','arrival']) if(typeof f[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(f[key])||!Number.isFinite(Date.parse(f[key]))) throw Error(`${key} must be an ISO timestamp with timezone.`);
    if(Date.parse(f.arrival)<=Date.parse(f.departure)) throw Error('Arrival must be after departure.');
    for(const key of ['airline','aircraft','number','status']) if(f[key]!==undefined&&typeof f[key]!=='string') throw Error(`${key} must be text.`);
  }
  return data;
}
export function filterFlights(flights,{date='',query='',aircraft=''}={}){
  return flights.filter(f=>(!date||f.departure.slice(0,10)===date)&&(!aircraft||f.aircraft===aircraft)&&(!query||[f.id,f.number,f.from,f.to,f.airline].join(' ').toLowerCase().includes(query.toLowerCase())));
}
export {layoutAirports} from './layout.mjs';
export const clockTime = value => value.slice(11,16);
