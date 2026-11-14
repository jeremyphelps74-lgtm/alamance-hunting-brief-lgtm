// ---- Field tools: marks, blood trail, track, guide, rings, offline ----
(function(){
const FK='hb_marks', TK='hb_track';
const LS={get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let MARKS=LS.get(FK,[]), TRACK=LS.get(TK,[]), TRACKING=false, GUIDE=false, RINGS=false, HEAD=null, PENDING=null;
const TYPES={shot:{i:'🎯',c:'#ffc83d',n:'Shot site'},blood:{i:'🩸',c:'#ff2d2d',n:'Blood'},deer:{i:'🦌',c:'#8fbf4d',n:'Deer'},sign:{i:'🌿',c:'#c08a4a',n:'Sign'},rec:{i:'✅',c:'#5fc4ff',n:'Recovered'}};
const CARD=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const card=b=>CARD[Math.round(((b%360)+360)%360/22.5)%16];
function bearing(a,b){const t=Math.PI/180,y=Math.sin((b[1]-a[1])*t)*Math.cos(b[0]*t),x=Math.cos(a[0]*t)*Math.sin(b[0]*t)-Math.sin(a[0]*t)*Math.cos(b[0]*t)*Math.cos((b[1]-a[1])*t);return (Math.atan2(y,x)/t+360)%360}
const M=(a,b)=>meters({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]});
const hhmm=ts=>new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const $f=s=>document.querySelector(s);

// UI
const ctl=$f('.mapctl');
const box=document.createElement('div');box.id='fieldbox';
box.innerHTML=`<div class="fhead">Field tools <small>(saved on this phone)</small></div>
<div class="fbtns">
 <button data-m="deer">🦌 Deer</button><button data-m="sign">🌿 Sign</button><button data-m="shot">🎯 Shot</button><button data-m="blood">🩸 Blood here</button><button data-m="rec">✅ Found</button>
</div>
<div class="fbtns">
 <button id="ftrack">〰 Track: off</button><button id="fguide">🧭 Guide: off</button><button id="frings">◎ Rings: off</button>
</div>
<div id="fplace" style="display:none"><div id="fplacetxt"></div><div class="fbtns" style="margin:6px 0 0"><button id="fplaceme">📍 Use my spot</button><button id="fplacex">Cancel</button></div></div>
<div id="fguidebox" style="display:none"><div id="farrow">↑</div><div id="fguidetxt"></div></div>
<div id="flist"></div><a href="patterns.html" style="display:block;margin-top:8px;text-align:center;padding:9px;border-radius:10px;background:var(--card);border:1px solid var(--line);color:var(--txt);font-weight:600;text-decoration:none">📊 Deer patterns: every sighting on a map</a>`;
const st=document.getElementById('mestat');(st||ctl).after(box);
const css=document.createElement('style');css.textContent=`
#fieldbox{margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--card2)}
#fieldbox .fhead{font-weight:700;margin-bottom:6px}#fieldbox .fhead small{color:var(--mute);font-weight:500}
#fieldbox .fbtns{display:flex;gap:6px;margin-bottom:6px}
#fieldbox button{flex:1;border:1px solid var(--line);background:var(--card);color:var(--txt);border-radius:10px;padding:9px 2px;font:600 13px Inter,sans-serif}
#fieldbox button.on{background:rgba(43,140,255,.25);border-color:#2b8cff}
#fguidebox{display:flex;align-items:center;gap:12px;padding:8px;border-radius:10px;background:rgba(43,140,255,.12);margin-bottom:6px}
#farrow{font-size:44px;line-height:1;transition:transform .2s;color:#5fc4ff}
#fguidetxt{font-weight:600}
#fplace{padding:8px;border-radius:10px;background:rgba(255,200,61,.15);border:1px solid #ffc83d;margin-bottom:6px;font-weight:600}
#mapbox.placing{outline:3px solid #ffc83d;outline-offset:-3px;cursor:crosshair}
#flist .fi{display:flex;gap:6px;align-items:center;padding:5px 0;border-top:1px solid var(--line);font-size:13px}
#flist .fi input{flex:1;min-width:0;background:var(--card);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:5px 6px;font-size:13px}
#flist .fi .x{flex:0 0 auto;padding:4px 8px}
#flist .fsum{font-size:13px;color:var(--mute);margin:4px 0}
#flist .fact{display:flex;gap:6px;margin-top:6px}`;
document.head.appendChild(css);

function save(){LS.set(FK,MARKS);LS.set(TK,TRACK);}
function centerOn(lat,lon){if(!view)return;const c=px(lat,lon);if(c[0]<view.x+view.w*0.15||c[0]>view.x+view.w*0.85||c[1]<view.y+view.h*0.15||c[1]>view.y+view.h*0.85){view.x=c[0]-view.w/2;view.y=c[1]-view.h/2;}}
function needGPS(cb){if(ME){cb();return}PENDING=cb;if(MEW===null)$f('#zme').click();meMsg('Getting your GPS fix…');}
function addMark(t){needGPS(()=>{centerOn(ME[0],ME[1]);putMark(t,ME[0],ME[1],Math.round(ME[2]/0.9144),'gps');});}
function putMark(t,lat,lon,acc,how){MARKS.push({t,lat:+lat.toFixed(6),lon:+lon.toFixed(6),acc,ts:Date.now(),note:'',how});save();list();drawMap();
  const n=MARKS.filter(m=>m.t===t).length;let rel='';if(ME&&how==='map'){const d=M([ME[0],ME[1]],[lat,lon]);rel=` · ${yd(d)} yd ${card(bearing([ME[0],ME[1]],[lat,lon]))} of you`;}
  meMsg(`${TYPES[t].i} ${TYPES[t].n}${t==='blood'?' #'+n:''} marked${how==='map'?' where you tapped':' at your spot'}${rel}. Add a note below.`);}
let PLACE=null;
function placeMode(t){PLACE=t;$f('#fplace').style.display='block';$f('#mapbox').classList.add('placing');
  $f('#fplacetxt').textContent=`Tap the map where the ${t==='deer'?'deer was':t==='sign'?'sign is':t==='rec'?'deer was recovered':'deer stood when you shot'}. Zoom in first for a closer spot.`;$f('#mapwrap').scrollIntoView({block:'start',behavior:'smooth'});}
function endPlace(){PLACE=null;$f('#fplace').style.display='none';$f('#mapbox').classList.remove('placing');}
$f('#fplacex').onclick=endPlace;
$f('#fplaceme').onclick=()=>{const t=PLACE;endPlace();addMark(t);};
function unpx(x,y){const g=D.geo;return [(y/g.scale+g.y0-g.fy[1])/g.fy[0],(x/g.scale+g.x0-g.fx[1])/g.fx[0]];}
$f('#mapbox').addEventListener('click',e=>{if(!PLACE)return;e.stopPropagation();e.preventDefault();if(!view)return;const [sx,sy]=toSvg(e.clientX,e.clientY);const [la,lo]=unpx(sx,sy);const t=PLACE;endPlace();putMark(t,la,lo,null,'map');},true);
document.querySelectorAll('#fieldbox [data-m]').forEach(b=>b.onclick=()=>b.dataset.m==='blood'?addMark('blood'):placeMode(b.dataset.m));

function trailSummary(){const shot=[...MARKS].reverse().find(m=>m.t==='shot');const bl=MARKS.filter(m=>m.t==='blood'&&(!shot||m.ts>=shot.ts));
  if(!shot&&!bl.length)return '';const a=shot||bl[0],z=bl[bl.length-1];if(!z||z===a)return shot?'Shot site marked. Mark blood as you find it.':'';
  const d=M([a.lat,a.lon],[z.lat,z.lon]);return `Blood trail: ${bl.length} mark${bl.length>1?'s':''}, last one ${yd(d)} yd ${card(bearing([a.lat,a.lon],[z.lat,z.lon]))} of the ${shot?'shot site':'first blood'}${bl.length>1?`, heading ${card(bearing([bl[bl.length-2].lat,bl[bl.length-2].lon],[z.lat,z.lon]))}`:''}.`;}
function shareText(){const d=new Date();let s=`Hunt marks ${d.toLocaleDateString()}\n`;
  MARKS.forEach((m,i)=>{s+=`${hhmm(m.ts)} ${TYPES[m.t].n}: ${m.lat}, ${m.lon} ${m.how==='map'?'(placed on map)':'(GPS ±'+m.acc+' yd)'}${m.note?' – '+m.note:''}\n`});
  const ts=trailSummary();if(ts)s+=ts+'\n';
  if(TRACK.length>1){let L=0;for(let i=1;i<TRACK.length;i++)L+=M(TRACK[i-1],TRACK[i]);s+=`Track: ${TRACK.length} points, ${yd(L)} yd, ${hhmm(TRACK[0][2])}–${hhmm(TRACK[TRACK.length-1][2])}. Points: `+TRACK.filter((p,i)=>i%Math.max(1,Math.ceil(TRACK.length/40))===0||i===TRACK.length-1).map(p=>`${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(' ')+'\n';}
  return s;}
let clearArm=0;
function list(){const L=$f('#flist');if(!MARKS.length&&TRACK.length<2){L.innerHTML='';return}
  L.innerHTML=(trailSummary()?`<div class="fsum">🩸 ${esc(trailSummary())}</div>`:'')+
   MARKS.map((m,i)=>`<div class="fi"><span>${TYPES[m.t].i} ${hhmm(m.ts)}</span><input data-i="${i}" placeholder="note (buck, scrape, direction…)" value="${esc(m.note||'')}"><button class="x" data-del="${i}">✕</button></div>`).join('')+
   (TRACK.length>1?`<div class="fsum">〰 Track: ${TRACK.length} points since ${hhmm(TRACK[0][2])}</div>`:'')+
   `<div class="fact">${CLUBMODE?'':'<button id="fshare">📤 Send to Claude</button>'}<button id="fclub">👥 Send to club${unsent()?' ('+unsent()+')':' ✓'}</button><button id="fclear">🗑 Clear</button></div>`;
  L.querySelectorAll('input[data-i]').forEach(x=>x.onchange=()=>{MARKS[+x.dataset.i].note=x.value;save();});
  L.querySelectorAll('[data-del]').forEach(x=>x.onclick=()=>{MARKS.splice(+x.dataset.del,1);save();list();drawMap();});
  const fsh=$f('#fshare');if(fsh)fsh.onclick=async()=>{const t=shareText();try{if(navigator.share){await navigator.share({text:t});return}}catch(e){}
    try{await navigator.clipboard.writeText(t);meMsg('Copied. Paste it into your Claude chat.');}catch(e){meMsg('Copy failed. Long-press to copy:\n'+t);}};
  $f('#fclub').onclick=sendClub;
  $f('#fclear').onclick=()=>{if(Date.now()-clearArm<4000){MARKS=[];TRACK=[];save();list();drawMap();meMsg('Marks and track cleared.');clearArm=0;}else{clearArm=Date.now();$f('#fclear').textContent='Tap again to clear';}};}

// track + position hook
let lastPos=null;
function onPos(){if(PENDING){const f=PENDING;PENDING=null;f();}
  if(TRACKING&&ME){centerOn(ME[0],ME[1]);const p=[ME[0],ME[1],Date.now()];const l=TRACK[TRACK.length-1];if(!l||M(l,p)>=4){TRACK.push(p);save();list();}}
  if(GUIDE)guide();}
setInterval(()=>{if(ME&&(ME!==lastPos)){lastPos=ME;onPos();}},1000);
$f('#ftrack').onclick=()=>{TRACKING=!TRACKING;const b=$f('#ftrack');b.classList.toggle('on',TRACKING);b.textContent='〰 Track: '+(TRACKING?'on':'off');
  if(TRACKING)needGPS(()=>{meMsg('Tracking your path. Mark 🩸 Blood at each spot you find.');onPos();});};

// guide
function target(){const id=sel||((typeof ranked==='function'&&ranked().find(r=>r.status!=='taken'))||{}).id;return id&&STAND[id]?{id,p:[STAND[id].lat,STAND[id].lon]}:null}
function guide(){const T=target(),G=$f('#fguidebox');if(!T){$f('#fguidetxt').textContent='Tap a stand on the map first.';return}
  if(!ME){$f('#fguidetxt').textContent='Waiting for GPS…';return}
  const b=bearing([ME[0],ME[1]],T.p),d=yd(M([ME[0],ME[1]],T.p));
  $f('#farrow').style.transform=`rotate(${HEAD==null?b:b-HEAD}deg)`;
  $f('#fguidetxt').innerHTML=`#${esc(T.id)}: <b>${d} yd</b> ${card(b)} (${Math.round(b)}°)<br><small>${HEAD==null?'Arrow points north-up (no compass). Hold the phone flat.':'Arrow follows your phone. Hold it flat, top pointing ahead.'}${d<25?' · You\'re there.':''}</small>`;
  drawMap();}
function onOri(e){let h=null;if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;else if(e.absolute&&e.alpha!=null)h=360-e.alpha;if(h!=null){HEAD=h;if(GUIDE&&ME){const T=target();if(T)$f('#farrow').style.transform=`rotate(${bearing([ME[0],ME[1]],T.p)-HEAD}deg)`;}}}
$f('#fguide').onclick=async()=>{GUIDE=!GUIDE;const b=$f('#fguide');b.classList.toggle('on',GUIDE);b.textContent='🧭 Guide: '+(GUIDE?'on':'off');$f('#fguidebox').style.display=GUIDE?'flex':'none';
  if(GUIDE){try{if(window.DeviceOrientationEvent&&typeof DeviceOrientationEvent.requestPermission==='function'){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted')HEAD=null;}}catch(e){}
    window.addEventListener('deviceorientationabsolute',onOri,true);window.addEventListener('deviceorientation',onOri,true);needGPS(guide);guide();}
  else drawMap();};
$f('#frings').onclick=()=>{RINGS=!RINGS;const b=$f('#frings');b.classList.toggle('on',RINGS);b.textContent='◎ Rings: '+(RINGS?'on':'off');drawMap();};

// draw overlay on top of the map
const baseDraw=drawMap;
drawMap=function(R){baseDraw(R);const sv=document.querySelector('#mapbox svg.mp');if(!sv)return;let s='';const ppy=pxPerYd();
  if(RINGS){const T=target();if(T){const c=px(...T.p);[100,200].forEach(r=>{s+=`<circle cx="${c[0]}" cy="${c[1]}" r="${r*ppy}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 8" opacity=".85"/><text x="${c[0]}" y="${c[1]-r*ppy-6}" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" stroke="#000" stroke-width="4" paint-order="stroke">${r} yd</text>`});}}
  if(TRACK.length>1)s+=`<polyline points="${TRACK.map(p=>px(p[0],p[1]).join(',')).join(' ')}" fill="none" stroke="#5fc4ff" stroke-width="5" stroke-linejoin="round" opacity=".9"/>`;
  const shot=[...MARKS].reverse().find(m=>m.t==='shot');const bl=MARKS.filter(m=>m.t==='blood'&&(!shot||m.ts>=shot.ts));
  const chain=[...(shot?[shot]:[]),...bl];if(chain.length>1)s+=`<polyline points="${chain.map(m=>px(m.lat,m.lon).join(',')).join(' ')}" fill="none" stroke="#ff2d2d" stroke-width="4" stroke-dasharray="12 8"/>`;
  let bn=0;MARKS.forEach(m=>{const c=px(m.lat,m.lon),T=TYPES[m.t];const lab=m.t==='blood'?String(++bn):T.i;
    s+=`<g><circle cx="${c[0]}" cy="${c[1]}" r="14" fill="${T.c}" stroke="#000" stroke-width="3"/><text x="${c[0]}" y="${c[1]+7}" text-anchor="middle" font-size="${m.t==='blood'?18:18}" font-weight="800" fill="#000">${m.t==='blood'?lab:''}</text>${m.t!=='blood'?`<text x="${c[0]}" y="${c[1]-20}" text-anchor="middle" font-size="22">${T.i}</text>`:''}</g>`;});
  if(GUIDE&&ME){const T=target();if(T){const a=px(ME[0],ME[1]),b=px(...T.p);s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#5fc4ff" stroke-width="4" stroke-dasharray="6 8"/>`;}}
  if(s)sv.insertAdjacentHTML('beforeend',s);
  if(ME){const g=sv.querySelector('g.me');if(g)sv.appendChild(g);}
  if(typeof applyView==='function'&&view)applyView();};
(function wait(){if(typeof D!=='undefined'&&D&&D.geo){list();drawMap();}else setTimeout(wait,200);})();




// ---- club sharing (Google Form → Sheet) ----
const CLUBMODE=!!window.CLUB;
const FORM='https://docs.google.com/forms/d/e/1FAIpQLSf1w85uLUggm4mzQLEej-leYSOE0HfxpZrheFG15-XADt4tfQ/formResponse';
const ENT={when:'entry.2006520658',name:'entry.854423478',stand:'entry.1711447138',what:'entry.478433125',count:'entry.289696493',dir:'entry.1471151470',lat:'entry.840621409',lon:'entry.359953880',notes:'entry.1376660535'};
const CSV='https://docs.google.com/spreadsheets/d/e/2PACX-1vSILql_KgPsJOYaxNwjwyzE9ohCw-pMZFfhHHRRcxn4U12kG7vHdwBxDup70lrFJP8WPqviTAwinzse/pub?gid=2130860769&single=true&output=csv';
function unsent(){return MARKS.filter(m=>!m.sent).length}
function nearStand(lat,lon){let b=null,bd=1e9;Object.values(STAND).forEach(s=>{if(s.leaveOut)return;const d=M([lat,lon],[s.lat,s.lon]);if(d<bd){bd=d;b=s}});return b&&bd<370?b.id:''}
function myName(){let n=LS.get('hb_name','');if(!n){const i=$f('#fname');n=i?i.value.trim():'';}return n}
async function sendClub(){const name=myName();if(!name){meMsg('Type your first name in the box above Field tools, then tap Send again.');const i=$f('#fname');if(i)i.focus();return}
  const todo=MARKS.filter(m=>!m.sent);if(!todo.length){meMsg('Nothing new to send.');return}
  let ok=0;for(const m of todo){const d=new Date(m.ts);const p=new URLSearchParams();
    p.set(ENT.when,`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
    p.set(ENT.name,name);p.set(ENT.stand,nearStand(m.lat,m.lon));p.set(ENT.what,TYPES[m.t].n);p.set(ENT.count,'1');p.set(ENT.dir,'');
    p.set(ENT.lat,String(m.lat));p.set(ENT.lon,String(m.lon));p.set(ENT.notes,(m.note||'')+(m.how==='map'?' [placed on map]':' [GPS]'));
    try{await fetch(FORM,{method:'POST',mode:'no-cors',body:p});m.sent=true;ok++;}catch(e){break}}
  save();list();meMsg(ok===todo.length?`👥 Sent ${ok} report${ok>1?'s':''} to the club sheet. They'll show on everyone's map within a few minutes.`:`Sent ${ok} of ${todo.length}. No signal? Tap Send again later; unsent marks stay saved.`);loadClub(true);}
// name box
const nb=document.createElement('div');nb.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:6px';
nb.innerHTML='<span style="font-size:13px;color:var(--mute);white-space:nowrap">Your name</span><input id="fname" placeholder="first name (for club reports)" style="flex:1;min-width:0;background:var(--card);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 8px;font-size:14px">';
box.insertBefore(nb,box.querySelector('.fbtns'));$f('#fname').value=LS.get('hb_name','');$f('#fname').onchange=e=>LS.set('hb_name',e.target.value.trim());
// read club reports
let CLUBR=[],SHOWCLUB=LS.get('hb_showclub',true);
function parseCSV(t){const R=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'||c=='\r'){if(c=='\r'&&t[i+1]=='\n')i++;row.push(f);R.push(row);row=[];f=''}else f+=c}if(f||row.length){row.push(f);R.push(row)}return R}
async function loadClub(force){try{const r=await fetch(CSV+'&t='+(force?Date.now():Math.floor(Date.now()/120000)));if(!r.ok)return;const rows=parseCSV(await r.text()).slice(1).filter(x=>x[7]&&x[8]);
  CLUBR=rows.map(x=>({ts:x[0],when:x[1],name:x[2],stand:x[3],what:x[4],n:x[5],dir:x[6],lat:+x[7],lon:+x[8],note:x[9]||''})).filter(x=>isFinite(x.lat)&&isFinite(x.lon)&&!/^test/i.test(x.name));
  LS.set('hb_clubcache',CLUBR);clubList();drawMap();}catch(e){CLUBR=LS.get('hb_clubcache',[]);clubList();}}
const ICON=w=>/blood/i.test(w)?'🩸':/recover|found/i.test(w)?'✅':/shot/i.test(w)?'🎯':/sign|scrape|rub/i.test(w)?'🌿':'🦌';
const cl=document.createElement('div');cl.id='clublist';cl.style.cssText='margin-top:8px';box.appendChild(cl);
function clubList(){const recent=[...CLUBR].reverse().slice(0,15);
  cl.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;margin:4px 0">👥 Club reports <button id="fclubtog" style="flex:0 0 auto;padding:5px 10px">${SHOWCLUB?'On map ✓':'Show on map'}</button></div>`+
   (recent.length?recent.map(x=>`<div class="fi" style="display:block"><b>${ICON(x.what)} ${esc(x.what)}</b>${x.stand?' · near #'+esc(x.stand):''} · ${esc(x.name)}<br><small style="color:var(--mute)">${esc(x.when||x.ts)}${x.note?' · '+esc(x.note.replace(/ \[(placed on map|GPS)\]$/,'')):''}</small></div>`).join(''):'<div class="fsum">No club reports yet.</div>');
  $f('#fclubtog').onclick=()=>{SHOWCLUB=!SHOWCLUB;LS.set('hb_showclub',SHOWCLUB);clubList();drawMap();};}
const dm3=drawMap;drawMap=function(R){dm3(R);if(!SHOWCLUB||!CLUBR.length)return;const sv=document.querySelector('#mapbox svg.mp');if(!sv)return;let s='';
  CLUBR.forEach(x=>{const c=px(x.lat,x.lon);s+=`<g><rect x="${c[0]-13}" y="${c[1]-13}" width="26" height="26" rx="6" transform="rotate(45 ${c[0]} ${c[1]})" fill="#b98cff" stroke="#000" stroke-width="3"/><text x="${c[0]}" y="${c[1]+7}" text-anchor="middle" font-size="18">${ICON(x.what)}</text><title>${esc(x.when+' · '+x.name+' · '+x.what+(x.note?' · '+x.note:''))}</title></g>`});
  sv.insertAdjacentHTML('beforeend',s);if(ME){const g=sv.querySelector('g.me');if(g)sv.appendChild(g);}if(typeof applyView==='function'&&view)applyView();};
CLUBR=LS.get('hb_clubcache',[]);clubList();
(function w2(){if(typeof D!=='undefined'&&D&&D.geo){loadClub();setInterval(loadClub,180000);}else setTimeout(w2,300)})();
if(CLUBMODE){const ft=box.querySelector('.fhead');if(ft)ft.innerHTML='Report what you see <small>(tap a button, tap the map, then 👥 Send to club)</small>';}

// ---- tabs: Stands / Map / Weather ----
const pickCard=$f('#pickcard'),mapCard=$f('#mapHome').closest('.card'),wxCard=$f('#wxbd').closest('.card');
pickCard.dataset.tab='stands';mapCard.dataset.tab='map';wxCard.dataset.tab='weather';
const nav=document.createElement('div');nav.id='tabnav';
nav.innerHTML='<button data-t="stands">🎯 Stands</button><button data-t="map">🗺️ Map</button><button data-t="weather">🌬️ Weather</button>';
const tiles=$f('#tiles');tiles.parentNode.insertBefore(nav,tiles);
const tcss=document.createElement('style');tcss.textContent=`
#tabnav{position:sticky;top:0;z-index:50;display:flex;gap:6px;padding:8px 0;background:var(--bg)}
#tabnav button{flex:1;border:1px solid var(--line);background:var(--card);color:var(--txt);border-radius:12px;padding:10px 4px;font:700 14px Inter,sans-serif}
#tabnav button.on{background:var(--orange);border-color:var(--orange);color:#111}
body[data-tab="stands"] .card[data-tab="map"],body[data-tab="stands"] .card[data-tab="weather"],
body[data-tab="map"] .card[data-tab="stands"],body[data-tab="map"] .card[data-tab="weather"],
body[data-tab="weather"] .card[data-tab="stands"],body[data-tab="weather"] .card[data-tab="map"]{display:none}
body[data-tab="map"] #tiles{display:none}
#toptog{width:100%;text-align:left;border:1px solid var(--gold);background:rgba(255,200,61,.10);color:var(--txt);border-radius:12px;padding:10px 12px;font:600 14px Inter,sans-serif;margin:4px 0 8px}
#toptog b{color:var(--gold)}#topwrap:not(.open) #toppick{display:none}`;document.head.appendChild(tcss);
function setTab(t){document.body.dataset.tab=t;nav.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));LS.set('hb_tab',t);
  if(t==='map'&&typeof D!=='undefined'&&D&&D.geo){mapHome();drawMap();}
  window.scrollTo({top:Math.max(0,nav.getBoundingClientRect().top+window.scrollY-2)});}
nav.querySelectorAll('button').forEach(b=>b.onclick=()=>setTab(b.dataset.t));
// collapse the best-stand box into a one-line button
const tp=$f('#toppick');const tw=document.createElement('div');tw.id='topwrap';tp.parentNode.insertBefore(tw,tp);
const tt=document.createElement('button');tt.id='toptog';tw.appendChild(tt);tw.appendChild(tp);
tt.onclick=()=>{tw.classList.toggle('open');topLabel();};
function topLabel(){try{const top=ranked().find(r=>r.status!=='taken');const o=top&&STAND[top.id];
  tt.innerHTML=top?`★ Best pick: <b>#${esc(top.id)}</b>${o&&o.name&&!/^#/.test(o.name)?' '+esc(o.name):''} <span style="float:right;color:var(--mute)">${tw.classList.contains('open')?'Hide ▲':'Why + walk-in ▼'}</span>`:'No open stands';}catch(e){}}
const dm2=drawMap;drawMap=function(R){dm2(R);topLabel();};
setTab(LS.get('hb_tab','stands'));

// ---- full-screen map ----
const fs=document.createElement('style');fs.textContent=`
body.fullmap{overflow:hidden}
body.fullmap #mapwrap{position:fixed;inset:0;z-index:1000;background:var(--bg);overflow-y:auto;padding:6px 6px calc(env(safe-area-inset-bottom) + 8px);margin:0}
body.fullmap .basenote,body.fullmap #fieldbox .fhead,body.fullmap #flist .fi,body.fullmap #fieldbox a{display:none!important}
body.fullmap .basesel{margin-bottom:4px}body.fullmap .basesel button{padding:5px 4px}
body.fullmap .mapbox{border-radius:8px}
body.fullmap .mapctl{margin-top:4px}body.fullmap .mapctl button,body.fullmap #fieldbox button{padding:7px 2px;font-size:12px}
body.fullmap #fieldbox{margin-top:4px;padding:6px;border-radius:10px}body.fullmap #fieldbox .fbtns{margin-bottom:4px}
body.fullmap #mestat{margin:4px 0;padding:5px 8px;font-size:12px}
body.fullmap #fguidebox{padding:4px 8px}body.fullmap #farrow{font-size:30px}
body.fullmap #standinfo{font-size:13px}`;document.head.appendChild(fs);
const bfs=document.createElement('button');bfs.id='zfull';bfs.textContent='⛶ Big';ctl.appendChild(bfs);
ctl.querySelectorAll('button').forEach(b=>{if(b.id==='zin')b.textContent='＋';if(b.id==='zout')b.textContent='－';});
function sizeFull(){if(!document.body.classList.contains('fullmap')){ASP=null;return}
  const mb=$f('#mapbox'),wrap=$f('#mapwrap');const W=mb.getBoundingClientRect().width||window.innerWidth;
  let other=20;[...wrap.children].forEach(ch=>{if(ch!==mb&&!ch.contains(mb)&&getComputedStyle(ch).display!=='none'){const cs=getComputedStyle(ch);other+=ch.offsetHeight+parseFloat(cs.marginTop)+parseFloat(cs.marginBottom);}});const avail=window.innerHeight-Math.min(other,window.innerHeight*0.5);
  const H0=D.geo.h/D.geo.w;ASP=Math.max(0.55,Math.min(2.4,avail/W));}
function setFull(on){document.body.classList.toggle('fullmap',on);bfs.textContent=on?'✕ Exit':'⛶ Big';
  if(on&&typeof mapHome==='function')mapHome();
  const c=view?[view.x+view.w/2,view.y+view.h/2]:null;ASP=null;sizeFull();
  if(view&&c){clampView();view.x=c[0]-view.w/2;view.y=c[1]-view.h/2;}drawMap();sizeFull();if(view){clampView();if(c){view.x=c[0]-view.w/2;view.y=c[1]-view.h/2;}}drawMap();
  if(!on)window.scrollTo({top:$f('#mapwrap').getBoundingClientRect().top+window.scrollY-10});}
bfs.onclick=()=>setFull(!document.body.classList.contains('fullmap'));
window.addEventListener('resize',()=>{if(document.body.classList.contains('fullmap')){sizeFull();if(view)clampView();drawMap();}});

// offline (only on the real website)
if('serviceWorker' in navigator&&/github\.io$/.test(location.hostname)){navigator.serviceWorker.register('sw.js').catch(()=>{});}
})();
