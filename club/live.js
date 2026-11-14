// live.js: when Claude's brief isn't for the upcoming sit, rebuild weather + stand picks
// from the free National Weather Service forecast and each stand's good/bad winds.
(function(){
const LAT=36.2,LON=-79.27,TZ='America/New_York';
const DIRS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const dd=d=>{const i=DIRS.indexOf(String(d).trim().toUpperCase());return i<0?null:i*22.5};
const angDiff=(a,b)=>{const x=Math.abs(a-b)%360;return x>180?360-x:x};
const tfmt=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:TZ});
const hlab=d=>d.toLocaleTimeString('en-US',{hour:'numeric',timeZone:TZ}).replace(' ','').toLowerCase();
const ymd=d=>d.toLocaleDateString('en-CA',{timeZone:TZ});
const add=(d,m)=>new Date(d.getTime()+m*6e4);
const r5=d=>new Date(Math.round(d.getTime()/3e5)*3e5);
const r30=d=>new Date(Math.round(d.getTime()/18e5)*18e5);
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const load=k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}};

// NOAA sunrise/sunset (zenith 90.833). ds = 'YYYY-MM-DD' local date.
function sun(ds,rise){const [y,m,d]=ds.split('-').map(Number);const N=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,0))/864e5);
  const R=Math.PI/180,lh=LON/15,t=N+((rise?6:18)-lh)/24,M=0.9856*t-3.289;
  let L=(M+1.916*Math.sin(M*R)+0.020*Math.sin(2*M*R)+282.634+720)%360;
  let RA=(Math.atan(0.91764*Math.tan(L*R))/R+720)%360;RA=(RA+Math.floor(L/90)*90-Math.floor(RA/90)*90)/15;
  const sd=0.39782*Math.sin(L*R),cd=Math.cos(Math.asin(sd));
  const cH=(Math.cos(90.833*R)-sd*Math.sin(LAT*R))/(cd*Math.cos(LAT*R));
  let H=Math.acos(cH)/R;H=(rise?360-H:H)/15;
  let UT=((H+RA-0.06571*t-6.622-lh)%24+24)%24;
  return new Date(Date.UTC(y,m-1,d)+UT*36e5+(!rise&&UT<12?864e5:0));} // summer sunset UT rolls past midnight
function moon(d){const P=29.530588853,age=(((d-Date.UTC(2000,0,6,18,14))/864e5)%P+P)%P;const ill=Math.round((1-Math.cos(2*Math.PI*age/P))/2*100);
  const nm=age<1.85?'New moon':age<7.38?'Waxing crescent':age<9.23?'First quarter':age<14.77?'Waxing gibbous':age<16.61?'Full moon':age<22.15?'Waning gibbous':age<23.99?'Last quarter':age<27.68?'Waning crescent':'New moon';
  return nm+', '+ill+'%';}

function sitWindow(ds,sit){const sr=sun(ds,true),ss=sun(ds,false);const isSun=new Date(ds+'T12:00:00').getDay()===0;
  if(sit==='Morning'){const legal=add(sr,-30),inS=r5(add(sr,-40)),leave=add(inS,-70),wake=add(leave,-30);
    let end=r30(add(sr,210));const sundayStop=new Date(new Date(ds+'T09:30:00-05:00'));if(isSun&&end>sundayStop)end=sundayStop;
    return {sr,ss,legal,legalEnd:add(ss,30),inS,leave,wake,end,from:add(inS,-60),to:add(end,30),isSun};}
  const legalEnd=add(ss,30);let inS=r30(add(ss,-210));const sundayGo=new Date(ds+'T12:30:00-05:00');if(isSun&&inS<sundayGo)inS=sundayGo;
  return {sr,ss,legal:add(sr,-30),legalEnd,inS,leave:r5(add(inS,-50)),wake:r5(add(inS,-70)),end:legalEnd,from:add(inS,-60),to:legalEnd,isSun};}

function pickTarget(){const q=new URLSearchParams(location.search).get('sit');if(q){const [ds,s]=q.split('|');if(ds&&s)return {ds,sit:s};}
  const now=new Date(),t=ymd(now),w=sitWindow(t,'Morning');
  if(now<add(w.sr,150))return {ds:t,sit:'Morning'};
  if(now<w.ss)return {ds:t,sit:'Evening'};
  return {ds:ymd(add(now,24*60)),sit:'Morning'};}
