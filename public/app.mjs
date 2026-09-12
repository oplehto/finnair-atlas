import {layoutFlights,placeFlightLabels,endpointLabels,aircraftNotation} from './layout.mjs';
import {FINNAIR_1968} from './logo.mjs';
import {validateSchedule,filterFlights,layoutAirports,clockTime,flightNumber,weeklyServices,connectionFlights} from './schedule.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const INK={jet:'#09618c',prop:'#454940',codeshare:'#b36200'},PAPER='#f8f7ef';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
let panX=0,panY=0,hasFit=false,mapWidth=1200,mapHeight=900;
let keyboardNav=false;
document.addEventListener('keydown',e=>{if(e.key==='Tab')keyboardNav=true;},true);
document.addEventListener('pointerdown',()=>{keyboardNav=false;},true);
let layoutGeneration=0;
const nextTask=()=>new Promise(resolve=>setTimeout(resolve,0));
let data,visible=[],selected=null,focusAirport=null,hovered=null,scale=0.8,imported=false,busy=false,layoutKey='',geometry,needsFit=false;
const waitText=c=>`${Math.floor(c.wait/60)} h ${String(c.wait%60).padStart(2,'0')} min${c.overnight?' · seuraavana päivänä / next day':''}`;
const measureContext=document.createElement('canvas').getContext('2d');
const LABEL_FONT='700 9.5px "Roboto Condensed"';
function measure(text,font=LABEL_FONT){measureContext.font=font;return measureContext.measureText(text).width;}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const upper=s=>String(s??'').toUpperCase();
const dot=t=>t?t.replace(':','.'):'—';
// A route marked as opening later may have no published times at all.
const timed=f=>!!f.departure&&!!f.arrival;
// FlightAware tracks by ICAO callsign (Finnair AY 431 is FIN431); map the airline prefix, then the number.
const ICAO={AY:'FIN',BA:'BAW',QR:'QTR',QF:'QFA',AA:'AAL',AS:'ASA',JL:'JAL',CX:'CPA',IB:'IBE',AT:'RAM',MH:'MAS',RJ:'RJA',UL:'ALK',WY:'OMA',SK:'SAS',LH:'DLH',KL:'KLM',AF:'AFR',LX:'SWR',OS:'AUA',N7:'NRA'};
const trackLink=number=>{const n=String(number||'').replace(/\s+/g,'').toUpperCase();const m=n.match(/^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/);if(!m)return '';const callsign=(ICAO[m[1]]||m[1])+m[2];return `<a class="track" href="https://www.flightaware.com/live/flight/${encodeURIComponent(callsign)}" target="_blank" rel="noopener noreferrer">${escape(flightNumber({number:n}))} on FlightAware ↗</a>`;};
const inkOf=f=>f.codeshare?'codeshare':/ATR|Dash|DHC|Q400/i.test(f.aircraft||'')?'prop':'jet';
// Reference marks a printed timetable would explain in its notation box: a route that has not opened
// yet, and one that is suspended. Both keep their ink and change only their stroke.
const marksOf=f=>`${f.opens?' opens':''}${f.suspended?' suspended':''}`;
// Worn-print filter: a little ink mottle, a hair of edge wobble and a soft blur, for the logotype only.
const WORN_FILTER='<feTurbulence type="fractalNoise" baseFrequency="0.28" numOctaves="3" seed="7" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.32 1.1" result="mottle"/><feComposite in="SourceGraphic" in2="mottle" operator="in" result="inked"/><feDisplacementMap in="inked" in2="grain" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="wobbled"/><feGaussianBlur in="wobbled" stdDeviation="0.5"/>';
function wornFilter(id){const f=el('filter',{id,x:'-5%',y:'-10%',width:'110%',height:'120%','color-interpolation-filters':'sRGB'});f.innerHTML=WORN_FILTER;return f;}
// The 1968 Finnair logotype as an SVG group, scaled to the given height.
function logotype(height){
 const g=el('g',{class:'logotype',filter:'url(#worn)',transform:`scale(${height/FINNAIR_1968.height})`});
 const inner=el('g',{transform:FINNAIR_1968.transform});
 for(const d of FINNAIR_1968.paths)inner.append(el('path',{d}));
 g.append(inner);
 return g;
}
const logotypeHtml=height=>`<svg class="brand-logo" viewBox="0 0 ${FINNAIR_1968.width} ${FINNAIR_1968.height}" height="${height}" width="${Math.round(height*FINNAIR_1968.width/FINNAIR_1968.height)}" role="img" aria-label="Finnair"><defs><filter id="worn-ui" x="-5%" y="-10%" width="110%" height="120%" color-interpolation-filters="sRGB">${WORN_FILTER}</filter></defs><g filter="url(#worn-ui)"><g transform="${FINNAIR_1968.transform}">${FINNAIR_1968.paths.map(d=>`<path d="${d}"/>`).join('')}</g></g></svg>`;
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))if(v!==null&&v!==undefined)node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
function message(text){$('message').hidden=!text;$('message').textContent=text;}

function setData(next){
 validateSchedule(next);
 data=next;
 $('title').innerHTML=next.logo==='finnair-1968'?logotypeHtml(40)+`<span class="visually-hidden">${escape(next.title||'Finnair')}</span><small class="unofficial">Not an official Finnair site</small>`:escape(next.title||'Airline timetable');
 document.querySelector('.edition').textContent=next.subtitle||'Flight services';
 $('source').textContent=(next.demo?'Example · ':'')+(next.source||'Imported schedule');
 $('updated').textContent=imported?'Local file · weekly services':'Weekly services · Reload picks up a changed schedule';
 $('notice').textContent=[next.copyright?`Courtesy of ${next.copyright}`:'','Not to be relied on for travel',next.logo==='finnair-1968'?'Finnair name and logo are the property of Finnair Oyj':''].filter(Boolean).join(' · ');
 const allFlights=[...data.flights,...(data.codeshareFlights||[])];
 const aircraft=$('aircraft').value;
 $('aircraft').replaceChildren(new Option('All aircraft',''),...[...new Set(allFlights.map(f=>f.aircraft).filter(Boolean))].sort().map(a=>new Option(a,a)));
 if([...$('aircraft').options].some(o=>o.value===aircraft))$('aircraft').value=aircraft;
 // Let the masthead and controls paint before the layout work starts.
 requestAnimationFrame(()=>setTimeout(render,0));
}

