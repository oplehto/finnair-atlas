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
    for(const key of ['airline','aircraft','number','status','days','frequency','operator','operatorFlight','via','connectingFrom','connectingTo','opens','wetlease','suspendedSince']) if(f[key]!==undefined&&typeof f[key]!=='string') throw Error(`${key} must be text.`);
    if(f.codeshare!==undefined&&typeof f.codeshare!=='boolean') throw Error('Codeshare flag must be boolean.');
    for(const key of ['suspended','fifthFreedom']) if(f[key]!==undefined&&typeof f[key]!=='boolean') throw Error(`${key} flag must be boolean.`);
    if(f.opens!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(f.opens)) throw Error('opens must be a YYYY-MM-DD date.');
  }
  if(Array.isArray(data.codeshareFlights)){
    for(const f of data.codeshareFlights){
      if(!codes.has(f.from)||!codes.has(f.to)||f.from===f.to) throw Error('Flight references an invalid airport.');
      if(typeof f.id!=='string'||!f.id.trim()) throw Error('Each flight needs an id.');
      ids.add(f.id);
    }
  }
  if(data.logo!==undefined&&typeof data.logo!=='string') throw Error('Logo must be text.');
  if(data.copyright!==undefined&&typeof data.copyright!=='string') throw Error('Copyright must be text.');
  return data;
}
export function filterFlights(flights,{date='',query='',aircraft='',codeshares=true}={}){
  const needle=query.replace(/\s+/g,'').toLowerCase();
  return flights.filter(f=>(codeshares||!f.codeshare)&&(!date||f.departure.slice(0,10)===date)&&(!aircraft||f.aircraft===aircraft)&&(!needle||[f.id,f.number,f.from,f.to,f.airline,f.operator,f.operatorFlight].filter(Boolean).join(' ').replace(/\s+/g,'').toLowerCase().includes(needle)));
}
// Timetable form of a flight number: carrier code, a space, then the digits ("AY 431").
export const flightNumber=f=>String(f.number||f.id).trim().replace(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s*(\d+)/i,(m,c,n)=>`${c.toUpperCase()} ${n}`);
export {layoutAirports} from './layout.mjs';
export const clockTime = value => value.slice(11,16);

// --- Weekly timetable model ---------------------------------------------------------------
const DAY_MARKS=['①','②','③','④','⑤','⑥','⑦'];
const daySet=days=>{const s=String(days||'#');if(s.includes('#')||/daily/i.test(s))return new Set([1,2,3,4,5,6,7]);const out=new Set();for(const ch of s){const i=DAY_MARKS.indexOf(ch);if(i>=0)out.add(i+1);}return out.size?out:new Set([1,2,3,4,5,6,7]);};
export const daysOverlap=(a,b)=>{const x=daySet(a),y=daySet(b);for(const d of x)if(y.has(d))return true;return false;};
const isoWeekday=date=>{const d=new Date(date+'T12:00:00Z').getUTCDay();return d===0?7:d;};
const minuteOfDay=t=>Number(t.slice(11,13))*60+Number(t.slice(14,16));

// Collapse dated flights into weekly services: one entry per flight number, route and departure clock
// time. Explicit days marks are kept; otherwise the days are derived from the dates present.
export function weeklyServices(flights){
  const groups=new Map();
  for(const f of flights){const key=[f.number||f.id,f.from,f.to,f.departure.slice(11,16)].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
  return [...groups.values()].map(group=>{
    const [first]=[...group].sort((a,b)=>a.departure.localeCompare(b.departure));
    if(first.days||first.frequency)return first;
    const days=[...new Set(group.map(f=>isoWeekday(f.departure.slice(0,10))))].sort();
    return {...first,days:days.length===7?'#':days.map(d=>DAY_MARKS[d-1]).join('')};
  });
}

// Keep only the partner flights that are the most likely connection at a hub: for each own arrival
// the earliest partner departure at least `minMinutes` later (next day if nothing fits the same
// day), and for each own departure the latest partner arrival that still leaves `minMinutes`.
// Each kept flight carries a `connection` describing the own flight it pairs with.
export function connectionFlights(own,partner,{minMinutes=60}={}){
  const arrivals=new Map(),departures=new Map();
  for(const f of own){
    if(!arrivals.has(f.to))arrivals.set(f.to,[]);arrivals.get(f.to).push(f);
    if(!departures.has(f.from))departures.set(f.from,[]);departures.get(f.from).push(f);
  }
  const best=new Map();
  const consider=(key,candidate)=>{const current=best.get(key);if(!current||candidate.wait<current.wait)best.set(key,candidate);};
  for(const p of partner){
    const via=p.via||(arrivals.has(p.from)?p.from:departures.has(p.to)?p.to:null);
    if(via===p.from){
      for(const o of arrivals.get(via)||[]){
        if(!daysOverlap(o.days,p.days))continue;
        let wait=minuteOfDay(p.departure)-minuteOfDay(o.arrival);const overnight=wait<minMinutes;if(overnight)wait+=1440;
        if(wait<minMinutes)continue;
        consider(`${o.id}>${p.to}`,{p,o,wait,overnight,direction:'out'});
      }
    }else if(via===p.to){
      for(const o of departures.get(via)||[]){
        if(!daysOverlap(o.days,p.days))continue;
        let wait=minuteOfDay(o.departure)-minuteOfDay(p.arrival);const overnight=wait<minMinutes;if(overnight)wait+=1440;
        if(wait<minMinutes)continue;
        consider(`${p.from}>${o.id}`,{p,o,wait,overnight,direction:'in'});
      }
    }
  }
  const kept=new Map();
  for(const {p,o,wait,overnight,direction} of best.values()){
    const current=kept.get(p.id);
    if(!current||wait<current.connection.wait)kept.set(p.id,{...p,connection:{via:direction==='out'?p.from:p.to,direction,id:o.id,number:o.number||o.id,time:direction==='out'?o.arrival.slice(11,16):o.departure.slice(11,16),wait,overnight}});
  }
  return partner.filter(p=>kept.has(p.id)).map(p=>kept.get(p.id));
}