function nextSits(){const now=new Date(),t=ymd(now),tm=ymd(add(now,24*60)),w=sitWindow(t,'Morning');const out=[];
  if(now<add(w.sr,150))out.push([t,'Morning']);if(now<w.ss)out.push([t,'Evening']);out.push([tm,'Morning'],[tm,'Evening']);return out.slice(0,3);}
const sitName=(ds,s)=>{const t=ymd(new Date());const day=ds===t?(s==='Morning'?'This morning':'This evening'):ds===ymd(add(new Date(),24*60))?(s==='Morning'?'Tomorrow AM':'Tomorrow PM'):new Date(ds+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})+' '+(s==='Morning'?'AM':'PM');return day};

// ---- NWS ----
function tfetch(u,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms||9000);return fetch(u,{signal:c.signal,headers:{Accept:'application/geo+json'}}).then(r=>{clearTimeout(t);if(!r.ok)throw new Error(r.status);return r.json()})}
async function getNWS(){let pts=load('hb_nws_pts');
  if(!pts){const p=await tfetch(`https://api.weather.gov/points/${LAT},${LON}`);pts={h:p.properties.forecastHourly,g:p.properties.forecastGridData};store('hb_nws_pts',pts);}
  const [h,g]=await Promise.all([tfetch(pts.h),tfetch(pts.g).catch(()=>null)]);
  const gust=[];if(g&&g.properties&&g.properties.windGust){g.properties.windGust.values.forEach(v=>{const [s,dur]=v.validTime.split('/');const hrs=+((dur.match(/(\d+)H/)||[])[1]||0)+24*+((dur.match(/(\d+)D/)||[])[1]||0)||1;gust.push([Date.parse(s),hrs,Math.round((v.value||0)*0.621371)])});}
  const P=h.properties.periods.map(p=>{const t=Date.parse(p.startTime);const sp=(String(p.windSpeed).match(/\d+/g)||[0]).map(Number);const g0=gust.find(x=>t>=x[0]&&t<x[0]+x[1]*36e5);
    return {t,temp:p.temperature,dir:p.windDirection,sp:Math.max(...sp),gust:g0?Math.max(g0[2],Math.max(...sp)):Math.max(...sp),sky:p.shortForecast,pop:(p.probabilityOfPrecipitation&&p.probabilityOfPrecipitation.value)||0}});
  const out={at:Date.now(),P};store('hb_nws',out);return out;}

// ---- stand scoring ----
function parseW(s){const main=[],cross=[];let best=null;String(s||'').replace(/\(([^)]*)\)/g,(m,inner)=>{if(/cross/i.test(inner))inner.split(/[\/, ]+/).forEach(x=>{if(dd(x)!==null)cross.push(x.toUpperCase())});return ''}).split(',').forEach(x=>{x=x.trim();if(!x)return;const k=x.split(/\s/)[0].toUpperCase();if(dd(k)!==null)main.push(k)});
  const b=String(s||'').match(/(\w+)\s*\(best\)/i);if(b)best=b[1].toUpperCase();return {main,cross,best};}
function windScore(st,dir){const g=parseW(st.good),b=parseW(st.bad);const a=dd(dir);if(a===null||(!g.main.length&&!b.main.length))return {sc:0.5,txt:'No wind notes yet: boxes forgive more wind',kind:'neutral'};
  if(g.main.includes(dir))return {sc:3+(g.best===dir?1:0),txt:`${dir} is one of its good winds${g.best===dir?' (its best)':''}`,kind:'good'};
  if(b.main.includes(dir))return {sc:-4,txt:`${dir} is a bad wind here (scent goes where the deer are)`,kind:'bad'};
  if(g.main.some(x=>angDiff(dd(x),a)<=22.5)&&!b.main.some(x=>angDiff(dd(x),a)<=22.5))return {sc:2,txt:`${dir} is close to its good winds (${g.main.join(', ')})`,kind:'good'};
  if(g.cross.includes(dir))return {sc:1,txt:`${dir} is a usable crosswind`,kind:'ok'};
  if(b.main.some(x=>angDiff(dd(x),a)<=22.5))return {sc:-1.5,txt:`${dir} is close to its bad winds (${b.main.join(', ')})`,kind:'bad'};
  return {sc:0,txt:`${dir} isn't on its good or bad list`,kind:'ok'};}
