import {layoutFlights,placeFlightLabels,endpointLabels} from './layout.mjs';
import {validateSchedule,filterFlights,layoutAirports,clockTime} from './schedule.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let panX=0,panY=0,hasFit=false,mapWidth=1200,mapHeight=900;
let data,visible=[],selected=null,scale=.8,imported=false,busy=false,layoutKey='',geometry;
const measureContext=document.createElement('canvas').getContext('2d');measureContext.font='12px "Roboto Condensed"';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;}
function message(text){$('message').hidden=!text;$('message').textContent=text;}
function setData(next){validateSchedule(next);data=next;$('title').textContent=next.title||'Airline timetable';document.querySelector('.edition').textContent=next.subtitle||'Flight services';$('source').textContent=(next.demo?'Example · ':'')+(next.source||'Imported schedule');$('updated').textContent=imported?'Local file · automatic refresh paused':`Loaded ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}${next.demo?'':' · checks every minute'}`;
 const previous=$('date').value,dates=[...new Set(data.flights.map(f=>f.departure.slice(0,10)))].sort();$('date').replaceChildren(...dates.map(d=>new Option(d,d)));if(dates.includes(previous))$('date').value=previous;
 const aircraft=$('aircraft').value;$('aircraft').replaceChildren(new Option('All aircraft',''),...[...new Set(data.flights.map(f=>f.aircraft).filter(Boolean))].sort().map(a=>new Option(a,a)));if([...$('aircraft').options].some(o=>o.value===aircraft))$('aircraft').value=aircraft;render();}
function render(){if(!data)return;visible=filterFlights(data.flights,{date:$('date').value,query:$('query').value,aircraft:$('aircraft').value}).sort((a,b)=>Date.parse(a.departure)-Date.parse(b.departure));if(!visible.some(f=>f.id===selected))selected=null;
 const key=JSON.stringify([data.airports,visible]);
 if(key!==layoutKey){
  const codes=new Set(visible.flatMap(f=>[f.from,f.to])),points=layoutAirports(data.airports.filter(a=>codes.has(a.code)),visible);
  const routes=layoutFlights(points,visible),labels=placeFlightLabels(routes,points,text=>measureContext.measureText(text).width);
  geometry={points,routes,labels};layoutKey=key;
 }
 const {points,routes,labels}=geometry;
 const coords=routes.flatMap(r=>r.points||[r.start,r.end]);
 const left=Math.min(0,...coords.map(p=>p.x-80)),top=Math.min(0,...coords.map(p=>p.y-80));
 const width=Math.max(1200,...points.map(p=>p.x+p.width/2+80),...coords.map(p=>p.x+80))-left;
 const height=Math.max(900,...points.map(p=>p.y+p.height/2+100),...coords.map(p=>p.y+80))-top;
 const svg=el('svg',{xmlns:NS,viewBox:`${left} ${top} ${width} ${height}`,width,height,role:'group','aria-label':'Airline schedule diagram. Each arrow is one flight; larger airport boxes indicate more services.'});
 const defs=el('defs');for(const[color,id]of [['#09618c','jet'],['#454940','prop']]){const marker=el('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(el('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker);}svg.append(defs);
 svg.append(el('text',{x:65,y:55,fill:'#09618c','font-size':26,'font-family':'Oswald','font-weight':600},(data.subtitle||'Flight services').toUpperCase()));
 svg.append(el('text',{x:65,y:82,fill:'#454940','font-size':14,'font-family':'Roboto Condensed'},`${$('date').value || 'No services'} — ${data.demo?'Illustrative Finnair services':data.source||'Imported schedule'} — schematic, not to scale`));
 for(const route of routes){
  const f=route.flight,prop=/ATR|Dash|DHC/i.test(f.aircraft||'');
  const g=el('g',{class:`flight${selected===f.id?' selected':selected?' dim':''}`,tabindex:0,role:'button','aria-label':`${f.number||f.id}: ${f.from} to ${f.to}, ${clockTime(f.departure)} to ${clockTime(f.arrival)}`});g.dataset.id=f.id;
  g.append(el('path',{d:route.path,class:'hit'}),el('path',{d:route.path,class:'crossing-gap'}),el('path',{d:route.path,fill:'none',class:'ink',stroke:prop?'#454940':'#09618c','stroke-dasharray':prop?'7 3':'none','marker-end':`url(#${prop?'prop':'jet'})`}));
  const label=labels.get(f.id);
  if(label)g.append(el('text',{x:label.x,y:label.y,'dominant-baseline':'central','text-anchor':'middle',class:label.hidden?'crowded-label':'',transform:`rotate(${label.angle*180/Math.PI} ${label.x} ${label.y})`},label.text));
  g.addEventListener('click',()=>select(f.id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f.id);}});svg.append(g);
 }
 for(const a of points){
  const g=el('g',{class:`airport${a.importance>.2?' hub':''}`,transform:`translate(${a.x} ${a.y})`,'aria-label':`${a.name}: ${a.services} services`});
  const codeSize=Math.round(Math.min(28+15*a.importance,(a.width-24)/(a.name.length*.55))),nameSize=Math.round(13+3*a.importance);
  g.append(el('rect',{x:-a.width/2,y:-a.height/2,width:a.width,height:a.height}),
   el('text',{x:0,y:-a.height*.13,'text-anchor':'middle',class:'code',style:`font-size:${codeSize}px`},a.name.toUpperCase()),
   el('text',{x:0,y:a.height*.13,'text-anchor':'middle',class:'name',style:`font-size:${nameSize}px`},a.code),
   el('text',{x:0,y:a.height*.34,'text-anchor':'middle',class:'total'},`${a.services} services`));svg.append(g);
 }
 // Draw edge times above airport fills, retaining the lane's ink colour.
 for(const route of routes){const prop=/ATR|Dash|DHC/i.test(route.flight.aircraft||'');
  const g=el('g',{class:`edge-times${selected===route.flight.id?' selected':selected?' dim':''}`});g.dataset.id=route.flight.id;
  for(const label of endpointLabels(route,points))g.append(el('text',{x:label.x,y:label.y,'text-anchor':'middle','dominant-baseline':'central',fill:prop?'#454940':'#09618c',transform:`rotate(${label.angle} ${label.x} ${label.y})`},label.text));svg.append(g);
 }
 const hiddenLabels=[...labels.values()].filter(l=>l.hidden).length;
 $('layout-note').textContent=`Airport size follows flight volume${hiddenLabels?` · ${hiddenLabels} crowded labels appear on selection`:''}`;
 mapWidth=width;mapHeight=height;$('diagram').replaceChildren(svg);if(!hasFit&&visible.length){fit();hasFit=true;}applyView();$('diagram').hidden=!visible.length;$('empty').hidden=!!visible.length;$('count').textContent=`${points.length} airports / ${visible.length} flights`;$('scale').textContent=`${Math.round(scale*100)}%`;
 $('flights').innerHTML=visible.map(f=>`<button class="service${selected===f.id?' selected':''}" data-id="${escape(f.id)}"><strong>${escape(f.from)} — ${escape(f.to)} <b>${clockTime(f.departure)}</b></strong><span>${escape(f.number||f.id)} · ${escape(f.aircraft||'Aircraft unspecified')}</span></button>`).join('');for(const button of $('flights').children)button.onclick=()=>select(button.dataset.id);detail();}