// Masthead above the framed sheet: wordmark left, letter-spaced edition line and metadata to its right.
function sheetHeader(x,y,k,points){
 const g=el('g',{class:'sheet-header',transform:`translate(${x} ${y}) scale(${k})`});
 const title=upper(data.title||'Airline timetable');
 const hasLogo=data.logo==='finnair-1968';
 const logoHeight=74,logoWidth=logoHeight*FINNAIR_1968.width/FINNAIR_1968.height;
 const titleWidth=hasLogo?logoWidth:measure(title,'600 64px Oswald')+3*title.length;
 if(hasLogo){const l=logotype(logoHeight);l.setAttribute('transform',`translate(0 4) scale(${logoHeight/FINNAIR_1968.height})`);g.append(l,el('text',{x:2,y:100,class:'sheet-unofficial'},'Ei virallinen sivusto · Not an official Finnair site'));}
 const meta=[data.demo?'Havainnollistava esimerkki / Illustrative example':'','Viikkoaikataulu / Veckotidtabell / Weekly timetable',data.source||'',`${points.length} lentoasemaa / airports`,`${visible.length} viikoittaista vuoroa / weekly services`,'Kaikki ajat paikallisaikoja / All times local'].filter(Boolean).join('  ·  ');
 g.append(...[
  hasLogo?null:el('text',{x:0,y:64,class:'sheet-brand'},title),
  el('text',{x:titleWidth+44,y:62,class:'sheet-edition'},upper(data.subtitle||'Flight services')),
  el('text',{x:titleWidth+44,y:90,class:'sheet-meta'},meta)
 ].filter(Boolean));
 return g;
}

// Explanations box at the foot of the sheet, three columns like the 1974 reference.
function sheetLegend(x,y,k,width){
 const W=width/k,H=274;
 const g=el('g',{class:'sheet-legend',transform:`translate(${x} ${y}) scale(${k})`});
 g.append(
  el('rect',{x:0,y:0,width:W,height:H,class:'legend-box'}),
  el('text',{x:20,y:30,class:'legend-title'},'SELITYKSET — FÖRKLARINGAR — EXPLANATIONS'),
  el('line',{x1:0,y1:44,x2:W,y2:44,class:'legend-rule'})
 );
 const colW=(W-40)/3;
 const column=(index,heading)=>{const c=el('g',{transform:`translate(${20+colW*index} 68)`});c.append(el('text',{x:0,y:0,class:'legend-head'},heading));g.append(c);return c;};
 const item=(c,x,y,text,cls='legend-item')=>c.append(el('text',{x,y,class:cls},text));

 const days=column(0,'LIIKENNÖINTIPÄIVÄT — TRAFIKDAGAR — DAYS OF OPERATION');
 [['#','Joka päivä / Dagligen / Daily'],['①','Maanantai / Måndag / Monday'],['②','Tiistai / Tisdag / Tuesday'],['③','Keskiviikko / Onsdag / Wednesday'],['④','Torstai / Torsdag / Thursday'],['⑤','Perjantai / Fredag / Friday'],['⑥','Lauantai / Lördag / Saturday'],['⑦','Sunnuntai / Söndag / Sunday']].forEach(([sym,text],i)=>{
  const col=i<4?0:1,row=i%4;
  item(days,col*(colW/2),22+row*20,`${sym} = ${text}`);
 });

 const fleet=column(1,'KALUSTO — FLYGPLANSTYP — AIRCRAFT');
 const types=[...new Set(visible.map(f=>f.aircraft).filter(Boolean))].map(a=>[aircraftNotation(a),a]).sort((a,b)=>a[0].localeCompare(b[0]));
 const shown=types.length>21?types.slice(0,20):types;
 shown.forEach(([code,name],i)=>{const col=Math.floor(i/7),row=i%7;item(fleet,col*(colW/3),22+row*20,`${code} = ${name}`);});
 if(types.length>21)item(fleet,2*(colW/3),22+6*20,`… ja ${types.length-20} muuta / and ${types.length-20} more`);

 const marks=column(2,'MERKINNÄT — TECKENFÖRKLARING — NOTATION');
 const sample=(y,cls,dash,marker=cls)=>{marks.append(el('path',{d:`M 0 ${y} L 72 ${y}`,class:`legend-sample ${cls}`,'stroke-dasharray':dash,'marker-end':`url(#${marker})`}));};
 sample(18,'jet','none');item(marks,86,22,'Finnair, suihkukone / jet — sininen viiva');
 sample(38,'prop','7 3');item(marks,86,42,'Potkuriturbiini / turboprop — musta katkoviiva');
 sample(58,'codeshare','8 3');item(marks,86,62,'Yhteistyölento / partner codeshare — keltainen katkoviiva');
 sample(78,'opens','1.5 4','jet');item(marks,86,82,'Avautuva reitti / route opening later — pisteviiva, ▷ = ensimmäinen päivä / first date');
 sample(98,'suspended','14 3 2 3','jet');item(marks,86,102,'Keskeytetty reitti / suspended route — pitkä katkoviiva, ei liikennettä / no service');
 item(marks,0,126,'13.35 = lähtö- tai tuloaika lentoaseman reunassa / departure or arrival time at the airport edge');
 item(marks,0,146,'AY 431 # A321 = lennon numero · päivät · kalusto / flight number · days · aircraft');
 item(marks,0,166,'† = vuokrattu kone / aircraft wet-leased  ·  ⁵ = viidennen vapauden osuus / fifth-freedom sector');
 item(marks,0,186,'Nuolenkärki = saapuminen / arrival · Katkos viivassa = ylittävä reitti / gap = route passing over');
 item(marks,0,206,'Reunan pituus = vuorojen määrä / edge length = number of services');
 g.append(
  el('line',{x1:0,y1:H-50,x2:W,y2:H-50,class:'legend-rule'}),
  el('text',{x:20,y:H-32,class:'legend-item'},'Aikataulut ja konetyypit voidaan muuttaa ilmoittamatta · Tidtabeller och flygplanstyper kan ändras utan föregående meddelande · Schedules and aircraft types may change without notice'),
  el('text',{x:W-20,y:H-32,'text-anchor':'end',class:'legend-item'},data.demo?'Havainnollistava aineisto, ei matkasuunnitteluun / Illustrative data, not for travel planning':(data.source||'')),
  el('text',{x:20,y:H-12,class:'legend-item legend-fine'},[data.copyright?`Kartan tarjoaa ${data.copyright} / Courtesy of ${data.copyright}`:'',`Tätä karttaa ei tule käyttää matkasuunnitteluun eikä siihen tule luottaa / This sheet must not be relied on for travel or any other purpose`,data.logo==='finnair-1968'?'Finnair-nimi ja -tunnus ovat Finnair Oyj:n omaisuutta, tässä vain havainnollistamassa / The Finnair name and logo are the property of Finnair Oyj, shown for illustration only':''].filter(Boolean).join('  ·  '))
 );
 return g;
}