function weapOK(st,season){const w=String(st.weap||'');const box=st.kind==='box';
  if(/ducks/i.test(w))return false;
  if(season==='archery')return !box&&!/gun only|rifle only|rifle \(gun only\)|gun\/ml|rifle\/ml|^gun/i.test(w);
  if(season==='blackpowder')return !/rifle only|rifle \(gun only\)|^rifle/i.test(w)||/ml/i.test(w);
  return true;}

function seasonFor(ds){const day=new Date(ds+'T12:00:00');let s=null;(D.seasons||[]).forEach(z=>{if(!/^Deer/.test(z.game))return;z.segs.forEach(([a,b])=>{if(day>=new Date(a+'T00:00:00')&&day<=new Date(b+'T23:59:59')){const k=/gun/i.test(z.game)?'gun':/black/i.test(z.game)?'blackpowder':'archery';if(!s||k==='gun'||(k==='blackpowder'&&s==='archery'))s=k}})});return s;}

function vecDir(rows){let x=0,y=0;rows.forEach(r=>{const a=dd(r.dir);if(a===null)return;x+=Math.sin(a*Math.PI/180)*(r.sp||1);y+=Math.cos(a*Math.PI/180)*(r.sp||1)});const deg=(Math.atan2(x,y)*180/Math.PI+360)%360;return {deg,dir:DIRS[Math.round(deg/22.5)%16]};}

