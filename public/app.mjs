import {layoutFlights,placeFlightLabels,endpointLabels,aircraftNotation} from './layout.mjs';
import {validateSchedule,filterFlights,layoutAirports,clockTime,flightNumber,weeklyServices,connectionFlights} from './schedule.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const INK={jet:'#09618c',prop:'#454940',codeshare:'#b36200'},PAPER='#f8f7ef';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
let panX=0,panY=0,hasFit=false,mapWidth=1200,mapHeight=900;
let data,visible=[],selected=null,hovered=null,scale=0.8,imported=false,busy=false,layoutKey='',geometry,needsFit=false;
const waitText=c=>`${Math.floor(c.wait/60)} h ${String(c.wait%60).padStart(2,'0')} min${c.overnight?' · seuraavana päivänä / next day':''}`;
const measureContext=document.createElement('canvas').getContext('2d');
const LABEL_FONT='700 11px "Roboto Condensed"';
function measure(text,font=LABEL_FONT){measureContext.font=font;return measureContext.measureText(text).width;}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const upper=s=>String(s??'').toUpperCase();
const dot=t=>t.replace(':','.');
const inkOf=f=>f.codeshare?'codeshare':/ATR|Dash|DHC|Q400/i.test(f.aircraft||'')?'prop':'jet';
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
function message(text){$('message').hidden=!text;$('message').textContent=text;}

function setData(next){
 validateSchedule(next);
 data=next;
 $('title').textContent=next.title||'Airline timetable';
 document.querySelector('.edition').textContent=next.subtitle||'Flight services';
 $('source').textContent=(next.demo?'Example · ':'')+(next.source||'Imported schedule');
 $('updated').textContent=imported?'Local file · weekly services':'Weekly services · Reload picks up a changed schedule';
 const allFlights=[...data.flights,...(data.codeshareFlights||[])];
 const aircraft=$('aircraft').value;
 $('aircraft').replaceChildren(new Option('All aircraft',''),...[...new Set(allFlights.map(f=>f.aircraft).filter(Boolean))].sort().map(a=>new Option(a,a)));
 if([...$('aircraft').options].some(o=>o.value===aircraft))$('aircraft').value=aircraft;
 render();
}

// Masthead above the framed sheet: wordmark left, letter-spaced edition line and metadata to its right.
function sheetHeader(x,y,k,points){
 const g=el('g',{class:'sheet-header',transform:`translate(${x} ${y}) scale(${k})`});
 const title=upper(data.title||'Airline timetable');
 const titleWidth=measure(title,'600 64px Oswald')+3*title.length;
 const meta=[data.demo?'Havainnollistava esimerkki / Illustrative example':'','Viikkoaikataulu / Veckotidtabell / Weekly timetable',data.source||'',`${points.length} lentoasemaa / airports`,`${visible.length} viikoittaista vuoroa / weekly services`,'Kaikki ajat paikallisaikoja / All times local'].filter(Boolean).join('  ·  ');
 g.append(
  el('text',{x:0,y:64,class:'sheet-brand'},title),
  el('text',{x:titleWidth+44,y:62,class:'sheet-edition'},upper(data.subtitle||'Flight services')),
  el('text',{x:titleWidth+44,y:90,class:'sheet-meta'},meta)
 );
 return g;
}