function select(id){document.querySelector('.services').open=true;selected=selected===id?null:id;for(const node of document.querySelectorAll('.flight,.service,.edge-times')){node.classList.toggle('selected',node.dataset.id===selected);node.classList.toggle('dim',!!selected&&(node.classList.contains('flight')||node.classList.contains('edge-times'))&&node.dataset.id!==selected);}detail();}
function detail(){const f=visible.find(f=>f.id===selected);$('clear').hidden=!f;if(!f){$('detail').innerHTML='<p>Select a flight line or a service below to open its timetable.</p>';return;}
 const name=code=>data.airports.find(a=>a.code===code)?.name||code,minutes=Math.round((Date.parse(f.arrival)-Date.parse(f.departure))/60000);
 $('detail').innerHTML=`<div class="route">${escape(f.from)} → ${escape(f.to)}</div><p>${escape(name(f.from))} to ${escape(name(f.to))}</p><dl><dt>Flight</dt><dd>${escape(f.number||f.id)}</dd><dt>Airline</dt><dd>${escape(f.airline||'Unspecified')}</dd><dt>Departure</dt><dd>${clockTime(f.departure)} (${escape(f.departure.endsWith('Z')?'UTC':f.departure.slice(-6))})<br>${f.departure.slice(0,10)}</dd><dt>Arrival</dt><dd>${clockTime(f.arrival)} (${escape(f.arrival.endsWith('Z')?'UTC':f.arrival.slice(-6))})<br>${f.arrival.slice(0,10)}</dd><dt>Duration</dt><dd>${Math.floor(minutes/60)}h ${minutes%60}m</dd><dt>Aircraft</dt><dd>${escape(f.aircraft||'Unspecified')}</dd><dt>Status</dt><dd>${escape(f.status||'Scheduled')}</dd></dl>`;}