function build(N,tg){const w=sitWindow(tg.ds,tg.sit);const rows=N.P.filter(p=>p.t>=w.from-1&&p.t<=w.to);if(rows.length<2)return false;
  const sitRows=rows.filter(p=>p.t>=w.inS.getTime()-36e5&&p.t<=w.end.getTime());const S=sitRows.length?sitRows:rows;
  const V=vecDir(S),dir=V.dir,season=seasonFor(tg.ds),CLUB=!!window.CLUB,isSun=w.isSun;
  const sp=S.map(r=>r.sp),gs=S.map(r=>r.gust),tp=S.map(r=>r.temp),pop=Math.max(...S.map(r=>r.pop));
  const feels=S.map(r=>(r.temp<=50&&r.sp>3)?Math.round(35.74+0.6215*r.temp-35.75*r.sp**0.16+0.4275*r.temp*r.sp**0.16):r.temp);
  const day=new Date(tg.ds+'T12:00:00');
  // stand ranking
  const prev={};(D.candidates||[]).forEach((c,i)=>prev[c.id]={c,i});const prevNP={};(D.notPicked||[]).forEach(c=>prevNP[c.id]=c);
  const pool=D.stands.filter(s=>!s.leaveOut&&weapOK(s,season)&&STAND[s.id]);
  const sc=pool.map(s=>{const ws=windScore(s,dir);let v=ws.sc+(s.fav?0.6:0)+(prev[s.id]?0.6-0.05*prev[s.id].i:0);
    if(season==='gun'&&/^bow( \(mainly\))?$/i.test(s.weap||''))v-=0.7;if(sp.length&&Math.max(...sp)<=3&&ws.kind==='bad')v+=1.5;return {s,ws,v}}).sort((a,b)=>b.v-a.v);
  const walkFor=id=>{const old=(prev[id]&&prev[id].c)||prevNP[id];if(old&&old.route){const o={};['route','steps','walk','yd','lockStart','fromRoute'].forEach(k=>{if(old[k]!==undefined)o[k]=old[k]});if(o.yd===undefined){const m=String(old.walk||'').match(/~(\d+) yd/);if(m)o.yd=+m[1]}return o;}
    let best=null;['Clubhouse','Parking Pond'].forEach(st=>{const b=routeFor(id,[],st);if(b&&(!best||b.L<best.b.L))best={b,st}});if(!best)return {};
    const yd=Math.round(best.b.L/pxPerYd()/10)*10;return {route:best.b.path.map(i=>unpx(GR.N[i].x,GR.N[i].y)),steps:stepsFrom(best.b,id),walk:`${best.st} → #${id} · ~${yd} yd`,yd,fromRoute:true};};
  const goodList=s=>parseW(s.good).main.join(', ');
  const cands=sc.filter(x=>x.ws.kind!=='bad').slice(0,8).map(x=>Object.assign({id:x.s.id,why:x.ws.txt+'.',pro:x.ws.txt+'.'+(x.s.fav?' Favorite.':''),con:x.s.bad?('Bad winds: '+x.s.bad+'.'):(goodList(x.s)?'':'No wind notes yet.')},walkFor(x.s.id)));
  const nps=sc.filter(x=>x.ws.kind==='bad').slice(0,8).map(x=>Object.assign({id:x.s.id,why:x.ws.txt+'.'},walkFor(x.s.id)));
  // first-row weather text
  const later=[];for(let i=1;i<S.length;i++){if(S[i].dir!==S[i-1].dir)later.push(`${S[i].dir} ${S[i].sp} by ${hlab(new Date(S[i].t))}`)}
  const sky=S.map(r=>r.sky).sort((a,b)=>S.filter(r=>r.sky===b).length-S.filter(r=>r.sky===a).length)[0]||'';
  const tmin=Math.min(...tp),tmax=Math.max(...tp);
  const head=`${tmin===tmax?tmin+'°':tmin+'–'+tmax+'°'}, ${sky.toLowerCase()}. Wind ${dir} ${Math.min(...sp)}–${Math.max(...sp)} mph${Math.max(...gs)>Math.max(...sp)+2?', gusts to '+Math.max(...gs):''}${later.length?'; '+later[0]:''}.${pop>=30?' Rain chance '+pop+'%.':''}`;
  const toward=(V.deg+180)%360;
  const weapon=CLUB?({gun:'Gun season: rifle, muzzleloader, shotgun or bow',blackpowder:'Blackpowder season: muzzleloader or bow',archery:'Archery season: bow or crossbow'}[season]||'Check the season')
    :({gun:'Savage 110 .30-06'+(isSun?' (out by 9:30: Sunday firearm break)':''),blackpowder:'NitroFire .50 or bow',archery:'Mathews V3X'}[season]||'Check the season');
  const marks={};const mk=(d,txt)=>{const k=hlab(new Date(Math.floor(d.getTime()/36e5)*36e5));marks[k]=marks[k]?marks[k]+' · '+txt:txt};
  if(tg.sit==='Morning'){mk(w.legal,tfmt(w.legal).replace(/ [AP]M/,'')+' legal');mk(w.sr,tfmt(w.sr).replace(/ [AP]M/,'')+' sun');if(isSun&&season!=='archery')mk(new Date(tg.ds+'T09:00:00-05:00'),'9:30 rifle stop');}
  else{mk(w.ss,tfmt(w.ss).replace(/ [AP]M/,'')+' sunset');mk(w.legalEnd,tfmt(w.legalEnd).replace(/ [AP]M/,'')+' legal end');}
  const hours=rows.map(r=>[hlab(new Date(r.t)),r.temp,r.dir,r.sp,r.gust,0]);
  const sitHours=sitRows.filter(r=>r.t>=w.inS.getTime()-36e5+1).map(r=>hlab(new Date(r.t)));
  const other=tg.sit==='Morning'?'Evening':'Morning',ods=tg.sit==='Morning'?tg.ds:ymd(add(new Date(tg.ds+'T12:00:00'),24*60)),ow=sitWindow(ods,other);
  const orows=N.P.filter(p=>p.t>=ow.inS.getTime()&&p.t<=ow.end.getTime());const oV=orows.length?vecDir(orows):null;
  const otop=oV?pool.map(s=>({s,v:windScore(s,oV.dir).sc+(s.fav?0.6:0)})).sort((a,b)=>b.v-a.v).slice(0,2).map(x=>'#'+x.s.id).join(' or '):'';
  const fetched=new Date(N.at);
  Object.assign(D,{
    date:tg.ds,title:day.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}),sit:tg.sit,weapon,
    updated:`Auto brief · NWS forecast ${tfmt(fetched)} · picks ranked by each stand's winds`,
    hero:{wake:CLUB?'':tfmt(w.wake),leave:CLUB?'':tfmt(w.leave),inStand:CLUB?'':tfmt(w.inS),legalStart:tfmt(w.legal),sunrise:tfmt(w.sr),sitEnd:tfmt(w.end),sunset:tfmt(w.ss),legalEnd:tfmt(w.legalEnd)},
    why:`${dir} wind for the ${tg.sit.toLowerCase()} sit. Stands are ranked by the good and bad winds on file for each one${season?' and what’s legal in '+season+' season':''}. This is an automatic brief: ask Claude for a full one with sightings, deer activity and an outfit.`,
    wind:{from:dir,fromDeg:Math.round(V.deg),speed:`${Math.min(...sp)}–${Math.max(...sp)} mph${Math.max(...gs)>Math.max(...sp)?', gusts ~'+Math.max(...gs):''}`,later:later.join(', ')||'Steady through the sit',note:head},
    windTowardDeg:Math.round(toward),sitHours,taken:[],candidates:cands,notPicked:nps,
    hourly:hours,
    wx:{src:'National Weather Service, '+tfmt(fetched)+(Date.now()-N.at>2*36e5?' (saved, no signal)':''),headline:head,sky,rain:pop>=20?pop+'% chance of rain':'No rain expected',hours,marks,
      notes:[[tmin<=45?'Coldest':'Warmest',tmin<=45?`${tmin}°, feels ~${Math.min(...feels)}°`:`${tmax}°`],['Scent','Drifts '+DIRS[Math.round(toward/22.5)%16]],['Moon',moon(day)],...(isSun&&season!=='archery'?[['Sunday','No firearms 9:30-12:30']]:[])]},
    legalSum:(season?season[0].toUpperCase()+season.slice(1)+' season':'Check season')+(isSun?' · Sunday':''),
    altLabel:(other==='Evening'?'This evening':'Next morning')+(oV?` · ${oV.dir} wind`:''),
    evening:{wake:'',leave:CLUB?'':tfmt(ow.leave),inStand:CLUB?'':tfmt(ow.inS),note:oV?`${oV.dir} wind. Best on file for that wind: ${otop}.`:'Forecast not out yet.'}
  });
  const L=(D.legal||[]).filter(r=>!/^(Season|Sunday|Legal light)$/.test(r[0]));
  D.legal=[['Season',(season?season[0].toUpperCase()+season.slice(1)+' season':'Check the NC season dates')+'. '+(CLUB?'Any legal weapon.':weapon)+'.'],...(isSun&&season!=='archery'?[['Sunday','No firearms 9:30 AM-12:30 PM. Bow is legal through the break.']]:[]),...L,['Legal light',`${tfmt(w.legal)} (sunrise ${tfmt(w.sr)}). Ends ${tfmt(w.legalEnd)}.`]];
  if(season==='archery')D.legal=D.legal.filter(r=>!/orange/i.test(r[0]));
  window.LIVEAUTO=true;return true;}