// Explanations box at the foot of the sheet, three columns like the 1974 reference.
function sheetLegend(x,y,k,width){
 const W=width/k,H=252;
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
 const sample=(y,cls,dash)=>{marks.append(el('path',{d:`M 0 ${y} L 72 ${y}`,class:`legend-sample ${cls}`,'stroke-dasharray':dash,'marker-end':`url(#${cls})`}));};
 sample(18,'jet','none');item(marks,86,22,'Finnair, suihkukone / jet — sininen viiva');
 sample(38,'prop','7 3');item(marks,86,42,'Potkuriturbiini / turboprop — musta katkoviiva');
 sample(58,'codeshare','8 3');item(marks,86,62,'Yhteistyölento / partner codeshare — keltainen katkoviiva');
 item(marks,0,86,'13.35 = lähtö- tai tuloaika lentoaseman reunassa / departure or arrival time at the airport edge');
 item(marks,0,106,'AY 431 # A321 = lennon numero · päivät · kalusto / flight number · days · aircraft');
 item(marks,0,126,'Nuolenkärki = saapuminen / arrival · Katkos viivassa = ylittävä reitti / gap = route passing over');
 item(marks,0,146,'Reunan pituus = vuorojen määrä / edge length = number of services');
 g.append(
  el('line',{x1:0,y1:H-30,x2:W,y2:H-30,class:'legend-rule'}),
  el('text',{x:20,y:H-11,class:'legend-item'},'Aikataulut ja konetyypit voidaan muuttaa ilmoittamatta · Tidtabeller och flygplanstyper kan ändras utan föregående meddelande · Schedules and aircraft types may change without notice'),
  el('text',{x:W-20,y:H-11,'text-anchor':'end',class:'legend-item'},data.demo?'Havainnollistava aineisto, ei matkasuunnitteluun / Illustrative data, not for travel planning':(data.source||''))
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
 visible=filterFlights([...own,...partner],{query:$('query').value,aircraft:$('aircraft').value,codeshares:showCodeshare}).sort((a,b)=>(a.codeshare?1:0)-(b.codeshare?1:0)||clockTime(a.departure).localeCompare(clockTime(b.departure))||a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.id.localeCompare(b.id));
 if(!visible.some(f=>f.id===selected))selected=null;
 if(!visible.length){
  $('diagram').replaceChildren();$('diagram').hidden=true;$('empty').hidden=false;
  $('count').textContent='0 flights';$('flights').innerHTML='';$('layout-note').textContent='';detail();return;
 }

 const key=JSON.stringify([activeAirports,visible]);
 if(key!==layoutKey){
  const codes=new Set(visible.flatMap(f=>[f.from,f.to]));
  const points=layoutAirports(activeAirports.filter(a=>codes.has(a.code)),visible);
  const routes=layoutFlights(points,visible);
  const labels=placeFlightLabels(routes,points,text=>measure(text)+0.3*text.length);
  geometry={points,routes,labels};
  needsFit=!!layoutKey;
  layoutKey=key;
 }
 const {points,routes,labels}=geometry;
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
 svg.append(defs);
 svg.append(el('rect',{x:frameX,y:frameY,width:frameW,height:frameH,class:'sheet-frame'}));
 svg.append(sheetHeader(frameX,frameY-headH,kh,points));

 // Flight routes: transparent hit area, paper under-stroke for crossing breaks, then the ink.
 const routesG=el('g',{class:'routes'});
 for(const route of routes){
  const f=route.flight,ink=inkOf(f);
  const g=el('g',{class:`flight ${ink}${selected===f.id?' selected':''}`,tabindex:0,role:'button','aria-label':`${f.number||f.id}: ${f.from} to ${f.to}, ${clockTime(f.departure)} to ${clockTime(f.arrival)}`});
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
   if(a.innerPolygonPoints)g.append(el('polygon',{points:a.innerPolygonPoints,class:'hub-inner'}));
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
   if(isCS){
    g.append(
     el('text',{x:0,y:-16,'text-anchor':'middle',class:'city-name'},upper(a.name)),
     el('text',{x:0,y:4,'text-anchor':'middle',class:'city-alt'},upper(a.alt||a.code)),
     el('text',{x:0,y:22,'text-anchor':'middle',class:'city-cs-badge'},`VIA ${a.hub||'HUB'} · ${upper(a.partner||'partner')}`)
    );
   }else{
    g.append(
     el('text',{x:0,y:-7,'text-anchor':'middle',class:'city-name'},upper(a.name)),
     el('text',{x:0,y:15,'text-anchor':'middle',class:'city-alt'},a.alt?upper(a.alt):a.code)
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
  const g=el('g',{class:`edge-times ${inkOf(f)}${selected===f.id?' selected':''}`});
  g.dataset.id=f.id;
  for(const label of endpointLabels(route,points))g.append(el('text',{x:label.x,y:label.y,'text-anchor':label.anchor||'middle','dominant-baseline':'central',transform:`rotate(${label.angle} ${label.x} ${label.y})`},label.text));
  timesG.append(g);
 }
 svg.append(timesG);

 // Flight number · days · aircraft, set inline on the route in its own ink
 const labelsG=el('g',{class:'labels'});
 for(const route of routes){
  const f=route.flight,label=labels.get(f.id);
  if(!label)continue;
  const g=el('g',{class:`label-plate ${inkOf(f)}${label.hidden?' crowded-label':''}${selected===f.id?' selected':''}`,transform:`rotate(${label.angle*180/Math.PI} ${label.x} ${label.y})`});
  g.dataset.id=f.id;
  g.append(
   el('rect',{x:label.x-label.width/2,y:label.y-8,width:label.width,height:16,class:'label-bg'}),
   el('text',{x:label.x,y:label.y,'dominant-baseline':'central','text-anchor':'middle',class:'flight-label'},label.text)
  );
  labelsG.append(g);
 }
 svg.append(labelsG);
 svg.append(sheetLegend(frameX+gap,legendY,k,frameW-2*gap));

 const activate=target=>{if(target?.dataset.id)select(target.dataset.id);else if(target?.dataset.code)filterToAirport(target.dataset.code);};
 svg.addEventListener('click',e=>activate(e.target.closest('.flight,.airport')));
 svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const target=e.target.closest('.flight,.airport');if(target){e.preventDefault();activate(target);}}});
 svg.addEventListener('pointerover',e=>{const target=e.target.closest('.flight');if(target)hover(target.dataset.id);});
 svg.addEventListener('pointerout',e=>{const target=e.target.closest('.flight');if(target&&!target.contains(e.relatedTarget))hover(null);});
 svg.addEventListener('focusin',e=>{const target=e.target.closest('.flight');if(target){hover(target.dataset.id);reveal(target.dataset.id,{onlyIfHidden:true});}});
 svg.addEventListener('focusout',e=>hover(null));

 const hiddenLabels=[...labels.values()].filter(l=>l.hidden).length;
 $('layout-note').textContent=`Airport boxes sized by service volume${hiddenLabels?` · ${hiddenLabels} crowded labels appear on hover or selection`:''}`;
 mapWidth=width;mapHeight=height;
 hovered=null;
 $('diagram').replaceChildren(svg);
 $('diagram').classList.toggle('has-selection',!!selected);
 if(!hasFit){if(innerWidth<=700)focusHub();else fit();hasFit=true;}
 else if(needsFit){fit();}
 needsFit=false;
 applyView();
 $('diagram').hidden=false;
 $('empty').hidden=true;
 $('count').textContent=`${points.length} airports · ${visible.length} flights`;
 $('scale').textContent=`${Math.round(scale*100)}%`;
 $('flights').innerHTML=visible.map(f=>`<button class="service ${inkOf(f)}${selected===f.id?' selected':''}" data-id="${escape(f.id)}"><strong>${escape(f.from)} — ${escape(f.to)} <b>${dot(clockTime(f.departure))}</b></strong><span>${escape(flightNumber(f))} · ${escape(f.days||f.frequency||'#')} · ${escape(aircraftNotation(f.aircraft||''))||'—'} · ${escape(f.operator||f.airline||'Airline unspecified')}</span></button>`).join('');
 detail();
}

