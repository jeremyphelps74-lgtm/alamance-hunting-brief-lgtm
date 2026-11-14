// ---- Field tools: marks, blood trail, track, guide, rings, offline ----
(function(){
const FK='hb_marks', TK='hb_track';
const LS={get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let MARKS=LS.get(FK,[]), TRACK=LS.get(TK,[]), TRACKING=false, GUIDE=false, RINGS=false, HEAD=null, PENDING=null;
const TYPES={shot:{i:'🎯',c:'#ffc83d',n:'Shot site'},blood:{i:'🩸',c:'#ff2d2d',n:'Blood'},deer:{i:'🦌',c:'#8fbf4d',n:'Deer'},sign:{i:'🌿',c:'#c08a4a',n:'Sign'}};
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
 <button data-m="shot">🎯 Shot</button><button data-m="blood">🩸 Blood</button><button data-m="deer">🦌 Deer</button><button data-m="sign">🌿 Sign</button>
</div>
<div class="fbtns">
 <button id="ftrack">〰 Track: off</button><button id="fguide">🧭 Guide: off</button><button id="frings">◎ Rings: off</button>
</div>
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
#flist .fi{display:flex;gap:6px;align-items:center;padding:5px 0;border-top:1px solid var(--line);font-size:13px}
#flist .fi input{flex:1;min-width:0;background:var(--card);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:5px 6px;font-size:13px}
#flist .fi .x{flex:0 0 auto;padding:4px 8px}
#flist .fsum{font-size:13px;color:var(--mute);margin:4px 0}
#flist .fact{display:flex;gap:6px;margin-top:6px}`;
document.head.appendChild(css);

function save(){LS.set(FK,MARKS);LS.set(TK,TRACK);}
function centerOn(lat,lon){if(!view)return;const c=px(lat,lon);if(c[0]<view.x+view.w*0.15||c[0]>view.x+view.w*0.85||c[1]<view.y+view.h*0.15||c[1]>view.y+view.h*0.85){view.x=c[0]-view.w/2;view.y=c[1]-view.h/2;}}
function needGPS(cb){if(ME){cb();return}PENDING=cb;if(MEW===null)$f('#zme').click();meMsg('Getting your GPS fix…');}
function addMark(t){needGPS(()=>{MARKS.push({t,lat:+ME[0].toFixed(6),lon:+ME[1].toFixed(6),acc:Math.round(ME[2]/0.9144),ts:Date.now(),note:''});save();list();centerOn(ME[0],ME[1]);drawMap();
  const n=MARKS.filter(m=>m.t===t).length;meMsg(`${TYPES[t].i} ${TYPES[t].n}${t==='blood'?' #'+n:''} marked at ${ME[0].toFixed(5)}, ${ME[1].toFixed(5)} (±${Math.round(ME[2]/0.9144)} yd)`);});}
document.querySelectorAll('#fieldbox [data-m]').forEach(b=>b.onclick=()=>addMark(b.dataset.m));

function trailSummary(){const shot=[...MARKS].reverse().find(m=>m.t==='shot');const bl=MARKS.filter(m=>m.t==='blood'&&(!shot||m.ts>=shot.ts));
  if(!shot&&!bl.length)return '';const a=shot||bl[0],z=bl[bl.length-1];if(!z||z===a)return shot?'Shot site marked. Mark blood as you find it.':'';
  const d=M([a.lat,a.lon],[z.lat,z.lon]);return `Blood trail: ${bl.length} mark${bl.length>1?'s':''}, last one ${yd(d)} yd ${card(bearing([a.lat,a.lon],[z.lat,z.lon]))} of the ${shot?'shot site':'first blood'}${bl.length>1?`, heading ${card(bearing([bl[bl.length-2].lat,bl[bl.length-2].lon],[z.lat,z.lon]))}`:''}.`;}
function shareText(){const d=new Date();let s=`Hunt marks ${d.toLocaleDateString()}\n`;
  MARKS.forEach((m,i)=>{s+=`${hhmm(m.ts)} ${TYPES[m.t].n}: ${m.lat}, ${m.lon} (±${m.acc} yd)${m.note?' – '+m.note:''}\n`});
  const ts=trailSummary();if(ts)s+=ts+'\n';
  if(TRACK.length>1){let L=0;for(let i=1;i<TRACK.length;i++)L+=M(TRACK[i-1],TRACK[i]);s+=`Track: ${TRACK.length} points, ${yd(L)} yd, ${hhmm(TRACK[0][2])}–${hhmm(TRACK[TRACK.length-1][2])}. Points: `+TRACK.filter((p,i)=>i%Math.max(1,Math.ceil(TRACK.length/40))===0||i===TRACK.length-1).map(p=>`${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(' ')+'\n';}
  return s;}
let clearArm=0;
function list(){const L=$f('#flist');if(!MARKS.length&&TRACK.length<2){L.innerHTML='';return}
  L.innerHTML=(trailSummary()?`<div class="fsum">🩸 ${esc(trailSummary())}</div>`:'')+
   MARKS.map((m,i)=>`<div class="fi"><span>${TYPES[m.t].i} ${hhmm(m.ts)}</span><input data-i="${i}" placeholder="note (buck, scrape, direction…)" value="${esc(m.note||'')}"><button class="x" data-del="${i}">✕</button></div>`).join('')+
   (TRACK.length>1?`<div class="fsum">〰 Track: ${TRACK.length} points since ${hhmm(TRACK[0][2])}</div>`:'')+
   `<div class="fact"><button id="fshare">📤 Send to Claude</button><button id="fclear">🗑 Clear all</button></div>`;
  L.querySelectorAll('input[data-i]').forEach(x=>x.onchange=()=>{MARKS[+x.dataset.i].note=x.value;save();});
  L.querySelectorAll('[data-del]').forEach(x=>x.onclick=()=>{MARKS.splice(+x.dataset.del,1);save();list();drawMap();});
  $f('#fshare').onclick=async()=>{const t=shareText();try{if(navigator.share){await navigator.share({text:t});return}}catch(e){}
    try{await navigator.clipboard.writeText(t);meMsg('Copied. Paste it into your Claude chat.');}catch(e){meMsg('Copy failed. Long-press to copy:\n'+t);}};
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

// offline (only on the real website)
if('serviceWorker' in navigator&&/github\.io$/.test(location.hostname)){navigator.serviceWorker.register('sw.js').catch(()=>{});}
})();