function bar(mode,tg,N){const el=document.getElementById('livebar');if(!el)return;
  const btn=([ds,s])=>{const on=ds===tg.ds&&s===tg.sit;const u=new URL(location.href);u.searchParams.set('sit',ds+'|'+s);return `<a class="lvb${on?' on':''}" href="${u.pathname+u.search}">${sitName(ds,s)}</a>`};
  const msg=mode==='claude'?`✓ Claude's brief for this sit`:mode==='auto'?`🛰 Auto brief from the live forecast`:mode==='old'?`⚠ No forecast (no signal?). Showing Claude's last brief`:'';
  const L=nextSits();if(!L.some(([d,s])=>d===tg.ds&&s===tg.sit))L.unshift([tg.ds,tg.sit]);
  el.innerHTML=`<div class="lvm">${msg}${N&&mode==='claude'?` · <span>NWS now: ${esc(nowLine(N))}</span>`:''}</div><div class="lvbs">${L.slice(0,4).map(btn).join('')}</div>`;}
function nowLine(N){const t=Date.now();const p=N.P.find(p=>t>=p.t&&t<p.t+36e5)||N.P[0];return p?`${p.temp}° ${p.dir} ${p.sp} mph`:''}

window.LIVEPATCH=async function(){
  const tg=pickTarget();const q=new URLSearchParams(location.search).get('sit');
  const claudeMatch=D.date===tg.ds&&String(D.sit).toLowerCase()===tg.sit.toLowerCase();
  let N=null;try{N=await getNWS()}catch(e){N=load('hb_nws')}
  if(claudeMatch){bar('claude',tg,N);return;}
  if(N&&build(N,tg)){bar('auto',tg,N);return;}
  bar('old',tg,null);
};
})();
