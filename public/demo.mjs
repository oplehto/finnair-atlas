const airports=[['HEL','Helsinki',60.32,24.96],['TKU','Turku',60.51,22.26],['VAA','Vaasa',63.05,21.76],['OUL','Oulu',64.93,25.35],['RVN','Rovaniemi',66.56,25.83],['KTT','Kittilä',67.70,24.85],['IVL','Ivalo',68.61,27.41],['KAJ','Kajaani',64.29,27.69],['KUO','Kuopio',63.01,27.80],['JOE','Joensuu',62.66,29.61],['JYV','Jyväskylä',62.40,25.68],['MHQ','Mariehamn',60.12,19.90]].map(([code,name,lat,lon])=>({code,name,lat,lon}));
const flights=[];
for(const [i,a] of airports.slice(1).entries())for(let n=0;n<(a.code==='OUL'?4:2);n++){
 const hour=6+n*5+i%3,minute=(i*7+n*5)%60,duration=45+Math.round((a.lat-60)*7);
 const dep=new Date(Date.UTC(2026,8,10,hour-3,minute)),arr=new Date(+dep+duration*60000);
 const stamp=d=>new Date(+d+3*3600000).toISOString().slice(0,19)+'+03:00';
 const number=`AY${300+i*20+n*2}`;
 flights.push({id:number,number,from:'HEL',to:a.code,departure:stamp(dep),arrival:stamp(arr),aircraft:i%3===0?'ATR 72':i%3===1?'Embraer 190':'Airbus A320',airline:'Finnair',status:'Scheduled'});
 const back=new Date(+arr+35*60000);
 flights.push({id:`AY${301+i*20+n*2}`,number:`AY${301+i*20+n*2}`,from:a.code,to:'HEL',departure:stamp(back),arrival:stamp(new Date(+back+duration*60000)),aircraft:flights.at(-1).aircraft,airline:'Finnair',status:'Scheduled'});
}
// Representative international routes; all service times and numbers below are illustrative.
// Route reference: Finavia summer/autumn 2026 listing (verified there on 1 April 2026).
const international=[
 ['ARN','Stockholm',59.65,17.92,2,60],['OSL','Oslo',60.19,11.10,2,90],
 ['CPH','Copenhagen',55.62,12.66,2,100],['TLL','Tallinn',59.41,24.83,3,35],
 ['RIX','Riga',56.92,23.97,3,65],['VNO','Vilnius',54.63,25.29,3,100],
 ['KEF','Reykjavík',63.99,-22.61,0,220],['DUB','Dublin',53.42,-6.27,1,200],
 ['LHR','London',51.47,-.45,1,190],['MAN','Manchester',53.35,-2.27,1,185],
 ['AMS','Amsterdam',52.31,4.76,2,155],['BRU','Brussels',50.90,4.48,2,160],
 ['CDG','Paris',49.01,2.55,2,185],['BER','Berlin',52.36,13.50,2,125],
 ['FRA','Frankfurt',50.04,8.56,2,155],['MUC','Munich',48.35,11.79,2,160],
 ['WAW','Warsaw',52.17,20.97,2,110],['PRG','Prague',50.10,14.26,2,135],
 ['VIE','Vienna',48.11,16.57,2,145],['ZRH','Zürich',47.46,8.55,2,175],
 ['MXP','Milan',45.63,8.72,2,185],['FCO','Rome',41.80,12.25,2,205],
 ['MAD','Madrid',40.47,-3.57,2,265],['BCN','Barcelona',41.30,2.08,2,240],
 ['LIS','Lisbon',38.77,-9.13,1,295],['BUD','Budapest',47.43,19.26,2,150],
 ['JFK','New York',40.64,-73.78,-4,520],['ORD','Chicago',41.97,-87.91,-5,565],
 ['DFW','Dallas',32.90,-97.04,-5,640],['LAX','Los Angeles',33.94,-118.41,-7,680],
 ['SEA','Seattle',47.45,-122.31,-7,590],['YYZ','Toronto',43.68,-79.63,-4,525],
 ['DEL','Delhi',28.56,77.10,5.5,500],['BKK','Bangkok',13.69,100.75,7,690],
 ['SIN','Singapore',1.36,103.99,8,795],['HKG','Hong Kong',22.31,113.92,8,735],
 ['PVG','Shanghai',31.14,121.81,8,750],['ICN','Seoul',37.46,126.44,9,755],
 ['KIX','Osaka',34.43,135.24,9,775],['HND','Tokyo',35.55,139.78,9,810]
];
function localStamp(utc,offset){const sign=offset<0?'-':'+';const minutes=Math.round(Math.abs(offset)*60);return new Date(utc+offset*3600000).toISOString().slice(0,19)+sign+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
for(const [i,[code,name,lat,lon,zone,duration]]of international.entries()){
 airports.push({code,name,lat,lon});
 const aircraft=duration>400?'Airbus A350':'Airbus A320';
 const outbound=Date.UTC(2026,8,10,6+i%8,(i*7)%60),inbound=Date.UTC(2026,8,10,12)-zone*3600000;
 for(const [from,to,dep,fromZone,toZone,suffix]of [['HEL',code,outbound,3,zone,0],[code,'HEL',inbound,zone,3,1]]){
  const number=`AY${1000+i*2+suffix}`;flights.push({id:number,number,from,to,departure:localStamp(dep,fromZone),arrival:localStamp(dep+duration*60000,toZone),aircraft,airline:'Finnair',status:'Scheduled'});
 }
}
export default {title:'Finnair, by air',subtitle:'Domestic & international services',source:'Illustrative schedule · not for travel',demo:true,airports,flights};
