export function validateSchedule(data) {
  if (!data || !Array.isArray(data.airports) || !Array.isArray(data.flights)) throw Error('Provide airports and flights arrays.');
  if (data.airports.length>250 || data.flights.length>2500) throw Error('Limit each sheet to 250 airports and 2,500 flights.');
  const codes=new Set(), ids=new Set();
  for(const a of data.airports){
    if(!/^[A-Z0-9]{3,4}$/.test(a.code) || typeof a.name!=='string' || !a.name.trim() || !Number.isFinite(a.lat) || Math.abs(a.lat)>90 || !Number.isFinite(a.lon) || Math.abs(a.lon)>180) throw Error('Each airport needs a code, name, latitude and longitude.');
    if(codes.has(a.code)) throw Error('Duplicate airport code.'); codes.add(a.code);
    if(a.alt!==undefined&&typeof a.alt!=='string') throw Error('Airport alt name must be text.');
    if(a.zone!==undefined&&!Number.isFinite(a.zone)) throw Error('Airport zone must be a number.');
    if(a.hub!==undefined&&typeof a.hub!=='string') throw Error('Airport hub must be text.');
    if(a.partner!==undefined&&typeof a.partner!=='string') throw Error('Airport partner must be text.');
    if(a.shape!==undefined&&typeof a.shape!=='string') throw Error('Airport shape must be text.');
    if(a.chamfer!==undefined&&!Number.isFinite(a.chamfer)) throw Error('Airport chamfer must be a number.');
    if(a.polygon!==undefined&&!Array.isArray(a.polygon)) throw Error('Airport polygon must be an array of vertices.');
  }
  if(Array.isArray(data.codeshareAirports)){
    for(const a of data.codeshareAirports){
      if(!/^[A-Z0-9]{3,4}$/.test(a.code) || typeof a.name!=='string' || !a.name.trim() || !Number.isFinite(a.lat) || Math.abs(a.lat)>90 || !Number.isFinite(a.lon) || Math.abs(a.lon)>180) throw Error('Each airport needs a code, name, latitude and longitude.');
      codes.add(a.code);
    }
  }
  for(const f of data.flights){
    if(!codes.has(f.from)||!codes.has(f.to)||f.from===f.to) throw Error('Flight references an invalid airport.');
    if(typeof f.id!=='string'||!f.id.trim()) throw Error('Each flight needs an id.');
    if(ids.has(f.id)) throw Error('Duplicate flight id; include the date for repeated services.');ids.add(f.id);
    for(const key of ['departure','arrival']) if(typeof f[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(f[key])||!Number.isFinite(Date.parse(f[key]))) throw Error(`${key} must be an ISO timestamp with timezone.`);
    if(Date.parse(f.arrival)<=Date.parse(f.departure)) throw Error('Arrival must be after departure.');
    for(const key of ['airline','aircraft','number','status','days','frequency','operator','operatorFlight','via','connectingFrom','connectingTo']) if(f[key]!==undefined&&typeof f[key]!=='string') throw Error(`${key} must be text.`);
    if(f.codeshare!==undefined&&typeof f.codeshare!=='boolean') throw Error('Codeshare flag must be boolean.');
  }
  if(Array.isArray(data.codeshareFlights)){
    for(const f of data.codeshareFlights){
      if(!codes.has(f.from)||!codes.has(f.to)||f.from===f.to) throw Error('Flight references an invalid airport.');
      if(typeof f.id!=='string'||!f.id.trim()) throw Error('Each flight needs an id.');
      ids.add(f.id);
    }
  }
  return data;
}
export function filterFlights(flights,{date='',query='',aircraft='',codeshares=true}={}){
  return flights.filter(f=>(codeshares||!f.codeshare)&&(!date||f.departure.slice(0,10)===date)&&(!aircraft||f.aircraft===aircraft)&&(!query||[f.id,f.number,f.from,f.to,f.airline,f.operator,f.operatorFlight].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())));
}
export {layoutAirports} from './layout.mjs';
export const clockTime = value => value.slice(11,16);