function hubInterior(a){
 const g=el('g',{class:'hub-interior'});
 const t=clamp(Math.min(a.width/14,a.height/4),36,320);
 g.append(
  el('text',{x:0,y:-t*0.15,'text-anchor':'middle',class:'hub-title',style:`font-size:${t}px`},upper(a.name)),
  el('text',{x:0,y:t*0.47,'text-anchor':'middle',class:'hub-subtitle',style:`font-size:${t*0.5}px`},upper(a.alt||a.code)),
  el('text',{x:0,y:t*0.79,'text-anchor':'middle',class:'hub-tag',style:`font-size:${Math.max(12,t*0.16)}px`},`${a.code} · KESKUSLENTOASEMA / CENTRAL HUB · ${a.services} VUOROA VIIKOSSA / WEEKLY SERVICES`)
 );
 return g;
}

function render(){
 if(!data)return;
 const showCodeshare=$('show-codeshares')?.checked??true;
 const activeAirports=[...data.airports,...(showCodeshare?(data.codeshareAirports||[]):[])];
 const own=weeklyServices(data.flights);
 const partner=showCodeshare?connectionFlights(own,weeklyServices(data.codeshareFlights||[])):[];
 visible=filterFlights([...own,...partner],{query:$('query').value,aircraft:$('aircraft').value,codeshares:showCodeshare}).sort((a,b)=>(a.codeshare?1:0)-(b.codeshare?1:0)||(clockTime(a.departure)||'99:99').localeCompare(clockTime(b.departure)||'99:99')||a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.id.localeCompare(b.id));
 if(!visible.some(f=>f.id===selected))selected=null;
 if(!visible.length){
  $('diagram').replaceChildren();$('diagram').hidden=true;$('empty').hidden=false;
  $('count').textContent='0 flights';$('flights').innerHTML='';$('layout-note').textContent='';detail();return;
 }

 const key=JSON.stringify([activeAirports,visible]);
 if(key!==layoutKey){
  const generation=++layoutGeneration,codes=new Set(visible.flatMap(f=>[f.from,f.to]));
  const snapshot=visible;
  $('layout-note').textContent='Laying out the sheet…';
  (async()=>{
   const points=layoutAirports(activeAirports.filter(a=>codes.has(a.code)),snapshot);
   await nextTask();if(generation!==layoutGeneration)return;
   const routes=layoutFlights(points,snapshot);
   await nextTask();if(generation!==layoutGeneration)return;
   const labels=placeFlightLabels(routes,points,text=>measure(text)+0.3*text.length);
   await nextTask();if(generation!==layoutGeneration)return;
   geometry={points,routes,labels};
   needsFit=!!layoutKey;
   layoutKey=key;
   render();
  })();
  return;
 }
 const {points,routes,labels}=geometry;
 const byCode=new Map(points.map(p=>[p.code,p]));
 const byName=code=>byCode.get(code)?.name||code;
 // Which edges of each box carry ports, from the routed endpoints; the city name moves away from them.
 const portSides=new Map();
 for(const r of routes)for(const [p,code] of [[r.start,r.flight.from],[r.end,r.flight.to]]){const n=byCode.get(code);if(!n)continue;const s=portSides.get(code)||{top:0,bottom:0};if(Math.abs(p.y-(n.y-n.height/2-8))<0.01)s.top++;else if(Math.abs(p.y-(n.y+n.height/2+8))<0.01)s.bottom++;portSides.set(code,s);}
 // Name block: centred by default; in the half away from the ports when only one horizontal edge carries them.
 // Three lines per spoke: the IATA code in small caps above, the city name, then the secondary name.
 // The block spans 52 units, which layout.mjs reserves when it sizes a box from its text.
 const nameBlock=a=>{const s=portSides.get(a.code),hh=a.height/2;if(!s||(s.top&&s.bottom)||(!s.top&&!s.bottom))return {code:-22,name:-5,alt:17};return s.top?{code:hh-50,name:hh-33,alt:hh-15}:{code:-hh+24,name:-hh+41,alt:-hh+59};};
 const partnerOf=new Map((data.codeshareAirports||[]).filter(a=>a.hub&&a.partner).map(a=>[a.hub,a.partner]));

 // Sheet geometry: content bounds, then a scale factor so masthead, frame and legend read at the fit view.
 const coords=routes.flatMap(r=>r.points||[r.start,r.end]);
 let cl=Math.min(...coords.map(p=>p.x),...points.map(p=>p.x-p.width/2))-60;
 let ct=Math.min(...coords.map(p=>p.y),...points.map(p=>p.y-p.height/2))-60;
 let cr=Math.max(...coords.map(p=>p.x),...points.map(p=>p.x+p.width/2))+60;
 let cb=Math.max(...coords.map(p=>p.y),...points.map(p=>p.y+p.height/2))+60;
 if(cr-cl<1400){const mid=(cl+cr)/2;cl=mid-700;cr=mid+700;}
 if(cb-ct<500)cb=ct+500;
 const k=clamp((cr-cl)/3000,1,3.4),kh=clamp((cr-cl)/2300,1,4.4);
 const pad=48*k,gap=30*k,headH=112*kh,legendH=252*k;
 const frameX=cl-gap,frameY=ct-gap,frameW=(cr-cl)+2*gap;
 const legendY=cb+gap,frameH=legendY+legendH+gap-frameY;
 const left=frameX-pad,top=frameY-headH-pad,width=frameW+2*pad,height=frameH+headH+2*pad;

 const svg=el('svg',{xmlns:NS,viewBox:`${left} ${top} ${width} ${height}`,width,height,role:'group','aria-label':'Airline schedule diagram. Each arrow is one flight; larger airport boxes indicate more services.'});
 const defs=el('defs');
 for(const[id,color]of Object.entries(INK)){
  const marker=el('marker',{id,viewBox:'0 0 10 10',refX:9.5,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
  marker.append(el('path',{d:'M 0 1 L 10 5 L 0 9 z',fill:color}));
  defs.append(marker);
 }
 defs.append(wornFilter('worn'));
 svg.append(defs);
 svg.append(el('rect',{x:frameX,y:frameY,width:frameW,height:frameH,class:'sheet-frame'}));
 svg.append(sheetHeader(frameX,frameY-headH,kh,points));

 // Flight routes: transparent hit area, paper under-stroke for crossing breaks, then the ink.
 const routesG=el('g',{class:'routes'});
 for(const route of routes){
  const f=route.flight,ink=inkOf(f);
  const g=el('g',{class:`flight ${ink}${marksOf(f)}${selected===f.id?' selected':''}`,tabindex:0,role:'button','aria-label':`${f.number||f.id}: ${f.from} to ${f.to}${timed(f)?`, ${clockTime(f.departure)} to ${clockTime(f.arrival)}`:f.opens?`, opening ${f.opens}`:''}`});
  g.dataset.id=f.id;
  g.append(
   el('path',{d:route.path,class:'hit'}),
   el('path',{d:route.path,class:'under'}),
   el('path',{d:route.path,class:'ink',stroke:INK[ink],'marker-end':`url(#${ink})`})
  );
  routesG.append(g);
 }
 svg.append(routesG);

 // Airport boxes and typography
 const airportsG=el('g',{class:'airports'});
 for(const a of points){
  const isHub=!!a.isRegionalHub,isCS=!!a.codeshare,isGateway=!!a.isGatewayHub;
  const g=el('g',{class:`airport${isHub?' hub regional-hub':isGateway?' hub gateway-hub':''}${isCS?' codeshare-airport':''}`,transform:`translate(${a.x} ${a.y})`,role:'button',tabindex:0,'aria-label':`${a.name} (${a.code}): ${a.services} services. Activate to show only this airport's flights.`});
  g.dataset.code=a.code;
  const outline=(cls)=>a.polygonPoints?el('polygon',{points:a.polygonPoints,class:cls}):el('rect',{x:-a.width/2,y:-a.height/2,width:a.width,height:a.height,class:cls});
  if(isHub){
   g.append(outline('hub-outer'));
   g.append(hubInterior(a));
  }else if(isGateway){
   const t=clamp(a.width/14,18,30);
   g.append(
    outline(''),
    el('text',{x:0,y:-t*0.55,'text-anchor':'middle',class:'city-name',style:`font-size:${t}px`},upper(a.name)),
    el('text',{x:0,y:t*0.5,'text-anchor':'middle',class:'city-alt',style:`font-size:${t*0.6}px`},upper(a.alt||a.code)),
    el('text',{x:0,y:t*1.45,'text-anchor':'middle',class:'city-cs-badge',style:`font-size:${Math.max(9,t*0.42)}px`},`${a.code} · VAIHTOASEMA / GATEWAY${partnerOf.has(a.code)?' · '+upper(partnerOf.get(a.code)):''}`)
   );
  }else{
   g.append(outline(''));
   const nb=nameBlock(a);
   if(isCS){
    const dy=nb.name+7;
    g.append(
     el('text',{x:0,y:dy-16,'text-anchor':'middle',class:'city-name'},upper(a.name)),
     el('text',{x:0,y:dy+4,'text-anchor':'middle',class:'city-alt'},upper(a.alt||a.code)),
     el('text',{x:0,y:dy+22,'text-anchor':'middle',class:'city-cs-badge'},`${a.code} · VIA ${a.hub||'HUB'} · ${upper(a.partner||'partner')}`)
    );
   }else{
    g.append(
     el('text',{x:0,y:nb.code,'text-anchor':'middle',class:'city-code'},a.code),
     el('text',{x:0,y:nb.name,'text-anchor':'middle',class:'city-name'},upper(a.name)),
     ...(a.alt?[el('text',{x:0,y:nb.alt,'text-anchor':'middle',class:'city-alt'},upper(a.alt))]:[])
    );
   }
  }
  airportsG.append(g);
 }
 svg.append(airportsG);

 // Departure and arrival times beside each arrow's endpoints
 const timesG=el('g',{class:'times'});
 for(const route of routes){
  const f=route.flight;
  const g=el('g',{class:`edge-times ${inkOf(f)}${marksOf(f)}${selected===f.id?' selected':''}`});
  g.dataset.id=f.id;
  for(const label of endpointLabels(route,points))g.append(el('text',{x:label.x,y:label.y,class:label.hub?'hub-time':null,'text-anchor':label.anchor||'middle','dominant-baseline':'central',transform:`rotate(${label.angle} ${label.x} ${label.y})`},label.text));
  timesG.append(g);
 }
 svg.append(timesG);

 // Destination codes along the main hub's edges: one per route bundle, just inside the times, clickable.
 const hub=points.find(p=>p.isRegionalHub);
 if(hub){
  const portsG=el('g',{class:'hub-ports'});
  const bundles=new Map();
  for(const route of routes){
   const f=route.flight;
   if(f.from!==hub.code&&f.to!==hub.code)continue;
   const other=f.from===hub.code?f.to:f.from,p=f.from===hub.code?route.start:route.end;
   if(!bundles.has(other))bundles.set(other,[]);
   bundles.get(other).push(p);
  }
  // Each destination's group of lanes gets a bracket just inside the times and its code beyond it.
  for(const [code,pts] of bundles){
   const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
   const onTopOrBottom=Math.abs(Math.abs(cy-hub.y)-hub.height/2-8)<0.01;
   const nx=onTopOrBottom?0:Math.sign(cx-hub.x),ny=onTopOrBottom?Math.sign(cy-hub.y):0;
   const lo=Math.min(...pts.map(p=>onTopOrBottom?p.x:p.y))-6,hi=Math.max(...pts.map(p=>onTopOrBottom?p.x:p.y))+6;
   const depth=104,tick=6,d=onTopOrBottom
    ?`M ${lo} ${cy-ny*(depth-tick)} L ${lo} ${cy-ny*depth} L ${hi} ${cy-ny*depth} L ${hi} ${cy-ny*(depth-tick)}`
    :`M ${cx-nx*(depth-tick)} ${lo} L ${cx-nx*depth} ${lo} L ${cx-nx*depth} ${hi} L ${cx-nx*(depth-tick)} ${hi}`;
   const x=cx-nx*(depth+22),y=cy-ny*(depth+22),w=measure(code,'700 13px "Roboto Condensed"')+8;
   const g=el('g',{class:'hub-port',role:'button',tabindex:0,'aria-label':`${byName(code)} (${code}), ${pts.length} services. Activate to show only this airport's flights.`});
   g.dataset.code=code;
   g.append(el('path',{d,class:'hub-bracket'}),el('rect',{x:x-w/2,y:y-9,width:w,height:18,class:'hub-port-bg'}),el('text',{x,y,'text-anchor':'middle','dominant-baseline':'central'},code));
   portsG.append(g);
  }
  svg.append(portsG);
 }

 // Flight number · days · aircraft, set inline on the route in its own ink
 const labelsG=el('g',{class:'labels'});
 for(const route of routes){
  const f=route.flight,label=labels.get(f.id);
  if(!label)continue;
  const g=el('g',{class:`label-plate ${inkOf(f)}${marksOf(f)}${label.hidden?' crowded-label':''}${selected===f.id?' selected':''}`,transform:`rotate(${label.angle*180/Math.PI} ${label.x} ${label.y})`});
  g.dataset.id=f.id;
  g.append(
   el('rect',{x:label.x-label.width/2,y:label.y-6.5,width:label.width,height:13,class:'label-bg'}),
   el('text',{x:label.x,y:label.y,'dominant-baseline':'central','text-anchor':'middle',class:'flight-label'},label.text)
  );
  labelsG.append(g);
 }
 svg.append(labelsG);
 svg.append(sheetLegend(frameX+gap,legendY,k,frameW-2*gap));

 const activate=target=>{if(target?.dataset.id)select(target.dataset.id);else if(target?.dataset.code)filterToAirport(target.dataset.code);};
 svg.addEventListener('click',e=>activate(e.target.closest('.flight,.airport,.hub-port')));
 svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const target=e.target.closest('.flight,.airport,.hub-port');if(target){e.preventDefault();activate(target);}}});
 svg.addEventListener('pointerover',e=>{const target=e.target.closest('.flight');if(target)hover(target.dataset.id);});
 svg.addEventListener('pointerout',e=>{const target=e.target.closest('.flight');if(target&&!target.contains(e.relatedTarget))hover(null);});
 svg.addEventListener('focusin',e=>{viewport.scrollLeft=0;viewport.scrollTop=0;const target=e.target.closest('.flight');if(target){hover(target.dataset.id);if(keyboardNav)reveal(target.dataset.id,{onlyIfHidden:true});}});
 svg.addEventListener('focusout',e=>hover(null));

 const hiddenLabels=[...labels.values()].filter(l=>l.hidden).length;
 $('layout-note').textContent=`Airport boxes sized by service volume${hiddenLabels?` · ${hiddenLabels} crowded labels appear on hover or selection`:''}`;
 mapWidth=width;mapHeight=height;
 hovered=null;
 $('diagram').replaceChildren(svg);
 $('diagram').classList.toggle('has-selection',!!selected);
 if(!hasFit){if(innerWidth<=700)focusHub();else fit();hasFit=true;}
 else if(needsFit){glide(fit);}
 needsFit=false;
 applyView();
 $('diagram').hidden=false;
 $('empty').hidden=true;
 $('count').textContent=`${points.length} airports · ${visible.length} weekly services on the sheet`;
 $('scale').textContent=`${Math.round(scale*100)}%`;
 renderList();
 applyFocus();
 detail();
 showPanel();
}

