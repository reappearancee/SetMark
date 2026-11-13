import { catalog } from './catalog.js';
import { poses, keywords } from './poses.js';

const key = 'setmark.web.v1';
const defaults = { name: null, rest: 90, restSound: true, draft: null, workouts: [], routines: [] };
const app = document.querySelector('#app');
let state;
try { state = { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
catch { state = { ...defaults }; }
let tab = '홈', editor = false, routine = null, dialog = '', category = '', query = '';
let activeRecord = null, day = new Date(), month = new Date(), days = 30, metric = 'weight', movement = '';
let registration, applying = false, noticeTimer;
let restAudio;
let announcedRestEnd = 0;
const tabs = ['홈', '루틴', '기록', '통계', '설정'];
const paths = ['M3 10l9-7 9 7v10h-6v-6H9v6H3z','M4 5h16v14H4zM8 9h8m-8 5h8','M4 6h16v14H4zM8 3v6m8-6v6M4 11h16','M5 20V11m7 9V4m7 16v-7','M12 4v3m0 10v3M4 12h3m10 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8'];
const weekday = ['일','월','화','수','목','금','토'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
};
const set = () => ({ id: id(), weight: '', reps: '', checked: false });
const dateLabel = date => new Date(date).toLocaleString('ko-KR', {dateStyle:'medium',timeStyle:'short'});
const dayKey = date => { const d = new Date(date); return [d.getFullYear(),d.getMonth(),d.getDate()].join('-'); };
const duration = ms => { const s = Math.floor(Math.max(0,ms)/1000); const m = Math.floor(s/60); return (m >= 60 ? Math.floor(m/60)+':' : '') + String(m%60).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); };
const vol = workout => workout.exercises.flatMap(x=>x.sets).reduce((total,s)=>total+s.weightKg*s.repetitions,0);
const number = x => Number(x).toLocaleString('ko-KR',{maximumFractionDigits:2});
const sorted = () => [...state.workouts].sort((a,b)=>new Date(b.finishedAt)-new Date(a.finishedAt));
const btn = (label, action, css='', value='') => '<button type="button" data-action="'+action+'" data-value="'+esc(value)+'" class="'+css+'">'+label+'</button>';

function notice(message) {
  const node = document.querySelector('#notice');
  node.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(()=>node.textContent='',3800);
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(state)); return true; }
  catch { notice('기기에 저장할 수 없어요. 설정에서 기록을 내보내세요.'); return false; }
}
function pose(name) {
  let motion = name.includes('케이블') ? 'cable' : name.includes('머신') && !name.includes('스미스') || name.includes('레그 컬') ? 'machine' : Object.keys(keywords).find(k=>keywords[k].some(word=>name.includes(word)));
  const [head,limbs,equipment] = poses[motion] || poses.standing;
  const lines = (items,color,width) => items.map(points=>'<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" stroke="'+color+'" stroke-width="'+width+'"/>').join('');
  return '<svg aria-hidden="true" class="pose" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round">'+lines(equipment,'#748e80',2)+lines(limbs,'#31463a',3.4)+lines([limbs[0].slice(0,2)],'#25805a',4.8)+'<circle cx="'+head[0]+'" cy="'+head[1]+'" r="3.6" fill="#31463a"/></svg>';
}
function recordList(records) {
  return records.length ? records.map(w=>btn('<strong>'+esc(w.title)+'</strong><small>'+dateLabel(w.finishedAt)+' · '+w.exercises.flatMap(x=>x.sets).length+'세트</small>','record','exercise row between',w.id)).join('') : '<p class="muted">운동 기록이 없어요.</p>';
}
function home() {
  const today = new Date();
  const plans = state.routines.filter(r=>r.weekdays.includes(today.getDay()+1));
  return '<h1>세트마크</h1><p class="muted">'+(state.name ? esc(state.name)+'님 안녕하세요.' : '안녕하세요.')+'</p><section class="hero"><small>'+today.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})+'</small><h2>오늘의 운동</h2>'+(state.draft?'<p>운동 시간 <strong class="clock" data-clock></strong></p>':'')+btn(state.draft?'운동 이어서 기록':'▶ 자유 운동 시작','start','primary wide')+'</section><section><h2>오늘의 루틴</h2>'+(plans.map(r=>btn(esc(r.title),'start','exercise',r.id)).join('')||'<p class="muted">오늘 예정된 루틴이 없어요.</p>')+'</section><section class="section"><h2>최근 기록</h2>'+recordList(sorted().slice(0,3))+'</section>';
}
function workout() {
  const d = state.draft;
  return '<header class="row between"><h1>'+esc(d.title)+'</h1>'+btn('나중에','later')+'</header><div class="card row between"><strong>운동 시간 <span class="clock" data-clock></span></strong>'+btn('휴식 시작','rest')+'</div>'+d.exercises.map((e,i)=>'<section class="card"><div class="row between"><div class="row">'+pose(e.name)+'<strong>'+esc(e.name)+'</strong></div>'+btn('종목 삭제','remove-exercise','danger',i)+'</div>'+e.sets.map((s,j)=>'<div class="set"><small>'+(j+1)+'</small><input aria-label="'+(j+1)+'세트 무게" placeholder="kg" inputmode="decimal" data-set="'+i+':'+j+':weight" value="'+esc(s.weight)+'" '+(s.checked?'disabled':'')+'><input aria-label="'+(j+1)+'세트 횟수" placeholder="횟수" inputmode="numeric" data-set="'+i+':'+j+':reps" value="'+esc(s.reps)+'" '+(s.checked?'disabled':'')+'>'+btn(s.checked?'✓':'○','check',s.checked?'checked':'',i+':'+j)+btn('×','remove-set','danger',i+':'+j)+'</div>').join('')+btn('＋ 세트 추가','add-set','',i)+'</section>').join('')+'<div class="stack">'+btn('＋ 종목 추가','picker')+btn('운동 완료','finish','primary')+btn('운동 취소','cancel','danger')+'</div>';
}
function routines() {
  return '<div class="row between"><h1>루틴</h1>'+btn('＋ 루틴 추가','routine-new','primary')+'</div>'+(state.routines.map(r=>'<section class="card"><h2>'+esc(r.title)+'</h2><p class="muted">'+(r.weekdays.map(d=>weekday[d-1]).join(' · ')||'요일 지정 없음')+'</p><p>'+r.exercises.map(e=>esc(e.name)+' '+e.sets.length+'세트').join(' · ')+'</p><div class="row">'+btn('시작','start','primary',r.id)+btn('편집','routine-edit','',r.id)+btn('삭제','routine-delete','danger',r.id)+'</div></section>').join('')||'<p class="muted">자주 하는 운동을 루틴으로 저장해 보세요.</p>');
}
function history() {
  if (activeRecord) {
    const w = state.workouts.find(item=>item.id===activeRecord);
    if (w) return btn('‹ 기록','back-record')+'<h1>'+esc(w.title)+'</h1><p class="muted">'+dateLabel(w.finishedAt)+'</p><div class="card">운동 시간 '+duration(new Date(w.finishedAt)-new Date(w.startedAt))+' · 총 볼륨 '+number(vol(w))+' kg</div>'+w.exercises.map(e=>'<div class="card"><div class="row">'+pose(e.name)+'<strong>'+esc(e.name)+'</strong></div>'+e.sets.map((s,i)=>'<p>'+(i+1)+'세트 · '+number(s.weightKg)+' kg × '+s.repetitions+'회</p>').join('')+'</div>').join('');
  }
  const first = new Date(month.getFullYear(),month.getMonth(),1);
  const length = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const marked = new Set(state.workouts.map(w=>dayKey(w.finishedAt)));
  return '<h1>기록</h1><section class="card"><div class="row between">'+btn('‹','month','',-1)+'<strong>'+month.toLocaleDateString('ko-KR',{year:'numeric',month:'long'})+'</strong>'+btn('›','month','',1)+'</div><div class="calendar">'+weekday.map(x=>'<small>'+x+'</small>').join('')+'<span></span>'.repeat(first.getDay())+Array.from({length},(_,i)=>{
    const d = new Date(first.getFullYear(),first.getMonth(),i+1);
    return btn((i+1)+(marked.has(dayKey(d))?'<i></i>':''),'day',dayKey(d)===dayKey(day)?'primary':'',i+1);
  }).join('')+'</div></section><h2>'+day.toLocaleDateString('ko-KR',{month:'long',day:'numeric'})+'</h2>'+recordList(sorted().filter(w=>dayKey(w.finishedAt)===dayKey(day)));
}
function statistics() {
  const timeline = Array.from({length:days},(_,i)=>{const d=new Date(); d.setDate(d.getDate()-days+1+i);return d;});
  const dateKeys = new Set(timeline.map(dayKey));
  const records = sorted().filter(w=>dateKeys.has(dayKey(w.finishedAt)));
  const names = [...new Set(records.flatMap(w=>w.exercises.map(e=>e.name)))];
  const selected = names.includes(movement)?movement:names[0];
  const trend = timeline.map(d=>{ const sets=records.filter(w=>dayKey(w.finishedAt)===dayKey(d)).flatMap(w=>w.exercises.filter(e=>e.name===selected).flatMap(e=>e.sets));return Math.max(0,...sets.map(s=>s.weightKg*(metric==='estimate'&&s.repetitions>1?1+s.repetitions/30:1))); });
  const bars = values => '<div class="bars">'+values.map((n,i)=>'<span title="'+esc(timeline[i].toLocaleDateString('ko-KR')+': '+number(n)+' kg')+'" style="height:'+Math.max(1,100*n/Math.max(1,...values))+'%"></span>').join('')+'</div>';
  return '<h1>통계</h1><div class="row">'+[7,30,90].map(d=>btn('최근 '+d+'일','period',d===days?'primary':'',d)).join('')+'</div><section class="card"><h2>운동 볼륨</h2><p>'+number(records.reduce((a,w)=>a+vol(w),0))+' kg · '+records.length+'회</p>'+bars(timeline.map(d=>records.filter(w=>dayKey(w.finishedAt)===dayKey(d)).reduce((a,w)=>a+vol(w),0)))+'</section>'+(selected?'<section class="card"><h2>종목별 중량</h2><select aria-label="종목" id="movement">'+names.map(n=>'<option '+(n===selected?'selected':'')+'>'+esc(n)+'</option>').join('')+'</select><div class="row section">'+btn('최고 중량','metric',metric==='weight'?'primary':'','weight')+btn('예상 1RM','metric',metric==='estimate'?'primary':'','estimate')+'</div><p>기간 최고 '+number(Math.max(...trend))+' kg</p>'+bars(trend)+'</section>':'');
}
function settings() {
  return '<h1>설정</h1><section class="card"><h2>프로필</h2>'+btn(esc(state.name||'이름 입력'),'name')+'</section><section class="card"><h2>운동</h2><label>기본 휴식 (초) <input id="rest-seconds" type="number" min="15" max="300" step="1" value="'+state.rest+'"></label><p><label><input id="rest-sound" type="checkbox" '+(state.restSound?'checked':'')+'> 휴식 종료음</label></p><small>세트마크 화면을 보고 있을 때 재생돼요.</small></section><section class="card stack"><h2>데이터</h2>'+btn('JSON으로 내보내기','export')+'<small>운동과 루틴은 이 기기의 웹앱에 저장돼요.</small></section><section class="card stack"><h2>앱 업데이트</h2>'+btn(registration?.waiting?'업데이트 적용':'업데이트 확인',registration?.waiting?'apply':'update',registration?.waiting?'primary':'')+'</section><section class="card"><h2>홈 화면에 추가</h2><p>iPhone Safari의 공유 메뉴에서 <strong>홈 화면에 추가</strong>를 선택하세요. 표시되면 <strong>웹 앱으로 열기</strong>를 켜세요.</p></section>';
}
function pickerResults() {
  const q = query.trim().toLowerCase();
  const matches = Object.entries(catalog).filter(([group])=>!category||group===category)
    .map(([group,names])=>[group,names.filter(n=>n.toLowerCase().includes(q))]).filter(([,names])=>names.length);
  const custom = !category && q && !Object.values(catalog).flat().some(n=>n.toLowerCase()===q);
  return (custom ? btn('＋ ‘'+esc(query.trim())+'’ 추가','choose','exercise',query.trim()) : '')+matches.map(([group,names])=>'<h3>'+group+'</h3>'+names.map(n=>btn(pose(n)+esc(n),'choose','exercise',n)).join('')).join('') || '<p class="muted">검색 결과가 없어요.</p>';
}
function modal() {
  if (dialog==='name') return '<h2>어떻게 불러 드릴까요?</h2><form id="profile" class="stack"><input name="name" aria-label="이름 또는 별명" placeholder="이름 또는 별명" maxlength="32" value="'+esc(state.name)+'"><div class="row"><button class="primary">저장</button>'+btn(state.name===null?'건너뛰기':'취소','close')+'</div></form>';
  if (dialog==='picker') return '<header class="row between"><h2>종목 추가</h2>'+btn('닫기','close')+'</header><input id="search" class="wide" type="search" placeholder="종목 검색 또는 직접 입력" aria-label="종목 검색" value="'+esc(query)+'"><div class="chips">'+['',...Object.keys(catalog)].map(c=>btn(c||'전체','category',c===category?'primary':'',c)).join('')+'</div><div id="results">'+pickerResults()+'</div>';
  if (dialog==='routine') return '<header class="row between"><h2>루틴 편집</h2>'+btn('취소','close')+'</header><div class="stack"><input id="routine-title" placeholder="루틴 이름" aria-label="루틴 이름" value="'+esc(routine.title)+'"><div class="chips">'+weekday.map((d,i)=>btn(d,'weekday',routine.weekdays.includes(i+1)?'primary':'',i+1)).join('')+'</div>'+routine.exercises.map((e,i)=>'<div class="card"><strong>'+esc(e.name)+'</strong><div class="row">'+btn('−','routine-minus','',i)+'<span>'+e.sets.length+'세트</span>'+btn('＋','routine-plus','',i)+btn('삭제','routine-remove','danger',i)+'</div></div>').join('')+btn('종목 추가','picker')+btn('루틴 저장','routine-save','primary')+'</div>';
  if (dialog==='rest') return '<h2>휴식 타이머</h2><p class="clock" data-rest></p><div class="row">'+btn('건너뛰기','skip','primary')+btn('닫기','close')+'</div>';
  return '';
}
function render() {
  const y = scrollY;
  const active = tabs.indexOf(tab);
  app.innerHTML = '<main><button type="button" class="capsule" data-action="rest-detail" hidden><span class="ring"></span><span>휴식 <strong data-rest></strong></span></button>'+ (editor&&state.draft ? workout() : [home,routines,history,statistics,settings][active]())+'</main><nav class="tabbar" aria-label="주 메뉴" style="--tab:'+active+'">'+tabs.map((name,i)=>'<button type="button" data-action="tab" data-value="'+name+'" '+(!editor&&i===active?'aria-current="page"':'')+'><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[i]+'"/></svg>'+name+'</button>').join('')+'</nav>'+(dialog?'<dialog>'+modal()+'</dialog>':'');
  if (dialog) app.querySelector('dialog').showModal();
  scrollTo(0,y);
  tick();
}
function tick() {
  const d = state.draft;
  const remaining = Math.max(0,(d?.restEnd||0)-Date.now());
  const capsule = app.querySelector('.capsule');
  capsule.hidden = remaining===0;
  if (d?.restEnd && remaining === 0 && !document.hidden && announcedRestEnd !== d.restEnd) {
    announcedRestEnd = d.restEnd;
    notice('휴식이 끝났어요. 다음 세트를 시작하세요.');
    playRestSound();
  }
  capsule.querySelector('.ring').style.setProperty('--progress', (remaining ? Math.min(100,remaining/(d.restEnd-d.restStart)*100) : 0)+'%');
  app.querySelectorAll('[data-rest]').forEach(n=>n.textContent=duration(Math.ceil(remaining/1000)*1000));
  if (d) app.querySelectorAll('[data-clock]').forEach(n=>n.textContent=duration(Date.now()-new Date(d.startedAt)));
}
function prepareRestSound() {
  if (!state.restSound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    restAudio ??= new AudioContext();
    if (restAudio.state !== 'running') restAudio.resume().catch(() => {});
  } catch {
    // The on-screen alert works when audio is unavailable.
  }
}
function playRestSound() {
  if (!state.restSound || restAudio?.state !== 'running') return;
  const now = restAudio.currentTime;
  for (const [index, frequency] of [660, 880].entries()) {
    const tone = restAudio.createOscillator();
    const gain = restAudio.createGain();
    const start = now + index * 0.16;
    tone.type = 'sine';
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    tone.connect(gain).connect(restAudio.destination);
    tone.start(start);
    tone.stop(start + 0.15);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }
}
function startRest() {
  prepareRestSound();
  state.draft.restStart = Date.now();
  state.draft.restEnd = state.draft.restStart + state.rest*1000;
}
function openPicker() { category=''; query=''; dialog='picker'; }
function closeDialog() {
  if (dialog==='picker' && routine) dialog='routine';
  else {
    if (dialog==='name' && state.name===null) { state.name=''; save(); }
    if (dialog==='routine') routine=null;
    dialog='';
  }
}
function finish() {
  const d = state.draft;
  const exercises = d.exercises.map(e=>({...e,sets:e.sets.filter(s=>s.checked).map(s=>({id:s.id,weightKg:Number(s.weight.trim().replace(',','.')),repetitions:Number(s.reps)}))})).filter(e=>e.sets.length);
  if (!exercises.length) return notice('완료한 세트를 한 개 이상 체크해 주세요.');
  if (d.exercises.some(e=>e.sets.some(s=>!s.checked)) && !confirm('체크한 세트만 저장할까요?')) return;
  const {id,title,startedAt} = d;
  const record = {id,title,startedAt,finishedAt:new Date().toISOString(),exercises};
  state.workouts.push(record);
  state.draft=null;
  if (!save()) { state.workouts.pop(); state.draft=d; return; }
  editor=false; tab='기록'; activeRecord=id;
}
function download() {
  const data = {formatVersion:1, exportedAt:new Date().toISOString(), workouts:state.workouts, routines:state.routines.map(r=>({...r, exercises:r.exercises.map(e=>({...e,sets:e.sets.map(s=>({id:s.id,weightKg:Number(s.weight)||0,repetitions:Number(s.reps)||0}))}))}))};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='Setmark-'+new Date().toISOString().slice(0,10)+'.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
app.addEventListener('click', async event=>{
  const target=event.target.closest('[data-action]');
  if (!target) return;
  const {action,value}=target.dataset;
  const [i,j]=value.split(':').map(Number);
  const d=state.draft;
  switch (action) {
    case 'tab': tab=value; editor=false; activeRecord=null; window.scrollTo(0,0); break;
    case 'start': {
      const template=state.routines.find(r=>r.id===value);
      if (!d) state.draft={id:id(), title:template?.title||'자유 운동',startedAt:new Date().toISOString(),exercises:template?.exercises.map(e=>({...e,id:id(),sets:e.sets.map(()=>set())}))||[]};
      editor=true; window.scrollTo(0,0); save(); break;
    }
    case 'later': editor=false; tab='홈'; break;
    case 'cancel': if (confirm('진행 중인 운동을 삭제할까요?')) {state.draft=null; editor=false; save();} break;
    case 'finish': finish(); break;
    case 'rest': startRest(); save(); break;
    case 'rest-detail': dialog='rest'; break;
    case 'skip': if(d) d.restEnd=0; dialog=''; save(); break;
    case 'remove-exercise': if(confirm('이 종목을 삭제할까요?')) {d.exercises.splice(i,1);save();} break;
    case 'add-set': {
      const last=d.exercises[i].sets.at(-1);
      d.exercises[i].sets.push({...set(),weight:last?.weight||'',reps:last?.reps||''});save();break;
    }
    case 'remove-set': d.exercises[i].sets.splice(j,1);save();break;
    case 'check': {
      const s=d.exercises[i].sets[j];
      const weight=Number(s.weight.trim().replace(',','.')), reps=Number(s.reps);
      if (!s.checked && (!(weight>=0 && weight<=10000) || !Number.isInteger(reps) || reps<1 || reps>999)) return notice('무게와 횟수를 확인해 주세요.');
      s.checked=!s.checked;
      if (s.checked) startRest();
      save(); break;
    }
    case 'picker': openPicker(); break;
    case 'category': category=value; break;
    case 'choose': {
      const prior=sorted().flatMap(w=>w.exercises).find(e=>e.name.toLowerCase()===value.toLowerCase());
      const sets=!routine && prior ? prior.sets.map(s=>({...set(),weight:String(s.weightKg),reps:String(s.repetitions)})) : [set()];
      (routine||d).exercises.push({id:id(),name:value,sets});
      if(!routine) save();
      closeDialog(); break;
    }
    case 'close': closeDialog(); break;
    case 'routine-new': routine={id:id(),title:'',weekdays:[],exercises:[],createdAt:new Date().toISOString()};dialog='routine';break;
    case 'routine-edit': routine=structuredClone(state.routines.find(r=>r.id===value));dialog='routine';break;
    case 'weekday': routine.weekdays=routine.weekdays.includes(i)?routine.weekdays.filter(x=>x!==i):[...routine.weekdays,i].sort();break;
    case 'routine-minus': if(routine.exercises[i].sets.length>1) routine.exercises[i].sets.pop();break;
    case 'routine-plus': if(routine.exercises[i].sets.length<20) routine.exercises[i].sets.push(set());break;
    case 'routine-remove': routine.exercises.splice(i,1);break;
    case 'routine-save':
      routine.title=routine.title.trim();
      if(!routine.title||!routine.exercises.length) return notice('루틴 이름과 종목을 입력해 주세요.');
      state.routines=[...state.routines.filter(r=>r.id!==routine.id),routine];save();closeDialog();break;
    case 'routine-delete': if(confirm('이 루틴을 삭제할까요?')) {state.routines=state.routines.filter(r=>r.id!==value);save();}break;
    case 'record': tab='기록';activeRecord=value;window.scrollTo(0,0);break;
    case 'back-record': activeRecord=null;break;
    case 'month': month=new Date(month.getFullYear(),month.getMonth()+i,1);day=month;break;
    case 'day': day=new Date(month.getFullYear(),month.getMonth(),i);break;
    case 'period': days=i;break;
    case 'metric': metric=value;break;
    case 'name': dialog='name';break;
    case 'export': return download();
    case 'update':
      if(!registration) return notice('보안 연결에서 업데이트를 확인할 수 있어요.');
      try {await registration.update(); notice(registration.waiting?'새 버전을 적용할 수 있어요.':registration.installing?'새 버전을 준비하고 있어요.':'현재 최신 버전이에요.');}
      catch {return notice('네트워크에 연결한 뒤 다시 시도해 주세요.');}
      break;
    case 'apply':
      if (!registration?.waiting || !save()) return;
      applying=true;registration.waiting.postMessage('apply-update');return notice('업데이트를 적용하고 있어요.');
    default: return;
  }
  render();
});
app.addEventListener('input', event=>{
  const input=event.target;
  if(input.id==='search') {query=input.value;app.querySelector('#results').innerHTML=pickerResults();}
  if(input.id==='routine-title') routine.title=input.value;
  if(input.dataset.set) {
    const [i,j,field]=input.dataset.set.split(':');
    state.draft.exercises[i].sets[j][field]=input.value;
    save();
  }
});
app.addEventListener('change',event=>{
  if(event.target.id==='movement') {movement=event.target.value;render();}
  if(event.target.id==='rest-sound') {
    state.restSound = event.target.checked;
    if (state.restSound) prepareRestSound();
    save();
  }
  if(event.target.id==='rest-seconds') {
    state.rest=Math.min(300,Math.max(15,Math.round(Number(event.target.value)||90)));save();render();
  }
});
app.addEventListener('submit',event=>{
  if(event.target.id!=='profile') return;
  event.preventDefault();
  state.name=String(new FormData(event.target).get('name')).trim();
  if(save()) {dialog='';render();}
});
app.addEventListener('cancel',event=>{event.preventDefault();closeDialog();render();},true);
if(state.name===null) dialog='name';
render();
setInterval(tick,250);
document.addEventListener('visibilitychange',tick);
if('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying) location.reload();});
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
    registration=reg;
    const showUpdate=()=>{if(tab==='설정'&&!dialog&&!editor)render();};
    reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',showUpdate));
    showUpdate();
  }).catch(()=>{});
}
