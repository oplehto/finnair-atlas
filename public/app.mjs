import {layoutFlights,placeFlightLabels,endpointLabels} from './layout.mjs';
import {validateSchedule,filterFlights,layoutAirports,clockTime} from './schedule.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let panX=0,panY=0,hasFit=false,mapWidth=1200,mapHeight=900;
let data,visible=[],selected=null,scale=0.8,imported=false,busy=false,layoutKey='',geometry;
const measureContext=document.createElement('canvas').getContext('2d');measureContext.font='12px "Roboto Condensed"';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
function message(text){$('message').hidden=!text;$('message').textContent=text;}

function setData(next){
 validateSchedule(next);
 data=next;
 $('title').textContent=next.title||'Airline timetable';
 document.querySelector('.edition').textContent=next.subtitle||'Flight services';
 $('source').textContent=(next.demo?'Example · ':'')+(next.source||'Imported schedule');
 $('updated').textContent=imported?'Local file · automatic refresh paused':`Loaded ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}${next.demo?'':' · checks every minute'}`;
 const previous=$('date').value;
 const allFlights=[...data.flights,...(data.codeshareFlights||[])];
 const dates=[...new Set(allFlights.map(f=>f.departure.slice(0,10)))].sort();
 $('date').replaceChildren(...dates.map(d=>new Option(d,d)));
 if(dates.includes(previous))$('date').value=previous;
 const aircraft=$('aircraft').value;
 $('aircraft').replaceChildren(new Option('All aircraft',''),...[...new Set(allFlights.map(f=>f.aircraft).filter(Boolean))].sort().map(a=>new Option(a,a)));
 if([...$('aircraft').options].some(o=>o.value===aircraft))$('aircraft').value=aircraft;
 render();
}