const touches=(f,code)=>f.from===code||f.to===code;
const minutesOf=f=>timed(f)?Math.round((Date.parse(f.arrival)-Date.parse(f.departure))/60000):null;
const hm=m=>`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`;
// The full journey a partner connection belongs to: Finnair leg to the hub, the wait, then the partner leg (or the reverse).
function itineraryHtml(f){
 const c=f.connection,own=c&&visible.find(x=>x.id===c.id);
 if(!own)return '';
 const legs=c.direction==='out'?[own,f]:[f,own];
 const total=minutesOf(legs[0])+c.wait+minutesOf(legs[1]);
 const leg=x=>`<div class="leg"><b>${escape(x.from)} ${dot(clockTime(x.departure))} → ${escape(x.to)} ${dot(clockTime(x.arrival))}</b><span>${escape(flightNumber(x))} · ${escape(x.days||'#')} · ${escape(aircraftNotation(x.aircraft||''))} · ${escape(x.operator||x.airline||'')} · ${hm(minutesOf(x))}</span></div>`;
 return `<div class="itinerary">${leg(legs[0])}<div class="wait">${hm(c.wait)} at ${escape(c.via)}${c.overnight?' · next day':''}</div>${leg(legs[1])}<div class="total">${escape(legs[0].from)} → ${escape(legs[1].to)} · ${hm(total)} in total</div></div>`;
}
// The side panel is a pop-up: a flight's details, or an airport's connections. Nothing else lives there.
function showPanel(){$('panel').hidden=!selected&&!focusAirport;$('panel-title').textContent=selected?'Flight details':focusAirport?'Connections':'';}
function renderList(){
 const airport=focusAirport&&geometry?.points.find(p=>p.code===focusAirport);
 const list=airport&&!selected?visible.filter(f=>touches(f,focusAirport)):[];
 $('list-title').hidden=!list.length;
 $('list-title').textContent=airport?`Services at ${airport.name} (${airport.code})`:'';
 $('flights').innerHTML=list.map(f=>`<button class="service ${inkOf(f)}${selected===f.id?' selected':''}" data-id="${escape(f.id)}"><strong>${escape(f.from)} — ${escape(f.to)} <b>${dot(clockTime(f.departure))}</b></strong><span>${escape(flightNumber(f))} · ${escape(f.days||f.frequency||'#')} · ${escape(aircraftNotation(f.aircraft||''))||'—'} · ${escape(f.operator||f.airline||'Airline unspecified')}</span></button>`).join('');
}