$('flights').addEventListener('click',e=>{const btn=e.target.closest('.service');if(btn?.dataset.id)select(btn.dataset.id,{reveal:true});});

function filterToAirport(code){
 $('query').value=$('query').value.trim().toUpperCase()===code?'':code;
 render();
}

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

function select(id,{reveal:show=false}={}){
 document.querySelector('.services').open=true;
 const prev=selected;
 selected=selected===id?null:id;
 toggleAll(prev,'selected',false);
 $('diagram').classList.toggle('has-selection',!!selected);
 detail();
 if(selected){
  toggleAll(selected,'selected',true);
  document.querySelector(`.service[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({block:'nearest'});
  if(show)reveal(selected);
 }
}

function detail(){
 const f=visible.find(f=>f.id===selected);
 $('clear').hidden=!f;
 if(!f){$('detail').innerHTML='<p>Select an arrow on the sheet or a service below to see its timetable details.</p>';return;}
 const name=code=>geometry?.points.find(a=>a.code===code)?.name||code;
 const minutes=Math.round((Date.parse(f.arrival)-Date.parse(f.departure))/60000);
 const zone=t=>t.endsWith('Z')?'UTC':`UTC${t.slice(-6)}`;
 $('detail').innerHTML=`<div class="route ${inkOf(f)}">${escape(f.from)} → ${escape(f.to)}</div><p>${escape(name(f.from))} → ${escape(name(f.to))}</p>${f.codeshare?`<div class="codeshare-badge">Partner codeshare · operated by ${escape(f.operator||'partner')}${f.operatorFlight?` as ${escape(f.operatorFlight)}`:''}</div>`:''}<dl><dt>Flight</dt><dd>${escape(flightNumber(f))}</dd><dt>Airline</dt><dd>${escape(f.operator||f.airline||'Unspecified')}</dd><dt>Days</dt><dd>${escape(f.days||f.frequency||'Daily (#)')}</dd><dt>Departure</dt><dd>${dot(clockTime(f.departure))} <small>${escape(zone(f.departure))}</small></dd><dt>Arrival</dt><dd>${dot(clockTime(f.arrival))}${f.arrival.slice(0,10)>f.departure.slice(0,10)?' <small>+1</small>':''} <small>${escape(zone(f.arrival))}</small></dd><dt>Duration</dt><dd>${Math.floor(minutes/60)} h ${minutes%60} min</dd><dt>Aircraft</dt><dd>${escape(f.aircraft||'Unspecified')}</dd><dt>Status</dt><dd>${escape(f.status||'Scheduled')}</dd>${f.connection?`<dt>Connection</dt><dd>${f.connection.direction==='out'?`from ${escape(flightNumber({number:f.connection.number}))}, arrives ${dot(f.connection.time)}`:`to ${escape(flightNumber({number:f.connection.number}))}, departs ${dot(f.connection.time)}`}<br><small>${escape(waitText(f.connection))} at ${escape(f.connection.via)}</small></dd>`:f.via?`<dt>Connection</dt><dd>via ${escape(f.via)}</dd>`:''}</dl>`;
}

async function refresh(){
 if(busy)return;
 busy=true;
 $('refresh').disabled=true;
 try{
  const response=await fetch('/api/schedule',{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Feed unavailable. Last successful schedule is still displayed.');
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
$('clear').onclick=()=>select(selected);

let animFrame=null,lastScaleText='';
function applyView(){
 $('diagram').style.transform=`translate3d(${panX}px,${panY}px,0) scale(${scale})`;
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

$('plus').onclick=()=>zoomAt(scale*1.25);
$('minus').onclick=()=>zoomAt(scale/1.25);
$('fit').onclick=fit;
$('actual').onclick=()=>zoomAt(1);

const viewport=$('viewport'),pointers=new Map();
let dragged=false;

viewport.addEventListener('dblclick',e=>{e.preventDefault();zoomAt(scale*1.6,e.clientX,e.clientY);});
viewport.addEventListener('wheel',e=>{
 e.preventDefault();
 const isPinch=e.ctrlKey;
 const isDiscreteWheel=e.deltaMode!==0||(e.wheelDelta&&Math.abs(e.wheelDelta)%120===0&&e.deltaX===0);
 if(isPinch||e.metaKey||isDiscreteWheel){
  const factor=isPinch?Math.exp(-e.deltaY*0.01):Math.exp(-e.deltaY*0.002);
  zoomAt(scale*factor,e.clientX,e.clientY);
 }else if(e.shiftKey){
  panX-=(e.deltaY||e.deltaX);
  scheduleApplyView();
 }else{
  panX-=e.deltaX;
  panY-=e.deltaY;
  scheduleApplyView();
 }
},{passive:false});

viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragged=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});});
viewport.addEventListener('pointermove',e=>{
 const old=pointers.get(e.pointerId);
 if(!old)return;
 const next={x:e.clientX,y:e.clientY};
 if(Math.hypot(next.x-old.x,next.y-old.y)>2||dragged){
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
 else if(e.key==='+'||e.key==='=')zoomAt(scale*1.25);
 else if(e.key==='-')zoomAt(scale/1.25);
 else if(e.key==='0')fit();
 else if(e.key==='Escape'&&selected)select(selected);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected&&!e.target.closest('input,select'))select(selected);});

$('refresh').onclick=()=>{imported=false;refresh();};
$('import').onclick=()=>$('file').click();
$('file').onchange=async e=>{
 try{
  const file=e.target.files[0];
  if(!file)return;
  if(file.size>5000000)throw Error('Use a JSON file smaller than 5 MB.');
  const next=validateSchedule(JSON.parse(await file.text()));
  imported=true;
  setData({...next,demo:false});
  message('');
 }catch(error){
  message(`Import failed: ${error.message}`);
 }finally{
  e.target.value='';
 }
};

$('export').onclick=async()=>{
 const svg=$('diagram').querySelector('svg');
 if(!svg||!visible.length){message('No flights to export.');return;}
 $('export').disabled=true;
 try{
  const clone=svg.cloneNode(true),style=el('style');
  for(const plate of clone.querySelectorAll('.crowded-label'))plate.classList.remove('crowded-label');
  for(const node of clone.querySelectorAll('.hover'))node.classList.remove('hover');
  const response=await fetch('/fonts.css');
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
  const stylesheet=await fetch('/style.css');
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

if(innerWidth<=700)document.querySelector('.controls').open=false;
Promise.all([
 document.fonts.load('600 26px Oswald'),
 document.fonts.load('400 12px "Roboto Condensed"'),
 document.fonts.load('700 14px "Roboto Condensed"')
]).catch(()=>{}).finally(refresh);