async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;try{const response=await fetch('/api/schedule',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Feed unavailable. Last successful schedule is still displayed.');const next=await response.json();if(imported)return;setData(next);message('');}catch(e){message(e.message);}finally{busy=false;$('refresh').disabled=false;}}
$('date').onchange=render;$('aircraft').onchange=render;$('query').oninput=render;$('clear').onclick=()=>select(selected);
function applyView(){ $('diagram').style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;$('scale').textContent=`${Math.round(scale*100)}%`; }
function zoomAt(next,x=innerWidth/2,y=innerHeight/2){next=Math.max(.12,Math.min(4,next));panX=x-(x-panX)*next/scale;panY=y-(y-panY)*next/scale;scale=next;applyView();}
function fit(){const left=innerWidth>700?315:20,right=innerWidth>700?35:20;scale=Math.min((innerWidth-left-right)/mapWidth,(innerHeight-100)/mapHeight);panX=left+(innerWidth-left-right-mapWidth*scale)/2;panY=45+(innerHeight-100-mapHeight*scale)/2;applyView();}
$('plus').onclick=()=>zoomAt(scale*1.2);$('minus').onclick=()=>zoomAt(scale/1.2);$('fit').onclick=fit;$('actual').onclick=()=>zoomAt(1);
const viewport=$('viewport'),pointers=new Map();let dragged=false;
viewport.addEventListener('dblclick',e=>{e.preventDefault();zoomAt(scale*1.5,e.clientX,e.clientY);});
viewport.addEventListener('wheel',e=>{e.preventDefault();zoomAt(scale*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragged=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});});
viewport.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const next={x:e.clientX,y:e.clientY};if(Math.hypot(next.x-old.x,next.y-old.y)>2||dragged){dragged=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');if(pointers.size===2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);zoomAt(scale*after/(before||1),(old.x+other.x)/2,(old.y+other.y)/2);panX+=(next.x-old.x)/2;panY+=(next.y-old.y)/2;}else{panX+=next.x-old.x;panY+=next.y-old.y;}applyView();pointers.set(e.pointerId,next);}});
for(const event of ['pointerup','pointercancel'])viewport.addEventListener(event,e=>{pointers.delete(e.pointerId);if(!pointers.size)viewport.classList.remove('dragging');});
viewport.addEventListener('click',e=>{if(dragged){e.stopPropagation();e.preventDefault();}},{capture:true});
viewport.addEventListener('keydown',e=>{const delta={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]}[e.key];if(delta){e.preventDefault();panX+=delta[0];panY+=delta[1];applyView();}else if(e.key==='+'||e.key==='=')zoomAt(scale*1.2);else if(e.key==='-')zoomAt(scale/1.2);else if(e.key==='0')fit();});
$('refresh').onclick=()=>{imported=false;refresh();};$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('Use a JSON file smaller than 5 MB.');const next=validateSchedule(JSON.parse(await file.text()));imported=true;setData({...next,demo:false});message('');}catch(error){message(`Import failed: ${error.message}`);}finally{e.target.value='';}};
$('export').onclick=async()=>{
 const svg=$('diagram').querySelector('svg');if(!svg||!visible.length){message('No flights to export.');return;}
 $('export').disabled=true;
 try{
  const clone=svg.cloneNode(true),style=el('style');
  const response=await fetch('/fonts.css');if(!response.ok)throw Error('Font stylesheet could not be loaded.');let fontCss=await response.text();
  for(const match of [...fontCss.matchAll(/url\('([^']+)'\)/g)]){
   const response=await fetch(match[1]);if(!response.ok)throw Error('A font could not be loaded.');
   const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
   fontCss=fontCss.replace(match[0],`url('data:font/woff2;base64,${btoa(binary)}')`);
  }
  const stylesheet=await fetch('/style.css');if(!stylesheet.ok)throw Error('Timetable styles could not be loaded.');
  style.textContent=fontCss+await stylesheet.text();clone.prepend(style);
  const view=svg.viewBox.baseVal;clone.insertBefore(el('rect',{x:view.x,y:view.y,width:view.width,height:view.height,fill:'#f8f7ef'}),style.nextSibling);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
  const a=document.createElement('a');a.href=url;a.download=`airline-atlas-${$('date').value}.svg`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);message('');
 }catch(error){message(`Export failed: ${error.message}`);}finally{$('export').disabled=false;}
};
Promise.all([document.fonts.load('600 26px Oswald'),document.fonts.load('400 12px "Roboto Condensed"'),document.fonts.load('700 14px "Roboto Condensed"')]).catch(()=>{}).finally(()=>{measureContext.font='12px "Roboto Condensed"';refresh();});setInterval(()=>{if(!imported&&!document.hidden)refresh();},60000);