// Highlight one airport's connections in place: dim everything else, list its services in the panel.
function focus(code){
 focusAirport=focusAirport===code?null:code;
 if(focusAirport&&selected){toggleAll(selected,'selected',false);selected=null;$('diagram').classList.remove('has-selection');}
 applyFocus();
 renderList();
 detail();
 showPanel();
}
function applyFocus(){
 const diagram=$('diagram');
 diagram.classList.toggle('has-focus',!!focusAirport);
 const own=focusAirport?visible.filter(f=>touches(f,focusAirport)):[];
 const ids=new Set(own.flatMap(f=>f.connection?[f.id,f.connection.id]:[f.id]));
 for(const node of diagram.querySelectorAll('[data-id]'))node.classList.toggle('focused',ids.has(node.dataset.id));
 for(const node of diagram.querySelectorAll('[data-code]'))node.classList.toggle('focused',node.dataset.code===focusAirport);
}

$('flights').addEventListener('click',e=>{const btn=e.target.closest('.service');if(btn?.dataset.id)select(btn.dataset.id);});

function filterToAirport(code){focus(code);}

// Pan (and if needed zoom) so the route is on screen; used for list picks and keyboard focus.
function reveal(id,{onlyIfHidden=false}={}){
 const node=document.querySelector(`.flight[data-id="${CSS.escape(id)}"] .ink`);
 if(!node)return;
 const r=node.getBoundingClientRect();
 const cx=r.x+r.width/2,cy=r.y+r.height/2;
 const inside=r.x>=300&&r.right<=innerWidth-320&&r.y>=60&&r.bottom<=innerHeight-60;
 if(onlyIfHidden&&inside&&scale>=0.45)return;
 const target=Math.max(scale,0.8);
 panX+=innerWidth/2-cx;panY+=innerHeight/2-cy;
 if(target!==scale){panX=innerWidth/2-(innerWidth/2-panX)*target/scale;panY=innerHeight/2-(innerHeight/2-panY)*target/scale;scale=target;}
 applyView();
}