function render(){
 if(!data)return;
 const showCodeshare=$('show-codeshares')?.checked??true;
 const activeAirports=[...data.airports,...(showCodeshare?(data.codeshareAirports||[]):[])];
 const activeFlights=[...data.flights,...(showCodeshare?(data.codeshareFlights||[]):[])];

 visible=filterFlights(activeFlights,{date:$('date').value,query:$('query').value,aircraft:$('aircraft').value,codeshares:showCodeshare}).sort((a,b)=>Date.parse(a.departure)-Date.parse(b.departure));
 if(!visible.some(f=>f.id===selected))selected=null;

 const key=JSON.stringify([activeAirports,visible]);
 if(key!==layoutKey){
  const codes=new Set(visible.flatMap(f=>[f.from,f.to]));
  const points=layoutAirports(activeAirports.filter(a=>codes.has(a.code)),visible);
  const routes=layoutFlights(points,visible);
  const labels=placeFlightLabels(routes,points,text=>measureContext.measureText(text).width);
  geometry={points,routes,labels};
  layoutKey=key;
 }
 const {points,routes,labels}=geometry;
 const coords=routes.flatMap(r=>r.points||[r.start,r.end]);
 const left=Math.min(0,...coords.map(p=>p.x-100),...points.map(p=>p.x-p.width/2-100));
 const top=Math.min(0,...coords.map(p=>p.y-100),...points.map(p=>p.y-p.height/2-100));
 const right=Math.max(1200,...points.map(p=>p.x+p.width/2+100),...coords.map(p=>p.x+100));
 const bottomAirports=Math.max(900,...points.map(p=>p.y+p.height/2),...coords.map(p=>p.y));
 const legendY=bottomAirports+140;
 const legendHeight=280;
 const height=legendY+legendHeight+100-top;
 const width=right-left;

 const svg=el('svg',{xmlns:NS,viewBox:`${left} ${top} ${width} ${height}`,width,height,role:'group','aria-label':'Airline schedule diagram. Each arrow is one flight; larger airport boxes indicate more services.'});
 const defs=el('defs');
 for(const[color,id]of [['#09618c','jet'],['#454940','prop'],['#b36200','codeshare']]){
  const marker=el('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});
  marker.append(el('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));
  defs.append(marker);
 }
 svg.append(defs);

 // Vintage 1974 header banner
 const headerX=left+80,headerY=Math.min(top+50,80);
 const headerG=el('g',{class:'sheet-header',transform:`translate(${headerX} ${headerY})`});
 headerG.append(
  el('text',{x:0,y:60,fill:'#08618c','font-size':64,'font-family':'Oswald','font-weight':600,'letter-spacing':'3px'},'FINNAIR'),
  el('text',{x:250,y:40,fill:'#08618c','font-size':22,'font-family':'Oswald','font-weight':600,'letter-spacing':'1px'},(data.subtitle||'ULKOMAAN JA KOTIMAAN LIIKENNE — UTRIKES- OCH INRIKESTRAFIKEN').toUpperCase()),
  el('text',{x:250,y:64,fill:'#454940','font-size':15,'font-family':'Roboto Condensed','font-weight':700},`${$('date').value || '10.9.2026'} · AIKATAULUT JA REITTIKARTTA / TIMETABLE & ROUTE NETWORK`),
  el('text',{x:250,y:84,fill:'#62777e','font-size':13,'font-family':'Roboto Condensed'},`${data.demo?'Finnairin ja kumppaneiden reitistö (oneworld & kumppanit)':'Aikataulu'} · ${points.length} lentoasemaa / airports · ${visible.length} reittilentoa / flights · Kaikki ajat paikallisaikoja / All times local`),
  el('line',{x1:0,y1:104,x2:Math.min(width-160,2800),y2:104,stroke:'#08618c','stroke-width':2}),
  el('line',{x1:0,y1:108,x2:Math.min(width-160,2800),y2:108,stroke:'#08618c','stroke-width':0.75})
 );
 svg.append(headerG);

 // Flight route lines
 for(const route of routes){
  const f=route.flight;
  const isCodeshare=!!f.codeshare;
  const prop=/ATR|Dash|DHC/i.test(f.aircraft||'');
  const inkColor=isCodeshare?'#b36200':prop?'#454940':'#09618c';
  const markerId=isCodeshare?'codeshare':prop?'prop':'jet';

  const g=el('g',{class:`flight${isCodeshare?' codeshare':''}${selected===f.id?' selected':''}`,tabindex:0,role:'button','aria-label':`${f.number||f.id}: ${f.from} to ${f.to}, ${clockTime(f.departure)} to ${clockTime(f.arrival)}`});
  g.dataset.id=f.id;
  g.append(
   el('path',{d:route.path,class:'hit'}),
   el('path',{d:route.path,fill:'none',class:'ink',stroke:inkColor,'stroke-dasharray':prop?'7 3':isCodeshare?'8 3':'none','marker-end':`url(#${markerId})`})
  );

  const label=labels.get(f.id);
  if(label){
   const deg=label.angle*180/Math.PI;
   const labelG=el('g',{class:`label-plate${label.hidden?' crowded-label':''}`,transform:`rotate(${deg} ${label.x} ${label.y})`});
   labelG.append(
    el('rect',{x:label.x-label.width/2-3,y:label.y-8.5,width:label.width+6,height:17,fill:'#f8f7ef',class:'label-bg',rx:2}),
    el('text',{x:label.x,y:label.y,'dominant-baseline':'central','text-anchor':'middle',class:'flight-label'},label.text)
   );
   g.append(labelG);
  }
  svg.append(g);
 }

 svg.addEventListener('click',e=>{
  const target=e.target.closest('.flight');
  if(target?.dataset.id)select(target.dataset.id);
 });
 svg.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
   const target=e.target.closest('.flight');
   if(target?.dataset.id){e.preventDefault();select(target.dataset.id);}
  }
 });

 // Airport rectangles & typography
 for(const a of points){
  const isHub=a.code==='HEL';
  const isCS=!!a.codeshare;
  const isGateway=!!a.isGatewayHub;
  const g=el('g',{class:`airport${isHub?' hub helsinki-hub':(a.importance>0.2||isGateway)?' hub gateway-hub':''}${isCS?' codeshare-airport':''}`,transform:`translate(${a.x} ${a.y})`,'aria-label':`${a.name}: ${a.services} services`});
  if(isHub){
   g.append(
    a.polygonPoints ? el('polygon',{points:a.polygonPoints,class:'hub-outer'}) : el('rect',{x:-a.width/2,y:-a.height/2,width:a.width,height:a.height,class:'hub-outer'}),
    a.innerPolygonPoints ? el('polygon',{points:a.innerPolygonPoints,class:'hub-inner'}) : el('rect',{x:-a.width/2+8,y:-a.height/2+8,width:a.width-16,height:a.height-16,class:'hub-inner'}),
    el('text',{x:0,y:-55,'text-anchor':'middle',class:'hub-title code'},'HELSINKI'),
    el('text',{x:0,y:35,'text-anchor':'middle',class:'hub-subtitle name'},'HELSINGFORS'),
    el('text',{x:0,y:95,'text-anchor':'middle',class:'hub-tag total'},'HEL · FINNAIR CENTRAL HUB · KESKUSLENTOASEMA')
   );
  }else if(isGateway){
   g.append(
    a.polygonPoints ? el('polygon',{points:a.polygonPoints}) : el('rect',{x:-a.width/2,y:-a.height/2,width:a.width,height:a.height}),
    el('text',{x:0,y:-20,'text-anchor':'middle',class:'hub-title code',style:'font-size:22px'},a.name.toUpperCase()),
    el('text',{x:0,y:12,'text-anchor':'middle',class:'hub-subtitle name',style:'font-size:15px'},(a.alt||a.code).toUpperCase()),
    el('text',{x:0,y:38,'text-anchor':'middle',class:'hub-tag total',style:'font-size:11px'},`${a.code} · ONEWORLD GATEWAY HUB`)
   );
  }else{
   g.append(a.polygonPoints ? el('polygon',{points:a.polygonPoints}) : el('rect',{x:-a.width/2,y:-a.height/2,width:a.width,height:a.height}));
   if(isCS){
    g.append(
     el('text',{x:0,y:-16,'text-anchor':'middle',class:'city-name code'},a.name.toUpperCase()),
     el('text',{x:0,y:4,'text-anchor':'middle',class:'city-alt name'},(a.alt||a.code).toUpperCase()),
     el('text',{x:0,y:22,'text-anchor':'middle',class:'city-cs-badge'},`VIA ${a.hub||'HUB'} · ${a.partner||'ONEWORLD'}`)
    );
   }else if(a.alt){
    g.append(
     el('text',{x:0,y:-8,'text-anchor':'middle',class:'city-name code'},a.name.toUpperCase()),
     el('text',{x:0,y:14,'text-anchor':'middle',class:'city-alt name'},a.alt.toUpperCase())
    );
   }else{
    g.append(
     el('text',{x:0,y:-8,'text-anchor':'middle',class:'city-name code'},a.name.toUpperCase()),
     el('text',{x:0,y:14,'text-anchor':'middle',class:'city-alt name'},a.code)
    );
   }
  }
  svg.append(g);
 }

 // Edge times
 for(const route of routes){
  const f=route.flight;
  const isCodeshare=!!f.codeshare;
  const prop=/ATR|Dash|DHC/i.test(f.aircraft||'');
  const inkColor=isCodeshare?'#b36200':prop?'#454940':'#09618c';

  const g=el('g',{class:`edge-times${isCodeshare?' codeshare':''}${selected===f.id?' selected':''}`});
  g.dataset.id=f.id;
  for(const label of endpointLabels(route,points)){
   g.append(el('text',{x:label.x,y:label.y,'text-anchor':'middle','dominant-baseline':'central',fill:inkColor,transform:`rotate(${label.angle} ${label.x} ${label.y})`},label.text));
  }
  svg.append(g);
 }

 // Vintage 1974 Timetable Legend Banner at bottom
 const legendWidth=Math.min(width-160,3600);
 const legendX=(left+right-legendWidth)/2;
 const legendG=el('g',{class:'sheet-legend',transform:`translate(${legendX} ${legendY})`});
 legendG.append(
  el('rect',{x:0,y:0,width:legendWidth,height:260,fill:'#fbfaf5',stroke:'#08618c','stroke-width':1.8,rx:3}),
  el('rect',{x:4,y:4,width:legendWidth-8,height:252,fill:'none',stroke:'#aaa99b','stroke-width':0.8,rx:2}),
  el('rect',{x:5,y:5,width:legendWidth-10,height:36,fill:'#f1efe3'}),
  el('text',{x:20,y:28,fill:'#08618c','font-size':17,'font-family':'Oswald','font-weight':600,'letter-spacing':'1px'},'SELITYKSET — FÖRKLARINGAR — TIMETABLE EXPLANATIONS'),
  el('line',{x1:4,y1:41,x2:legendWidth-4,y2:41,stroke:'#08618c','stroke-width':1})
 );
 const colW=(legendWidth-60)/3;
 const c1=el('g',{transform:'translate(25 60)'});
 c1.append(
  el('text',{x:0,y:0,fill:'#08618c','font-size':13,'font-family':'Roboto Condensed','font-weight':700},'LIIKENNÖINTIPÄIVÄT — TRAFIKDAGAR — DAYS OF OPERATION'),
  el('text',{x:0,y:22,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'# = Joka päivä / Dagligen / Daily'),
  el('text',{x:0,y:42,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'① = Maanantai / Måndag / Monday'),
  el('text',{x:180,y:42,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'⑤ = Perjantai / Fredag / Friday'),
  el('text',{x:0,y:62,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'② = Tiistai / Tisdag / Tuesday'),
  el('text',{x:180,y:62,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'⑥ = Lauantai / Lördag / Saturday'),
  el('text',{x:0,y:82,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'③ = Keskiviikko / Onsdag / Wednesday'),
  el('text',{x:180,y:82,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'⑦ = Sunnuntai / Söndag / Sunday'),
  el('text',{x:0,y:102,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'④ = Torstai / Torsdag / Thursday')
 );
 legendG.append(c1);

 const c2=el('g',{transform:`translate(${25+colW} 60)`});
 c2.append(
  el('text',{x:0,y:0,fill:'#08618c','font-size':13,'font-family':'Roboto Condensed','font-weight':700},'KALUSTO JA REITIT — FLYGPLANSTYP — AIRCRAFT FLEET'),
  el('text',{x:0,y:22,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'A359 = Airbus A350-900 (kaukoliikenne / long-haul)'),
  el('text',{x:0,y:42,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'A333 = Airbus A330-300 (kaukoliikenne / long-haul)'),
  el('text',{x:0,y:62,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'A321 / A320 / A319 = Airbus A320 -sarja (Eurooppa / Europe)'),
  el('text',{x:0,y:82,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'E190 = Embraer 190 (Eurooppa ja kotimaa / Regional)'),
  el('text',{x:0,y:102,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'AT76 = ATR 72-500/600 (kotimaa ja lähialueet / Domestic & Baltic)')
 );
 legendG.append(c2);

 const c3=el('g',{transform:`translate(${25+colW*2} 60)`});
 c3.append(
  el('text',{x:0,y:0,fill:'#08618c','font-size':13,'font-family':'Roboto Condensed','font-weight':700},'AIKATAULUMERKINNÄT — ANTECKNINGAR — NOTATIONS'),
  el('text',{x:0,y:22,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'13.35 = Lähtö- tai tuloaika / Departure or arrival time (local clock time)'),
  el('text',{x:0,y:42,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'— Sininen viiva: Finnair suora suihkukone (Direct jet service)'),
  el('text',{x:0,y:62,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'╌ Musta katkoviiva: Norra syöttölento (Turboprop feeder)'),
  el('text',{x:0,y:82,fill:'#b36200','font-size':12,'font-family':'Roboto Condensed','font-weight':700},'┈ Meripihkanvärinen katkoviiva: Yhteistyölento (Codeshare via oneworld & partners)'),
  el('text',{x:0,y:102,fill:'#303a34','font-size':12,'font-family':'Roboto Condensed'},'Pääsolmukohta: Helsinki (HEL) · Vaihtoyhteydet: London (LHR), Doha (DOH), Singapore (SIN), LAX')
 );
 legendG.append(c3);
 svg.append(legendG);

 const hiddenLabels=[...labels.values()].filter(l=>l.hidden).length;
 $('layout-note').textContent=`Lentoasemat mitoitettu liikennemäärän mukaan${hiddenLabels?` · ${hiddenLabels} tiivistä merkintää näkyy valitsemalla`:''}`;
 mapWidth=width;mapHeight=height;
 $('diagram').replaceChildren(svg);
 $('diagram').classList.toggle('has-selection',!!selected);
 if(!hasFit&&visible.length){fit();hasFit=true;}
 applyView();
 $('diagram').hidden=!visible.length;
 $('empty').hidden=!!visible.length;
 $('count').textContent=`${points.length} lentoasemaa / ${visible.length} lentoa`;
 $('scale').textContent=`${Math.round(scale*100)}%`;
 $('flights').innerHTML=visible.map(f=>`<button class="service${f.codeshare?' codeshare-service':''}${selected===f.id?' selected':''}" data-id="${escape(f.id)}"><strong>${escape(f.from)} — ${escape(f.to)} <b>${clockTime(f.departure)}</b></strong><span>${escape(f.number||f.id)} · ${escape(f.days||f.frequency||'#')} · ${escape(f.operator||f.airline||'Aircraft unspecified')}</span></button>`).join('');
 detail();
}

$('flights').addEventListener('click',e=>{
 const btn=e.target.closest('.service');
 if(btn?.dataset.id)select(btn.dataset.id);
});

function select(id){
 document.querySelector('.services').open=true;
 const prev=selected;
 selected=selected===id?null:id;
 if(prev){
  for(const node of document.querySelectorAll(`[data-id="${prev}"]`))node.classList.remove('selected');
 }
 $('diagram').classList.toggle('has-selection',!!selected);
 if(selected){
  for(const node of document.querySelectorAll(`[data-id="${selected}"]`)){
   node.classList.add('selected');
   if(node.classList.contains('service'))node.scrollIntoView({block:'nearest'});
  }
 }
 detail();
}

function detail(){
 const f=visible.find(f=>f.id===selected);
 $('clear').hidden=!f;
 if(!f){$('detail').innerHTML='<p>Valitse lentoreitti tai vuoro nähdäksesi aikataulutiedot.</p>';return;}
 const name=code=>data.airports.find(a=>a.code===code)?.name||(data.codeshareAirports||[]).find(a=>a.code===code)?.name||code;
 const minutes=Math.round((Date.parse(f.arrival)-Date.parse(f.departure))/60000);
 $('detail').innerHTML=`<div class="route${f.codeshare?' codeshare-route':''}">${escape(f.from)} → ${escape(f.to)}</div><p>${escape(name(f.from))} → ${escape(name(f.to))}</p>${f.codeshare?`<div class="codeshare-badge">Yhteistyölento / Codeshare · Op. by ${escape(f.operator||'Partner')} (${escape(f.operatorFlight||'')})</div>`:''}<dl><dt>Flight / Lento</dt><dd>${escape(f.number||f.id)}${f.operatorFlight?` (${escape(f.operatorFlight)})`:''}</dd><dt>Airline / Yhtiö</dt><dd>${escape(f.operator||f.airline||'Finnair')}</dd><dt>Days / Päivät</dt><dd>${escape(f.days||f.frequency||'Daily (#)')}</dd><dt>Departure / Lähtö</dt><dd>${clockTime(f.departure)} (${escape(f.departure.endsWith('Z')?'UTC':f.departure.slice(-6))})<br>${f.departure.slice(0,10)}</dd><dt>Arrival / Saapuminen</dt><dd>${clockTime(f.arrival)} (${escape(f.arrival.endsWith('Z')?'UTC':f.arrival.slice(-6))})<br>${f.arrival.slice(0,10)}</dd><dt>Duration / Kesto</dt><dd>${Math.floor(minutes/60)}h ${minutes%60}m</dd><dt>Aircraft / Kalusto</dt><dd>${escape(f.aircraft||'Unspecified')}</dd><dt>Status / Tila</dt><dd>${escape(f.status||'Scheduled')}</dd>${f.via?`<dt>Connection / Vaihto</dt><dd>Via ${escape(f.via)}</dd>`:''}</dl>`;
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

$('date').onchange=render;
$('aircraft').onchange=render;
$('query').oninput=render;
if($('show-codeshares'))$('show-codeshares').onchange=render;
$('clear').onclick=()=>select(selected);

let animFrame=null,lastScaleText='';
function applyView(){
 $('diagram').style.transform=`translate3d(${panX}px,${panY}px,0) scale(${scale})`;
 const scaleText=`${Math.round(scale*100)}%`;
 if(lastScaleText!==scaleText){
  $('scale').textContent=scaleText;
  lastScaleText=scaleText;
 }
}
function scheduleApplyView(){
 if(animFrame)return;
 animFrame=requestAnimationFrame(()=>{
  animFrame=null;
  applyView();
 });
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
 const left=innerWidth>700?315:20,right=innerWidth>700?35:20;
 scale=Math.min((innerWidth-left-right)/mapWidth,(innerHeight-100)/mapHeight);
 panX=left+(innerWidth-left-right-mapWidth*scale)/2;
 panY=45+(innerHeight-100-mapHeight*scale)/2;
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
});

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
  clone.insertBefore(el('rect',{x:view.x,y:view.y,width:view.width,height:view.height,fill:'#f8f7ef'}),style.nextSibling);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
  const a=document.createElement('a');
  a.href=url;
  a.download=`airline-atlas-${$('date').value}.svg`;
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

Promise.all([
 document.fonts.load('600 26px Oswald'),
 document.fonts.load('400 12px "Roboto Condensed"'),
 document.fonts.load('700 14px "Roboto Condensed"')
]).catch(()=>{}).finally(()=>{
 measureContext.font='12px "Roboto Condensed"';
 refresh();
});

setInterval(()=>{if(!imported&&!document.hidden)refresh();},60000);