// Narrow screens start on the hub at a readable scale instead of an unreadable full fit.
function focusHub(){
 const hub=document.querySelector('.airport.regional-hub')||document.querySelector('.airport');
 if(!hub){fit();return;}
 scale=0.3;applyView();
 const r=hub.getBoundingClientRect();
 panX+=innerWidth/2-(r.x+r.width/2);panY+=innerHeight/2-(r.y+r.height*0.25);
 applyView();
}

function toggleAll(id,cls,on){if(!id)return;for(const node of document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`))node.classList.toggle(cls,on);}
function hover(id){if(id===hovered)return;toggleAll(hovered,'hover',false);hovered=id;toggleAll(hovered,'hover',true);}

const linkedOf=id=>visible.find(f=>f.id===id)?.connection?.id||null;
function select(id,{reveal:show=false}={}){
 const prev=selected;
 selected=selected===id?null:id;
 toggleAll(prev,'selected',false);
 toggleAll(linkedOf(prev),'linked',false);
 $('diagram').classList.toggle('has-selection',!!selected);
 detail();
 if(selected){
  toggleAll(selected,'selected',true);
  toggleAll(linkedOf(selected),'linked',true);
  document.querySelector(`.service[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({block:'nearest'});
  if(show)glide(()=>reveal(selected));
 }
 renderList();
 showPanel();
}

function detail(){
 const f=visible.find(f=>f.id===selected);
 if(!f&&focusAirport){
  const a=geometry?.points.find(p=>p.code===focusAirport);
  const services=visible.filter(x=>touches(x,focusAirport));
  const destinations=[...new Set(services.map(x=>x.from===focusAirport?x.to:x.from))].sort();
  $('detail').innerHTML=`<div class="route">${escape(a?.name||focusAirport)}</div><p>${escape(a?.alt||'')}${a?.alt?' · ':''}${escape(focusAirport)}</p><dl><dt>Weekly services</dt><dd>${services.length}</dd><dt>Destinations</dt><dd>${destinations.length}</dd></dl><p class="destinations">${destinations.map(escape).join(' · ')}</p>${services.some(x=>x.connection)?`<h3>Journeys via ${escape([...new Set(services.map(x=>x.connection?.via).filter(Boolean))].join(', '))}</h3>${services.filter(x=>x.connection).map(itineraryHtml).join('')}`:''}`;
  return;
 }
 if(!f){$('detail').innerHTML='';return;}
 const name=code=>geometry?.points.find(a=>a.code===code)?.name||code;
 const minutes=minutesOf(f)??0;
 const zone=t=>t.endsWith('Z')?'UTC':`UTC${t.slice(-6)}`;
 $('detail').innerHTML=`<div class="route ${inkOf(f)}">${escape(f.from)} → ${escape(f.to)}</div><p>${escape(name(f.from))} → ${escape(name(f.to))}</p>${f.codeshare?`<div class="codeshare-badge">Partner codeshare · operated by ${escape(f.operator||'partner')}${f.operatorFlight?` as ${escape(f.operatorFlight)}`:''}</div>`:''}<dl><dt>Flight</dt><dd>${escape(flightNumber(f))}</dd><dt>Airline</dt><dd>${escape(f.operator||f.airline||'Unspecified')}</dd><dt>Days</dt><dd>${escape(f.days||f.frequency||'Daily (#)')}</dd>${timed(f)?`<dt>Departure</dt><dd>${dot(clockTime(f.departure))} <small>${escape(zone(f.departure))}</small></dd><dt>Arrival</dt><dd>${dot(clockTime(f.arrival))}${f.arrival.slice(0,10)>f.departure.slice(0,10)?' <small>+1</small>':''} <small>${escape(zone(f.arrival))}</small></dd><dt>Duration</dt><dd>${Math.floor(minutes/60)} h ${minutes%60} min</dd>`:'<dt>Timetable</dt><dd>not published yet</dd>'}<dt>Aircraft</dt><dd>${escape(f.aircraft||'Unspecified')}</dd><dt>Status</dt><dd>${f.opens?`opens ${escape(f.opens)}`:f.suspended?'suspended':escape(f.status||'Scheduled')}</dd>${f.wetlease?`<dt>Aircraft leased from</dt><dd>${escape(f.wetlease)}</dd>`:''}${f.fifthFreedom?'<dt>Traffic right</dt><dd>fifth freedom, sold as its own flight</dd>':''}<dt>Track</dt><dd>${trackLink(f.codeshare&&f.operatorFlight?f.operatorFlight.split(',')[0]:(f.number||f.id))}</dd>${f.connection?itineraryHtml(f)+`<dt>Connection</dt><dd>${f.connection.direction==='out'?`from ${escape(flightNumber({number:f.connection.number}))}, arrives ${dot(f.connection.time)}`:`to ${escape(flightNumber({number:f.connection.number}))}, departs ${dot(f.connection.time)}`}<br><small>${escape(waitText(f.connection))} at ${escape(f.connection.via)}</small></dd>`:f.via?`<dt>Connection</dt><dd>via ${escape(f.via)}</dd>`:''}</dl>`;
}

async function refresh(){
 if(busy)return;
 busy=true;
 $('refresh').disabled=true;
 try{
  // A static build names its baked schedule in a meta tag; the Node server answers api/schedule.
  const baked=document.querySelector('meta[name="schedule-source"]')?.content;
  let response=await fetch(baked||'api/schedule',{signal:AbortSignal.timeout(20000)}).catch(()=>null);
  if(!baked&&(!response||!response.ok))response=await fetch('schedule.json',{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Schedule unavailable. Last successful schedule is still displayed.');
  const next=await response.json();
  if(imported)return;
  setData(next);
  message('');
 }catch(e){
  message(e.message);
 }finally{
  busy=false;
  $('refresh').disabled=false;
 }
}

$('aircraft').onchange=render;
$('query').oninput=render;
if($('show-codeshares'))$('show-codeshares').onchange=render;
$('clear').onclick=()=>{if(selected)select(selected);if(focusAirport)focus(focusAirport);};

let animFrame=null,lastScaleText='',glideTimer=null;
// Eased view changes for buttons, keys and list picks; dragging and wheel stay direct.
function glide(change){
 const d=$('diagram');
 clearTimeout(glideTimer);
 d.classList.add('gliding');
 change();
 glideTimer=setTimeout(()=>d.classList.remove('gliding'),360);
}
function applyView(){
 $('diagram').style.transform=`translate3d(${panX}px,${panY}px,0) scale(${scale})`;
 $('diagram').style.setProperty('--hit',`${Math.max(14,Math.min(40,10/scale))}`);
 const scaleText=`${Math.round(scale*100)}%`;
 if(lastScaleText!==scaleText){$('scale').textContent=scaleText;lastScaleText=scaleText;}
}
function scheduleApplyView(){
 if(animFrame)return;
 animFrame=requestAnimationFrame(()=>{animFrame=null;applyView();});
}

function zoomAt(next,x=innerWidth/2,y=innerHeight/2){
 next=Math.max(0.04,Math.min(5,next));
 if(next===scale)return;
 panX=x-(x-panX)*next/scale;
 panY=y-(y-panY)*next/scale;
 scale=next;
 scheduleApplyView();
}

function fit(){
 const left=innerWidth>700?330:20,right=innerWidth>700?40:20;
 scale=Math.min((innerWidth-left-right)/mapWidth,(innerHeight-110)/mapHeight);
 panX=left+(innerWidth-left-right-mapWidth*scale)/2;
 panY=50+(innerHeight-110-mapHeight*scale)/2;
 applyView();
}

$('plus').onclick=()=>glide(()=>zoomAt(scale*1.25));
$('minus').onclick=()=>glide(()=>zoomAt(scale/1.25));
$('fit').onclick=()=>glide(fit);
$('actual').onclick=()=>glide(()=>zoomAt(1));

const viewport=$('viewport'),pointers=new Map();
let dragged=false;

viewport.addEventListener('dblclick',e=>{e.preventDefault();if(e.target.closest('.flight,.airport,.hub-port'))return;glide(()=>zoomAt(scale*1.6,e.clientX,e.clientY));});
// Wheel and two-finger scroll zoom around the pointer in every browser; Shift+wheel pans. Pinch
// (reported as ctrlKey) zooms faster. Line- and page-mode deltas are normalised to pixels first.
viewport.addEventListener('wheel',e=>{
 e.preventDefault();
 const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;
 const dx=e.deltaX*unit,dy=e.deltaY*unit;
 if(e.shiftKey&&!e.ctrlKey){panX-=(dy||dx);panY-=0;scheduleApplyView();return;}
 const rate=e.ctrlKey?0.01:0.0022;
 zoomAt(scale*Math.exp(-Math.max(-120,Math.min(120,dy))*rate),e.clientX,e.clientY);
},{passive:false});

// Focusing a route or box must never scroll the map container: take focus without scrolling.
viewport.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 const target=e.target.closest?.('.flight,.airport,.hub-port');
 if(target){e.preventDefault();target.focus({preventScroll:true});}
 dragged=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
});
viewport.addEventListener('scroll',()=>{viewport.scrollLeft=0;viewport.scrollTop=0;});
viewport.addEventListener('pointermove',e=>{
 const old=pointers.get(e.pointerId);
 if(!old)return;
 const next={x:e.clientX,y:e.clientY};
 if(Math.hypot(next.x-old.x,next.y-old.y)>6||dragged){
  dragged=true;
  viewport.setPointerCapture(e.pointerId);
  viewport.classList.add('dragging');
  if(pointers.size===2){
   const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];
   const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);
   const nextScale=Math.max(0.04,Math.min(5,scale*after/(before||1)));
   const midX=(old.x+other.x)/2,midY=(old.y+other.y)/2;
   panX=midX-(midX-panX)*nextScale/scale;
   panY=midY-(midY-panY)*nextScale/scale;
   scale=nextScale;
   panX+=(next.x-old.x)/2;
   panY+=(next.y-old.y)/2;
  }else{
   panX+=next.x-old.x;
   panY+=next.y-old.y;
  }
  scheduleApplyView();
  pointers.set(e.pointerId,next);
 }
});

for(const event of ['pointerup','pointercancel'])viewport.addEventListener(event,e=>{pointers.delete(e.pointerId);if(!pointers.size){viewport.classList.remove('dragging');applyView();}});
viewport.addEventListener('click',e=>{if(dragged){e.stopPropagation();e.preventDefault();}},{capture:true});
viewport.addEventListener('keydown',e=>{
 const delta={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]}[e.key];
 if(delta){e.preventDefault();panX+=delta[0];panY+=delta[1];scheduleApplyView();}
 else if(e.key==='+'||e.key==='=')glide(()=>zoomAt(scale*1.25));
 else if(e.key==='-')glide(()=>zoomAt(scale/1.25));
 else if(e.key==='0')glide(fit);
 else if(e.key==='Escape'){if(selected)select(selected);else if(focusAirport)focus(focusAirport);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.target.closest('input,select')){if(selected)select(selected);else if(focusAirport)focus(focusAirport);}});

$('refresh').onclick=()=>{imported=false;refresh();};
$('export').onclick=async()=>{
 const svg=$('diagram').querySelector('svg');
 if(!svg||!visible.length){message('No flights to export.');return;}
 $('export').disabled=true;
 try{
  const clone=svg.cloneNode(true),style=el('style');
  for(const plate of clone.querySelectorAll('.crowded-label'))plate.classList.remove('crowded-label');
  for(const node of clone.querySelectorAll('.hover'))node.classList.remove('hover');
  const response=await fetch('fonts.css');
  if(!response.ok)throw Error('Font stylesheet could not be loaded.');
  let fontCss=await response.text();
  for(const match of [...fontCss.matchAll(/url\('([^']+)'\)/g)]){
   const r=await fetch(match[1]);
   if(!r.ok)throw Error('A font could not be loaded.');
   const bytes=new Uint8Array(await r.arrayBuffer());
   let binary='';
   for(const byte of bytes)binary+=String.fromCharCode(byte);
   fontCss=fontCss.replace(match[0],`url('data:font/woff2;base64,${btoa(binary)}')`);
  }
  const stylesheet=await fetch('style.css');
  if(!stylesheet.ok)throw Error('Timetable styles could not be loaded.');
  style.textContent=fontCss+await stylesheet.text();
  clone.prepend(style);
  const view=svg.viewBox.baseVal;
  clone.insertBefore(el('rect',{x:view.x,y:view.y,width:view.width,height:view.height,fill:PAPER}),style.nextSibling);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
  const a=document.createElement('a');
  a.href=url;
  a.download='airline-atlas-weekly.svg';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  message('');
 }catch(error){
  message(`Export failed: ${error.message}`);
 }finally{
  $('export').disabled=false;
 }
};

if(innerWidth>1100&&!matchMedia('(pointer: coarse)').matches)document.querySelector('.controls').open=false;
Promise.all([
 document.fonts.load('600 26px Oswald'),
 document.fonts.load('400 12px "Roboto Condensed"'),
 document.fonts.load('700 14px "Roboto Condensed"')
]).catch(()=>{}).finally(refresh);

