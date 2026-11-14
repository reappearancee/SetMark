import { releases } from './changelog.js';
import { showExerciseGuide } from './exercise-guide.js';
import { catalog } from './catalog.js';
import { poses, keywords } from './poses.js';

const guideStyles = document.createElement('link');
guideStyles.rel = 'stylesheet';
guideStyles.href = new URL('./exercise-guide.css', import.meta.url).href;
document.head.append(guideStyles);

// The app module only loads in standalone mode. Keep the install page zoomable.
document.documentElement.classList.add('setmark-app');
const viewport = document.querySelector('meta[name="viewport"]');
viewport?.setAttribute('content',
  'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');

const preventZoom = event => {
  if (event.cancelable) event.preventDefault();
};
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, preventZoom, {passive:false});
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) preventZoom(event);
}, {passive:false});


const key = 'setmark.web.v1';
const defaults = { name: null, rest: 90, restEnabled: false, restSound: true, draft: null, workouts: [], routines: [] };
const app = document.querySelector('#app');
let state;
try { state = { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
catch { state = { ...defaults }; }
let tab = '홈', editor = false, routine = null, dialog = '', category = '', query = '';
let recordDraft = null;
let activeRecord = null, day = new Date(), month = new Date(), days = 30, metric = 'weight', movement = '';
let registration, applying = false, noticeTimer;
let restAudio;
let restExercise, restExerciseIndex, defaultRestDraft;
let routineScroll = 0;
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
function recordElapsed(record) {
  const elapsed = record.elapsedMs ?? (Date.parse(record.finishedAt) - Date.parse(record.startedAt));
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}
const isCardio = exercise => exercise.kind === 'cardio';
const vol = workout => workout.exercises.filter(e=>!isCardio(e)).flatMap(e=>e.sets)
  .reduce((total,s)=>total+s.weightKg*s.repetitions,0);
const cardioTotal = workout => workout.exercises.filter(isCardio).flatMap(e=>e.sets)
  .reduce((total,s)=>total+s.minutes,0);
const parseMinutes = value => Number(String(value ?? '').trim().replace(',','.'));
const paceLabel = name => ['천국의 계단','스텝퍼','스텝밀'].includes(name) ? '레벨' : '속도';
const validPace = value => {
  const pace = parseMinutes(value);
  return pace >= 0 && pace <= 999;
};
function cardioEntry(entry) {
  return {id:entry.id, minutes:parseMinutes(entry.minutes),
    ...(String(entry.pace ?? '').trim() ? {pace:parseMinutes(entry.pace)} : {})};
}
const validMinutes = value => { const minutes = parseMinutes(value); return minutes > 0 && minutes <= 1440; };
const number = x => Number(x).toLocaleString('ko-KR',{maximumFractionDigits:2});
const sorted = () => [...state.workouts].sort((a,b)=>new Date(b.finishedAt)-new Date(a.finishedAt));
const btn = (label, action, css='', value='', disabled=false) => '<button type="button" data-action="'+action+'" data-value="'+esc(value)+'" class="'+css+'"'+(disabled?' disabled':'')+'>'+label+'</button>';

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
  if (catalog['유산소'].includes(name)) {
    return '<svg aria-hidden="true" class="pose" viewBox="0 0 48 48" fill="none" stroke="#25805a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="30" cy="10" r="3" fill="#25805a"/><path d="m27 16-7 10 8 5 5 9m-12-14-4 9-8 3m17-21 6 6 8-2m-15-4-8-1-6 6"/></svg>';
  }
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
  return '<h1>세트마크</h1><p class="muted">'+(state.name ? esc(state.name)+'님 안녕하세요.' : '안녕하세요.')+'</p><section class="hero"><small>'+today.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})+'</small><h2>오늘의 운동</h2>'+(state.draft?.startedAt?'<p>운동 시간 <strong class="clock" data-clock></strong></p>':'')+btn(state.draft?.startedAt?'운동 이어서 기록':state.draft?'운동 준비 이어서':'▶ 자유 운동 시작','start','primary wide')+'</section><section><h2>오늘의 루틴</h2>'+(plans.map(r=>btn(esc(r.title),'start','exercise',r.id)).join('')||'<p class="muted">오늘 예정된 루틴이 없어요.</p>')+'</section><section class="section"><h2>최근 기록</h2>'+recordList(sorted().slice(0,3))+'</section>';
}
function restControls(seconds, action) {
  return '<div class="rest-controls" role="group" aria-label="휴식 시간">'
    + '<button type="button" aria-label="휴식 15초 줄이기" data-action="'+action+'" data-value="-15" '+(seconds<=15?'disabled':'')+'>−</button>'
    + '<output class="clock" aria-label="휴식 시간">'+duration(seconds*1000)+'</output>'
    + '<button type="button" aria-label="휴식 15초 늘리기" data-action="'+action+'" data-value="15" '+(seconds>=300?'disabled':'')+'>＋</button></div>';
}
function adjustedRest(seconds, delta) {
  return Math.max(15, Math.min(300, seconds + delta));
}
function restFor(workout, exercise, entry) {
  if (!state.restEnabled || workout?.restEnabled === false || exercise?.restSeconds === 0) return 0;
  return entry?.restSeconds ?? exercise?.restSeconds ?? workout?.restSeconds ?? state.rest;
}
function restLabel(seconds) {
  return seconds ? duration(seconds*1000) : 'OFF';
}
function restBadge(workout, exercise) {
  if (!state.restEnabled || isCardio(exercise)) return '';
  return '<span class="rest-badge"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="14" r="7"/><path d="M12 14V9M9 3h6"/></svg>'
    + restLabel(restFor(workout,exercise))+'</span>';
}
function timePicker(seconds, prefix) {
  const select = (part, count, selected, unit) => '<label><span>'+unit+'</span><select id="'+prefix+'-'+part+'">'
    + Array.from({length:count},(_,i)=>'<option value="'+i+'" '+(selected===i?'selected':'')+'>'+i+' '+unit+'</option>').join('')
    + '</select></label>';
  return '<div class="rest-time-picker">'+select('minutes',6,Math.floor(seconds/60),'분')
    + select('seconds',60,seconds%60,'초')+'</div>';
}
function restSelect(entry, inherited, index) {
  const values = new Set(Array.from({length:20},(_,i)=>(i+1)*15));
  if (entry.restSeconds != null) values.add(entry.restSeconds);
  const options = [...values].sort((a,b)=>a-b).map(seconds=>'<option value="'+seconds+'" '
    +(entry.restSeconds===seconds?'selected':'')+'>'+restLabel(seconds)+'</option>').join('');
  return '<label class="rest-option"><span>'+(index+1)+'세트</span><select data-rest-setting="'+index+'">'
    + '<option value="">따르기 ('+restLabel(inherited)+')</option>'+options+'</select></label>';
}
function exerciseRestModal() {
  const seconds = restExercise.restSeconds;
  const routineRest = {...routine,restEnabled:routine.restEnabled === true};
  const mode = seconds === 0 ? 'off' : seconds == null ? 'inherit' : 'custom';
  const option = (value,label) => '<label class="rest-option"><span>'+label+'</span><input type="radio" name="exercise-rest-mode" value="'+value+'" '+(mode===value?'checked':'')+'></label>';
  return '<header class="row between"><h2>휴식 타이머 설정</h2>'+btn('닫기','close')+'</header>'
    + '<p class="muted">'+esc(restExercise.name)+'</p>'
    + btn('설정 ›','default-rest','wide')
    + option('inherit','기본값 따르기 · '+restLabel(restFor(routineRest)))
    + option('off','OFF')+option('custom','이 운동만')
    + (mode==='custom'?timePicker(seconds,'exercise-rest'):'')
    + (mode!=='off'&&restExercise.sets.length
      ? '<details data-set-rest="'+esc(restExercise.id)+'"><summary>세트별 휴식 설정</summary>'
        + restExercise.sets.map((entry,i)=>restSelect(entry,restFor(routineRest,restExercise),i)).join('')+'</details>' : '')
    + btn('확인','exercise-rest-save','primary wide rest-confirm');
}
function routineSets(exercise, index) {
  return exercise.sets.map((entry, i) => {
    const number = i + 1;
    const input = (field, title, mode) => '<input aria-label="'+number+'세트 '+title+'" placeholder="'+title+'" inputmode="'+mode+'" data-routine-set="'+index+':'+i+':'+field+'" value="'+esc(entry[field])+'">';
    if (isCardio(exercise)) {
      return '<div class="routine-set"><small>'+(i+1)+'회차</small>' +input('pace',paceLabel(exercise.name),'decimal')+input('minutes','시간 (분)','decimal')+'</div>';
    }
    return '<div class="routine-set"><small>' +number+'세트</small>'
      + input('weight','무게 (kg)','decimal') + input('reps','횟수','numeric') + '</div>';
  }).join('');
}
function validSet(entry, optional = false) {
  const weight = Number(entry.weight.trim().replace(',','.'));
  const reps = Number(entry.reps);
  return weight >= 0 && weight <= 10000
    && ((optional && !entry.reps.trim()) || (Number.isInteger(reps) && reps >= 1 && reps <= 999));
}
function workoutElapsed(draft, now = Date.now()) {
  const runningSince = draft.timerRunningSince;
  if (runningSince === undefined) return Math.max(0, now - Date.parse(draft.startedAt));
  return draft.timerElapsedMs + (runningSince === null ? 0 : Math.max(0, now - runningSince));
}
function changeWorkoutTimer(draft, deltaMinutes) {
  const now = Date.now();
  const paused = draft.timerRunningSince === null;
  const previous = { elapsed: draft.timerElapsedMs, since: draft.timerRunningSince };
  draft.timerElapsedMs = Math.max(0, workoutElapsed(draft, now) + (deltaMinutes ?? 0) * 60000);
  draft.timerRunningSince = (deltaMinutes === undefined ? !paused : paused) ? null : now;
  if (!save()) {
    draft.timerElapsedMs = previous.elapsed;
    draft.timerRunningSince = previous.since;
  }
}
function workoutTimer(draft) {
  const paused = draft.timerRunningSince === null;
  const label = paused ? '운동 타이머 재생' : '운동 타이머 일시정지';
  const toggle = '<button type="button" class="timer-toggle" data-action="toggle-workout-timer" data-value="" aria-label="'+label+'">'+(paused?'▶':'Ⅱ')+'</button>';
  const adjust = [1,5,10,-1,-5,-10].map(minutes => {
    const signed = minutes > 0 ? '+'+minutes : '−'+Math.abs(minutes);
    const label = '운동 시간 '+Math.abs(minutes)+'분 '+(minutes>0?'추가':'차감');
    return '<button type="button" data-action="adjust-workout-timer" data-value="'+minutes+'" aria-label="'+label+'">'+signed+'m</button>';
  }).join('');
  return '<section class="card workout-timer"><div class="row"><strong>운동 시간</strong><strong class="clock workout-time" data-clock></strong>'+toggle+(paused?'<small>일시정지</small>':'')+'</div>'
    + '<div class="timer-adjust" role="group" aria-label="운동 시간 조절">'+adjust+'</div></section>';
}
function cardioRow(entry, exercise, index, started, name) {
  const position = exercise+':'+index;
  const input = (field,label) => '<input aria-label="'+label+'" placeholder="'+label+'" inputmode="decimal" data-set="'+position+':'+field+'" value="'+esc(entry[field])+'" '+(entry.checked?'disabled':'')+'>';
  return '<div class="set"><small>'+(index+1)+'</small>'+input('pace',paceLabel(name))+input('minutes','시간 (분)')
    +btn(entry.checked?'✓':'○','check',entry.checked?'checked':'',position,!started)
    +btn('×','remove-set','danger',position)+'</div>';
}
function workout() {
  const d = state.draft;
  const started = Boolean(d.startedAt);
  const guide = '<aside class="workout-guide" aria-label="운동 안내">'
    + '<strong>'+(started ? '운동 중' : '운동 준비')+'</strong>'
    + (started
      ? '<p>운동이 끝났다면 <b>운동 완료</b>를 눌러 기록을 저장해 주세요.</p><p>기록을 버리려면 <b>운동 취소</b>를 눌러 주세요.</p>'
      : '<p>준비가 됐다면 <b>운동 시작</b> 버튼을 눌러 주세요.</p>')
    + '</aside>';
  const restPanel = started && restFor(d)
    ? '<section class="card"><h2>휴식 타이머</h2><div class="row between">'
      + restControls(d.restSeconds ?? state.rest,'workout-rest') + btn('휴식 시작','rest','primary','',!started)
      + '</div><small>세트를 체크하면 세트별·종목별 설정을 우선 적용해요.</small></section>'
    : '';
  const clock = started ? workoutTimer(d) : '';
  const actions = started
    ? btn('운동 완료','finish','primary') + btn('운동 취소','cancel','danger')
    : '<hr style="width:100%;margin:4px 0;border:0;border-top:1px solid var(--line)">'
      + btn('운동 시작','begin-workout','primary wide');
  return '<header class="row between"><h1>'+esc(d.title)+'</h1>'+btn('홈으로','later')+'</header>'+guide+clock+restPanel+d.exercises.map((e,i)=>'<section class="card"><div class="row between"><div class="row">'+pose(e.name)+exerciseInfo(e.name)+'</div>'+restBadge(d,e)+'</div>'+e.sets.map((s,j)=>isCardio(e) ? cardioRow(s,i,j,started,e.name) : '<div class="set"><small>'+(j+1)+'</small><input aria-label="'+(j+1)+'세트 무게" placeholder="kg" inputmode="decimal" data-set="'+i+':'+j+':weight" value="'+esc(s.weight)+'" '+(s.checked?'disabled':'')+'><input aria-label="'+(j+1)+'세트 횟수" placeholder="횟수" inputmode="numeric" data-set="'+i+':'+j+':reps" value="'+esc(s.reps)+'" '+(s.checked?'disabled':'')+'>'+btn(s.checked?'✓':'○','check',s.checked?'checked':'',i+':'+j,!started)+btn('×','remove-set','danger',i+':'+j)+'</div>').join('')+'<div class="exercise-actions">'+btn(isCardio(e)?'＋ 회차 추가':'＋ 세트 추가','add-set','',i)+btn('종목 삭제','remove-exercise','danger',i)+'</div></section>').join('')+'<div class="stack">'+btn('＋ 종목 추가','picker')+actions+'</div>';
}
function routinePreview(exercises) {
  const visibleCount = 5;
  const extra = exercises.length - visibleCount;
  const icons = exercises.slice(0, visibleCount).map(exercise => pose(exercise.name)).join('');
  return '<div class="routine-preview" role="img" aria-label="운동 종목 '+exercises.length+'개">'
    + icons + (extra > 0 ? '<span class="routine-preview-more">+'+extra+'</span>' : '') + '</div>';
}
function routines() {
  return '<div class="row between"><h1>루틴</h1>'+btn('＋ 루틴 추가','routine-new','primary')+'</div>'+(state.routines.map(r=>'<section class="card"><h2>'+esc(r.title)+'</h2><p class="muted">'+(r.weekdays.map(d=>weekday[d-1]).join(' · ')||'요일 지정 없음')+'</p>'+routinePreview(r.exercises)+'<div class="row">'+btn('시작','start','primary',r.id)+btn('편집','routine-edit','',r.id)+btn('삭제','routine-delete','danger',r.id)+'</div></section>').join('')||'<p class="muted">자주 하는 운동을 루틴으로 저장해 보세요.</p>');
}
function recordDetail(record) {
  const date = new Date(record.finishedAt).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
  const editing = recordDraft?.id === record.id;
  const workout = editing ? recordDraft : record;
  const metric = (label,value) => '<div class="row between"><span>'+label+'</span><strong>'+value+'</strong></div>';
  const field = (label,key,value,mode='decimal') => '<label>'+label+'<input data-record-field="'+key+'" inputmode="'+mode+'" value="'+esc(value)+'"></label>';
  const details = workout.exercises.map((exercise,i)=>{
    const cardio = isCardio(exercise);
    const group = Object.keys(catalog).find(key=>catalog[key].includes(exercise.name));
    const fields = cardio ? [[paceLabel(exercise.name),'pace',''],['시간 (분)','minutes','분']]
      : [['무게 (kg)','weightKg',' kg'],['횟수','repetitions','회']];
    const rows = exercise.sets.map((entry,j)=>'<div class="record-set"><small>'+(j+1)+'</small>'
      +fields.map(([label,key,unit])=>editing
        ? field(label,i+':'+j+':'+key,entry[key],key==='repetitions'?'numeric':'decimal')
        : '<span>'+ (entry[key]==null?'—':number(entry[key])+unit)+'</span>').join('')
      +(editing?'':'<span class="record-check" aria-label="완료">✓</span>')+'</div>').join('');
    return '<section class="card record-exercise"><div class="row">'+pose(exercise.name)
      +'<div>'+ (group?'<small>'+esc(group)+'</small>':'')+'<strong>'+esc(exercise.name)+'</strong></div></div>'
      +'<div class="record-exercise-total">'+metric(cardio?'유산소 시간':'종목 볼륨',number(cardio?cardioTotal({exercises:[exercise]}):vol({exercises:[exercise]}))+(cardio?'분':' kg'))+'</div>'+rows+'</section>';
  }).join('');
  return '<header class="row between">'+btn('‹ 기록','back-record','', '',editing)+'<strong>'+date+'</strong></header>'
    +'<div class="row between record-heading"><h1>운동 요약</h1>'+ (editing?btn('취소','discard-record-edit'):btn('편집','edit-record','',record.id))+'</div>'
    +'<section class="card record-summary"><strong>'+esc(record.title)+'</strong>'
    +metric('운동 시간',editing?('<span class="record-duration-fields">'+field('분','durationMinutes',workout.durationMinutes,'numeric')+field('초','durationSeconds',workout.durationSeconds,'numeric')+'</span>'):duration(recordElapsed(record)))
    +metric('운동 개수',record.exercises.length+'개')+metric('전체 볼륨',number(vol(record))+' kg')
    +(cardioTotal(record)?metric('유산소 시간',number(cardioTotal(record))+'분'):'')
    +'<div class="record-memo"><strong>메모</strong>'
    +(editing?'<textarea data-record-field="memo" aria-label="운동 메모" maxlength="2000" placeholder="오늘 운동은 어땠나요?">'+esc(workout.memo)+'</textarea>'
      :'<p>'+esc(record.memo || '작성한 메모가 없어요.')+'</p>')+'</div></section>'+details
    +(editing?btn('변경 저장','save-record','primary wide',record.id):btn('기록 삭제','delete-record','danger wide',record.id));
}
function saveRecordEdit() {
  const minutes = Number(recordDraft.durationMinutes);
  const seconds = Number(recordDraft.durationSeconds);
  const index = state.workouts.findIndex(w=>w.id===recordDraft.id);
  if (index<0) return;
  if (!/^\d+$/.test(recordDraft.durationMinutes.trim()) || !/^\d+$/.test(recordDraft.durationSeconds.trim()) || seconds>59) {
    return notice('분은 0 이상의 정수, 초는 0~59로 입력해 주세요.');
  }
  const edited = structuredClone(recordDraft);
  for (const exercise of edited.exercises) {
    for (const entry of exercise.sets) {
      if (isCardio(exercise)) {
        if (!validMinutes(entry.minutes) || !validPace(entry.pace)) return notice('유산소 시간과 속도 또는 레벨을 확인해 주세요.');
        entry.minutes = parseMinutes(entry.minutes);
        if (String(entry.pace ?? '').trim()) entry.pace = parseMinutes(entry.pace);
        else delete entry.pace;
      } else {
        if (!validSet({weight:String(entry.weightKg),reps:String(entry.repetitions)})) return notice('세트 무게와 횟수를 확인해 주세요.');
        entry.weightKg = parseMinutes(entry.weightKg);
        entry.repetitions = Number(entry.repetitions);
      }
    }
  }
  const original = recordElapsed(state.workouts[index]);
  const totalSeconds = minutes*60+seconds;
  edited.elapsedMs = totalSeconds===Math.floor(original/1000) ? original : totalSeconds*1000;
  if (!Number.isSafeInteger(edited.elapsedMs)) return notice('운동 시간이 너무 길어요.');
  edited.memo = (edited.memo ?? '').trim();
  delete edited.durationMinutes;
  delete edited.durationSeconds;
  const previous = state.workouts[index];
  state.workouts[index] = edited;
  if (!save()) { state.workouts[index] = previous; return; }
  recordDraft = null;
  window.scrollTo(0,0);
  notice('운동 기록을 수정했어요.');
}
function history() {
  if (activeRecord) {
    const w = state.workouts.find(item=>item.id===activeRecord);
    if (w) return recordDetail(w);
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
  const totalElapsed = records.reduce((total, workout) => total + recordElapsed(workout), 0);
  const timeSummary = '<section class="card stats-time"><h2>최근 '+days+'일 운동한 시간</h2>'
    +'<strong class="clock">'+duration(totalElapsed)+'</strong></section>';
  const names = [...new Set(records.flatMap(w=>w.exercises.filter(e=>!isCardio(e)).map(e=>e.name)))];
  const selected = names.includes(movement)?movement:names[0];
  const trend = timeline.map(d=>{ const sets=records.filter(w=>dayKey(w.finishedAt)===dayKey(d)).flatMap(w=>w.exercises.filter(e=>!isCardio(e)&&e.name===selected).flatMap(e=>e.sets));return Math.max(0,...sets.map(s=>s.weightKg*(metric==='estimate'&&s.repetitions>1?1+s.repetitions/30:1))); });
  const cardioMinutes = records.reduce((total,w)=>total+cardioTotal(w),0);
  const bars = values => '<div class="bars">'+values.map((n,i)=>'<span title="'+esc(timeline[i].toLocaleDateString('ko-KR')+': '+number(n)+' kg')+'" style="height:'+Math.max(1,100*n/Math.max(1,...values))+'%"></span>').join('')+'</div>';
  return '<h1>통계</h1><div class="row">'+[7,30,90].map(d=>btn('최근 '+d+'일','period',d===days?'primary':'',d)).join('')+'</div>'+timeSummary+'<section class="card"><h2>운동 볼륨</h2><p>'+number(records.reduce((a,w)=>a+vol(w),0))+' kg · '+records.length+'회</p>'+bars(timeline.map(d=>records.filter(w=>dayKey(w.finishedAt)===dayKey(d)).reduce((a,w)=>a+vol(w),0)))+'</section>'+(cardioMinutes?'<section class="card"><h2>유산소 시간</h2><p>'+number(cardioMinutes)+'분</p></section>':'')+(selected?'<section class="card"><h2>종목별 중량</h2><select aria-label="종목" id="movement">'+names.map(n=>'<option '+(n===selected?'selected':'')+'>'+esc(n)+'</option>').join('')+'</select><div class="row section">'+btn('최고 중량','metric',metric==='weight'?'primary':'','weight')+btn('예상 1RM','metric',metric==='estimate'?'primary':'','estimate')+'</div><p>기간 최고 '+number(Math.max(...trend))+' kg</p>'+bars(trend)+'</section>':'');
}
const latestRelease = releases.at(-1).id;
const hasUnreadReleases = () => (state.seenRelease ?? 0) < latestRelease;
const newBadge = '<span class="release-new" aria-label="새 수정사항">N</span>';

function releaseDate(value) {
  const [,month,day,time] = value.match(/^\d{4}-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/);
  if (!time) return Number(month)+'월 '+Number(day)+'일';
  const [hour,minute] = time.split(':');
  return Number(month)+'월 '+Number(day)+'일 '+(Number(hour)<12?'AM':'PM')+(Number(hour)%12||12)+':'+minute;
}

function releaseBoard() {
  return '<header class="row between"><h2>수정사항</h2>'+btn('닫기','close')+'</header>'
    +'<small>한국 시간 · 확인된 시각은 패치 파일 생성 기준</small>'
    +[...releases].reverse().map(release=>'<article class="card release-entry"><div class="row between"><h3>'
      +esc(release.title)+'</h3><time>'+releaseDate(release.date)+'</time></div><ul>'
      +release.changes.map(change=>'<li>'+esc(change)+'</li>').join('')+'</ul></article>').join('');
}
function settings() {
  return '<h1>설정</h1><section class="card"><h2>프로필</h2>'+btn(esc(state.name||'이름 입력'),'name')+'</section><section class="card"><h2>운동</h2>'+btn('기본 휴식 타이머 · '+restLabel(restFor()),'default-rest','wide')+'<label class="rest-sound"><span>휴식 종료음</span><input id="rest-sound" type="checkbox" role="switch" '+(state.restSound?'checked':'')+'></label><small>세트마크 화면을 보고 있을 때 재생돼요.</small></section><section class="card stack"><h2>데이터</h2>'+btn('JSON으로 내보내기','export')+btn('JSON 적용하기','import')+'<input type="file" id="backup-file" accept=".json,application/json" hidden>'+ '<small>운동과 루틴은 이 기기의 웹앱에 저장돼요.</small></section><section class="card">'+btn('수정사항'+(hasUnreadReleases()?newBadge:''),'releases','wide release-link')+'</section>';
}
function exerciseInfo(name, content = esc(name)) {
  return '<button type="button" class="exercise-info" data-action="exercise-info" data-value="'+esc(name)+'" aria-label="'+esc(name)+' 운동 방법">'+content+'</button>';
}
function pickerResults() {
  const normalize = value => value.toLowerCase().replace(/[\s-]+/g,'');
  const q = normalize(query.trim());
  const matches = Object.entries(catalog).filter(([group])=>!category||group===category)
    .map(([group,names])=>[group,names.filter(n=>normalize(n).includes(q))]).filter(([,names])=>names.length);
  return matches.map(([group,names])=>'<h3>'+group+'</h3>'+names.map(n=>'<div class="picker-exercise">'+exerciseInfo(n,pose(n)+'<span>'+esc(n)+'</span>')+'<button type="button" data-action="choose" data-value="'+esc(n)+'" aria-label="'+esc(n)+' 추가">＋</button>'+'</div>').join('')).join('') || '<p class="muted">검색 결과가 없어요.</p>';
}
function modal() {
  if (dialog==='releases') return releaseBoard();
  if (dialog==='exercise-menu') return '<h2>'+esc(restExercise.name)+'</h2>'+btn('휴식 타이머 설정','exercise-rest','wide')+btn('닫기','close','wide');
  if (dialog==='exercise-rest') return exerciseRestModal();
  if (dialog==='default-rest') return '<header class="row between"><h2>기본 휴식 타이머</h2>'+btn('닫기','close')+'</header>'
    + '<label class="rest-option"><span>기본 타이머 사용</span><input id="rest-enabled" type="checkbox" role="switch" '+(defaultRestDraft.enabled?'checked':'')+'></label>'
    + (defaultRestDraft.enabled ? timePicker(defaultRestDraft.seconds,'default-rest') : '')
    + btn('저장','default-rest-save','primary wide rest-confirm');
  if (dialog==='name') return '<h2>어떻게 불러 드릴까요?</h2><form id="profile" class="stack"><input name="name" aria-label="이름 또는 별명" placeholder="이름 또는 별명" maxlength="32" value="'+esc(state.name)+'"><div class="row"><button class="primary">저장</button>'+btn(state.name===null?'건너뛰기':'취소','close')+'</div></form>';
  if (dialog==='picker') return '<header class="row between"><h2>종목 추가</h2>'+btn('닫기','close')+'</header><input id="search" class="wide" type="search" placeholder="종목 검색" aria-label="종목 검색" value="'+esc(query)+'"><div class="chips">'+['',...Object.keys(catalog)].map(c=>btn(c||'전체','category',c===category?'primary':'',c)).join('')+'</div><div id="results">'+pickerResults()+'</div>';
  if (dialog==='routine') return '<header class="row between"><h2>루틴 편집</h2>'+btn('취소','close')+'</header><div class="stack"><input id="routine-title" placeholder="루틴 이름" aria-label="루틴 이름" value="'+esc(routine.title)+'"><div class="chips">'+weekday.map((d,i)=>btn(d,'weekday',routine.weekdays.includes(i+1)?'primary':'',i+1)).join('')+ '</div>' + (state.restEnabled ? '<section class="card"><label class="rest-option"><span>루틴 휴식 타이머</span><input id="routine-rest-enabled" type="checkbox" role="switch" '
    +(routine.restEnabled?'checked':'')+'></label>'
    +(routine.restEnabled?restControls(routine.restSeconds ?? state.rest,'routine-rest'):'')
    +'</section>' : '')+routine.exercises.map((e,i)=>'<div class="card"><div class="row between"><div class="row routine-exercise-title">'+pose(e.name)+exerciseInfo(e.name)+'</div>'+restBadge({...routine,restEnabled:routine.restEnabled === true},e)
    +'</div><div data-routine-sets>'+routineSets(e,i)+'</div><div class="row routine-actions">'
    +btn('−','routine-minus','',i)+'<span data-routine-count>'+e.sets.length+(isCardio(e)?'회차':'세트')+'</span>'
    +btn('＋','routine-plus','',i)
    +(isCardio(e)||!state.restEnabled||!routine.restEnabled?'':'<button type="button" data-action="exercise-menu" data-value="'+i+'" aria-label="'+esc(e.name)+' 더 보기">⋯</button>')
    +btn('삭제','routine-remove','danger',i)+'</div></div>').join('')+btn('종목 추가','picker')+btn('루틴 저장','routine-save','primary')+'</div>';
  if (dialog==='rest') return '<h2>휴식 타이머</h2><p class="clock" data-rest></p><div class="row">'+btn('건너뛰기','skip','primary')+btn('닫기','close')+'</div>';
  return '';
}
function render() {
  const y = scrollY;
  const oldDialog = app.querySelector('dialog');
  const openRest = new Set(Array.from(app.querySelectorAll('[data-set-rest][open]'), item=>item.dataset.setRest));
  const dialogScroll = oldDialog?.scrollTop ?? 0;
  const active = tabs.indexOf(tab);
  app.innerHTML = '<main><button type="button" class="capsule" data-action="rest-detail" hidden><span class="ring"></span><span>휴식 <strong data-rest></strong></span></button><section class="update-banner card row between" data-update-banner hidden><strong>새 버전이 준비됐어요</strong>'+btn('업데이트','apply','primary')+'</section>'+ (editor&&state.draft ? workout() : [home,routines,history,statistics,settings][active]())+'</main><nav class="tabbar" aria-label="주 메뉴" style="--tab:'+active+'">'+tabs.map((name,i)=>'<button type="button" data-action="tab" data-value="'+name+'" '+(!editor&&i===active?'aria-current="page"':'')+'><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[i]+'"/></svg>'+name+(name==='설정'&&hasUnreadReleases()?newBadge:'')+'</button>').join('')+'</nav>'+(dialog?'<dialog>'+modal()+'</dialog>':'');
  if (dialog) {
    const current = app.querySelector('dialog');
    current.showModal();
    for (const item of current.querySelectorAll('[data-set-rest]')) {
      item.open = openRest.has(item.dataset.setRest);
    }
    current.scrollTop = dialog==='routine' && routineScroll ? routineScroll : dialogScroll;
    if (dialog==='routine') routineScroll = 0;
  }
  scrollTo(0,y);
  showUpdate();
  tick();
}
function tick() {
  const d = state.draft;
  const remaining = state.restEnabled ? Math.max(0,(d?.restEnd||0)-Date.now()) : 0;
  const capsule = app.querySelector('.capsule');
  capsule.hidden = remaining===0;
  if (state.restEnabled && d?.restEnd && remaining === 0 && !document.hidden && announcedRestEnd !== d.restEnd) {
    announcedRestEnd = d.restEnd;
    notice('휴식이 끝났어요. 다음 세트를 시작하세요.');
    playRestSound();
  }
  capsule.querySelector('.ring').style.setProperty('--progress', (remaining ? Math.min(100,remaining/(d.restEnd-d.restStart)*100) : 0)+'%');
  app.querySelectorAll('[data-rest]').forEach(n=>n.textContent=duration(Math.ceil(remaining/1000)*1000));
  if (d?.startedAt) app.querySelectorAll('[data-clock]').forEach(n=>n.textContent=duration(workoutElapsed(d)));
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
function startRest(seconds = restFor(state.draft)) {
  if (seconds <= 0) return;
  prepareRestSound();
  state.draft.restStart = Date.now();
  state.draft.restEnd = state.draft.restStart + seconds*1000;
}
function openPicker() { category=''; query=''; dialog='picker'; }
function closeDialog() {
  if (dialog==='default-rest') {
    dialog = restExercise ? 'exercise-rest' : '';
    return;
  }
  if (dialog==='exercise-menu' || dialog==='exercise-rest') {
    restExercise = null;
    dialog = 'routine';
    return;
  }
  if (dialog==='picker' && routine) dialog='routine';
  else {
    if (dialog==='name' && state.name===null) { state.name=''; save(); }
    if (dialog==='routine') routine=null;
    dialog='';
  }
}
function finish() {
  const d = state.draft;
  const exercises = d.exercises.map(e=>({...e,sets:e.sets.filter(s=>s.checked).map(s=>isCardio(e)?cardioEntry(s):{id:s.id,weightKg:Number(s.weight.trim().replace(',','.')),repetitions:Number(s.reps)})})).filter(e=>e.sets.length);
  if (!exercises.length) return notice('완료한 세트를 한 개 이상 체크해 주세요.');
  if (d.exercises.some(e=>e.sets.some(s=>!s.checked)) && !confirm('체크한 세트만 저장할까요?')) return;
  const {id,title,startedAt} = d;
  const finishedAt = new Date();
  const record = {id,title,startedAt,finishedAt:finishedAt.toISOString(),elapsedMs:workoutElapsed(d,finishedAt.getTime()),exercises};
  state.workouts.push(record);
  state.draft=null;
  if (!save()) { state.workouts.pop(); state.draft=d; return; }
  editor=false; tab='기록'; activeRecord=id;
}
function download() {
  const data = {formatVersion:1, exportedAt:new Date().toISOString(), workouts:state.workouts, routines:state.routines.map(r=>({...r, exercises:r.exercises.map(e=>({...e,sets:e.sets.map(s=>isCardio(e)?cardioEntry(s):{id:s.id,weightKg:Number(s.weight.trim().replace(',','.'))||0,repetitions:Number(s.reps)||0,restSeconds:s.restSeconds})}))}))};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='Setmark-'+new Date().toISOString().slice(0,10)+'.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function readBackup(data) {
  const validId = id => typeof id==='string' && id.trim().length>0;
  const validDate = value => typeof value==='string' && Number.isFinite(Date.parse(value));
  if (data?.formatVersion!==1 || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) {
    throw new Error('세트마크에서 내보낸 JSON 파일을 선택해 주세요.');
  }
  function records(items, routine) {
    const ids = new Set();
    return items.map(record=>{
      if (!validId(record?.id) || ids.has(record.id) || typeof record.title!=='string' || !Array.isArray(record.exercises)
        || (routine ? !Array.isArray(record.weekdays) || !record.weekdays.every(day=>Number.isInteger(day)&&day>=1&&day<=7)
          : !validDate(record.startedAt)||!validDate(record.finishedAt)
            || (record.elapsedMs!=null && (!Number.isSafeInteger(record.elapsedMs)||record.elapsedMs<0)))) {
        throw new Error('기록 또는 루틴의 형식이 올바르지 않아요.');
      }
      ids.add(record.id);
      const exercises = record.exercises.map(exercise=>{
        if (typeof exercise?.name!=='string' || !Array.isArray(exercise.sets)) throw new Error('운동 종목의 형식이 올바르지 않아요.');
        const sets = exercise.sets.map(entry=>{
          if (!entry || typeof entry!=='object') throw new Error('세트 정보가 올바르지 않아요.');
          if (isCardio(exercise)) {
            if (!(routine && entry.minutes===0) && !validMinutes(entry.minutes)) throw new Error('유산소 시간 정보가 올바르지 않아요.');
            if (entry.pace!=null && !validPace(entry.pace)) throw new Error('유산소 속도 정보가 올바르지 않아요.');
            if (!routine) return {...entry,minutes:parseMinutes(entry.minutes),pace:entry.pace==null?undefined:parseMinutes(entry.pace)};
            return {...entry,minutes:entry.minutes===0?'':String(entry.minutes),pace:String(entry.pace ?? '')};
          }
          const weight = String(entry.weightKg ?? '');
          const reps = routine && entry.repetitions===0 ? '' : String(entry.repetitions ?? '');
          if (!validSet({weight,reps},routine)) throw new Error('세트의 무게 또는 횟수가 올바르지 않아요.');
          return routine ? {...entry,weight,reps,checked:false} : {...entry,weightKg:parseMinutes(weight),repetitions:Number(reps)};
        });
        return {...exercise,sets};
      });
      return {...record,exercises};
    });
  }
  return {workouts:records(data.workouts,false),routines:records(data.routines,true)};
}
async function applyBackup(file) {
  try {
    const backup = readBackup(JSON.parse(await file.text()));
    if (!confirm('운동 기록 '+backup.workouts.length+'개와 루틴 '+backup.routines.length+'개를 적용할까요? 같은 기록은 파일 내용으로 갱신돼요.')) return;
    const previous = {workouts:state.workouts,routines:state.routines};
    const merge = (current,incoming) => [...new Map([...current,...incoming].map(record=>[record.id,record])).values()];
    state.workouts = merge(previous.workouts,backup.workouts);
    state.routines = merge(previous.routines,backup.routines);
    if (!save()) { Object.assign(state,previous); return; }
    render();
    notice('JSON 파일을 적용했어요.');
  } catch (error) {
    notice(error instanceof SyntaxError ? 'JSON 파일을 읽을 수 없어요.' : error.message);
  }
}
app.addEventListener('click', async event=>{
  const target=event.target.closest('[data-action]');
  if (!target) return;
  const {action,value}=target.dataset;
  const [i,j]=value.split(':').map(Number);
  const d=state.draft;
  switch (action) {
    case 'tab':
      if (recordDraft && !confirm('저장하지 않은 변경사항을 버릴까요?')) return;
      recordDraft=null; tab=value; editor=false; activeRecord=null; window.scrollTo(0,0); break;
    case 'start': {
      const template=state.routines.find(r=>r.id===value);
      if (!d) state.draft={id:id(), title:template?.title||'자유 운동',startedAt:null,restEnabled:template ? template.restEnabled === true : undefined,restSeconds:template?.restSeconds,exercises:template?.exercises.map(e=>({...e,id:id(),sets:e.sets.map(s=>({...set(),weight:s.weight,reps:s.reps,minutes:s.minutes,pace:s.pace,restSeconds:s.restSeconds}))}))||[]};
      editor=true; window.scrollTo(0,0); save(); break;
    }
    case 'begin-workout':
      if (!d || d.startedAt) return;
      d.startedAt = new Date().toISOString();
      if (!save()) { d.startedAt = null; return; }
      break;
    case 'toggle-workout-timer':
      if (d?.startedAt) changeWorkoutTimer(d);
      break;
    case 'adjust-workout-timer':
      if (d?.startedAt) changeWorkoutTimer(d,i);
      break;
    case 'later': editor=false; tab='홈'; break;
    case 'cancel': if (d?.startedAt && confirm('진행 중인 운동을 삭제할까요?')) {state.draft=null; editor=false; save();} break;
    case 'finish': if (d?.startedAt) finish(); break;
    case 'workout-rest':
      d.restSeconds = adjustedRest(d.restSeconds ?? state.rest, i);
      save(); break;
    case 'routine-rest':
      routine.restSeconds = adjustedRest(routine.restSeconds ?? state.rest, i);
      break;
    case 'rest': if (d?.startedAt) { startRest(); save(); } break;
    case 'rest-detail': dialog='rest'; break;
    case 'skip': if(d) d.restEnd=0; dialog=''; save(); break;
    case 'remove-exercise': if(confirm('이 종목을 삭제할까요?')) {d.exercises.splice(i,1);save();} break;
    case 'add-set': {
      const last=d.exercises[i].sets.at(-1);
      d.exercises[i].sets.push({...set(),weight:last?.weight||'',reps:last?.reps||'',minutes:last?.minutes||'',pace:last?.pace||''});save();break;
    }
    case 'remove-set': d.exercises[i].sets.splice(j,1);save();break;
    case 'check': {
      if (!d?.startedAt) return;
      const exercise=d.exercises[i];
      const s=exercise.sets[j];
      if (!s.checked && (isCardio(exercise) ? !validMinutes(s.minutes) : !validSet(s))) {
        return notice(isCardio(exercise) ? '유산소 시간을 분 단위로 입력해 주세요.' : '무게와 횟수를 확인해 주세요.');
      }
      if (!s.checked && isCardio(exercise) && !validPace(s.pace)) return notice('속도 또는 레벨을 0~999로 입력해 주세요.');
      s.checked=!s.checked;
      if (s.checked && !isCardio(exercise)) startRest(restFor(d,exercise,s));
      save(); break;
    }
    case 'exercise-info': showExerciseGuide(value,catalog); return;
    case 'picker': openPicker(); break;
    case 'category': category=value; break;
    case 'choose': {
      const cardio = catalog['유산소'].includes(value);
      const prior=sorted().flatMap(w=>w.exercises).find(e=>isCardio(e)===cardio && e.name.toLowerCase()===value.toLowerCase());
      const sets=!routine && prior ? prior.sets.map(s=>cardio ? {...set(),minutes:String(s.minutes),pace:String(s.pace ?? '')} : {...set(),weight:String(s.weightKg),reps:String(s.repetitions)}) : [set()];
      (routine||d).exercises.push({id:id(),name:value,kind:cardio?'cardio':undefined,sets});
      if(!routine) save();
      closeDialog(); break;
    }
    case 'close': closeDialog(); break;
    case 'routine-new': routine={id:id(),title:'',weekdays:[],restEnabled:false,exercises:[],createdAt:new Date().toISOString()};dialog='routine';break;
    case 'exercise-menu':
      restExerciseIndex = i;
      restExercise = structuredClone(routine.exercises[i]);
      routineScroll = app.querySelector('dialog').scrollTop;
      dialog='exercise-menu'; break;
    case 'exercise-rest': dialog='exercise-rest'; break;
    case 'exercise-rest-save':
      if (restExercise.restSeconds > 300) return notice('휴식 시간은 최대 5분이에요.');
      routine.exercises[restExerciseIndex] = restExercise;
      closeDialog(); break;
    case 'default-rest':
      defaultRestDraft = {enabled:state.restEnabled, seconds:state.rest};
      dialog='default-rest'; break;
    case 'default-rest-save': {
      if (defaultRestDraft.seconds > 300) return notice('휴식 시간은 최대 5분이에요.');
      const previous = {rest:state.rest,restEnabled:state.restEnabled};
      const draft = state.draft;
      const previousRestEnd = draft?.restEnd;
      Object.assign(state,{rest:defaultRestDraft.seconds,restEnabled:defaultRestDraft.enabled});
      if (!state.restEnabled && draft?.restEnd) draft.restEnd = 0;
      if (!save()) {
        Object.assign(state,previous);
        if (draft) draft.restEnd = previousRestEnd;
        return;
      }
      closeDialog(); break;
    }
    case 'routine-edit': routine=structuredClone(state.routines.find(r=>r.id===value));dialog='routine';break;
    case 'weekday': routine.weekdays=routine.weekdays.includes(i)?routine.weekdays.filter(x=>x!==i):[...routine.weekdays,i].sort();break;
    case 'routine-minus':
    case 'routine-plus': {
      const exercise = routine.exercises[i];
      const adding = action === 'routine-plus';
      if (adding ? exercise.sets.length >= 20 : exercise.sets.length <= 1) return;
      const controls = target.parentElement;
      const rows = controls.previousElementSibling;
      const count = controls.querySelector('[data-routine-count]');
      const panel = target.closest('dialog');
      const scroll = panel.scrollTop;
      if (adding) {
        exercise.sets.push(set());
        const template = document.createElement('template');
        template.innerHTML = routineSets(exercise,i);
        rows.append(template.content.lastElementChild);
      } else {
        exercise.sets.pop();
        rows.lastElementChild.remove();
      }
      count.textContent = exercise.sets.length + (isCardio(exercise) ? '회차' : '세트');
      panel.scrollTop = scroll;
      return;
    }
    case 'routine-remove': routine.exercises.splice(i,1);break;
    case 'routine-save':
      routine.title=routine.title.trim();
      if(!routine.title||!routine.exercises.length) return notice('루틴 이름과 종목을 입력해 주세요.');
      if (routine.exercises.some(e=>!isCardio(e)&&e.sets.some(s=>!validSet(s,true)))) {
        return notice('세트 무게는 0~10,000kg, 횟수는 1~999회로 입력해 주세요.');
      }
      if (routine.exercises.some(e=>isCardio(e)&&e.sets.some(s=>String(s.minutes ?? '').trim()&&!validMinutes(s.minutes)))) {
        return notice('유산소 시간은 0분 초과, 1440분 이하로 입력해 주세요.');
      }
      if (routine.exercises.some(e=>isCardio(e)&&e.sets.some(s=>!validPace(s.pace)))) {
        return notice('속도 또는 레벨을 0~999로 입력해 주세요.');
      }
      {
        const previous = state.routines;
        state.routines = previous.some(r=>r.id===routine.id)
          ? previous.map(r=>r.id===routine.id ? routine : r)
          : [...previous,routine];
        if (!save()) { state.routines = previous; return; }
        closeDialog();
      }
      break;
    case 'routine-delete': if(confirm('이 루틴을 삭제할까요?')) {state.routines=state.routines.filter(r=>r.id!==value);save();}break;
    case 'record': tab='기록';activeRecord=value;window.scrollTo(0,0);break;
    case 'edit-record': {
      const record = state.workouts.find(w=>w.id===value);
      if (!record || activeRecord!==value) return;
      recordDraft = structuredClone(record);
      const totalSeconds = Math.floor(recordElapsed(record)/1000);
      recordDraft.durationMinutes = String(Math.floor(totalSeconds/60));
      recordDraft.durationSeconds = String(totalSeconds%60).padStart(2,'0');
      window.scrollTo(0,0);
      break;
    }
    case 'discard-record-edit': recordDraft=null; break;
    case 'save-record': if (recordDraft?.id===value) saveRecordEdit(); break;
    case 'delete-record': {
      if (activeRecord !== value || !confirm('이 운동 기록을 삭제할까요? 삭제한 기록은 복구할 수 없어요.')) return;
      const previous = state.workouts;
      const record = previous.find(w=>w.id===value);
      if (!record) return;
      state.workouts = previous.filter(w=>w.id!==value);
      if (!save()) { state.workouts = previous; return; }
      day = month = new Date(record.finishedAt);
      activeRecord = null;
      window.scrollTo(0,0);
      break;
    }
    case 'back-record': activeRecord=null;break;
    case 'month': month=new Date(month.getFullYear(),month.getMonth()+i,1);day=month;break;
    case 'day': day=new Date(month.getFullYear(),month.getMonth(),i);break;
    case 'period': days=i;break;
    case 'metric': metric=value;break;
    case 'name': dialog='name';break;
    case 'import': app.querySelector('#backup-file').click(); return;
    case 'releases': {
      const previous = state.seenRelease;
      state.seenRelease = latestRelease;
      if (!save()) state.seenRelease = previous;
      dialog = 'releases';
      break;
    }
    case 'export': return download();
    case 'apply':
      if (applying || !registration?.waiting || !save()) return;
      applying=true;registration.waiting.postMessage('apply-update');return notice('업데이트를 적용하고 있어요.');
    default: return;
  }
  render();
});
app.addEventListener('input', event=>{
  const input=event.target;
  const recordField = input.dataset.recordField;
  if (recordField && recordDraft) {
    if (recordField==='memo') recordDraft.memo=input.value;
    else if (recordField==='durationMinutes' || recordField==='durationSeconds') recordDraft[recordField]=input.value;
    else {
      const [exercise,entry,key] = recordField.split(':');
      recordDraft.exercises[exercise].sets[entry][key]=input.value;
    }
    return;
  }
  if(input.id==='search') {query=input.value;app.querySelector('#results').innerHTML=pickerResults();}
  if(input.id==='routine-title') routine.title=input.value;
  if (input.dataset.routineSet) {
    const [i,j,field] = input.dataset.routineSet.split(':');
    routine.exercises[i].sets[j][field] = input.value;
  }
  if(input.dataset.set) {
    const [i,j,field]=input.dataset.set.split(':');
    state.draft.exercises[i].sets[j][field]=input.value;
    save();
  }
});
app.addEventListener('change',event=>{
  if (event.target.id==='backup-file') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void applyBackup(file);
    return;
  }
  const input = event.target;
  if (input.id === 'routine-rest-enabled' && routine) {
    routine.restEnabled = input.checked;
    render();
    return;
  }
  const setting = input.dataset.restSetting;
  if (setting !== undefined && restExercise) {
    const entry = restExercise.sets[Number(setting)];
    if (input.value === '') delete entry.restSeconds;
    else entry.restSeconds = Number(input.value);
    return;
  }
  if (input.name === 'exercise-rest-mode') {
    if (input.value === 'inherit') delete restExercise.restSeconds;
    else restExercise.restSeconds = input.value === 'off' ? 0 : routine.restSeconds ?? state.rest;
    render();
  }
  if (input.id === 'rest-enabled') {
    defaultRestDraft.enabled = input.checked;
    render();
  }
  const prefix = dialog === 'exercise-rest' ? 'exercise-rest' : 'default-rest';
  if (input.id === prefix+'-minutes' || input.id === prefix+'-seconds') {
    const minutes = Number(app.querySelector('#'+prefix+'-minutes').value);
    const seconds = Number(app.querySelector('#'+prefix+'-seconds').value);
    const total = minutes*60+seconds;
    if (prefix === 'exercise-rest') restExercise.restSeconds = Math.max(1,total);
    else defaultRestDraft.seconds = Math.max(1,total);
    if (!total) app.querySelector('#'+prefix+'-seconds').value = '1';
  }
  if(event.target.id==='movement') {movement=event.target.value;render();}
  if(event.target.id==='rest-sound') {
    state.restSound = event.target.checked;
    if (state.restSound) prepareRestSound();
    save();
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
function showUpdate() {
  const banner = app.querySelector('[data-update-banner]');
  if (banner) banner.hidden = !registration?.waiting || !navigator.serviceWorker.controller;
}
function checkForUpdate() {
  if (registration && !registration.waiting) registration.update().catch(() => {});
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
    else showUpdate();
  });
  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(reg => {
    registration = reg;
    const observeInstall = () => reg.installing?.addEventListener('statechange', showUpdate);
    reg.addEventListener('updatefound', observeInstall);
    observeInstall();
    showUpdate();
    checkForUpdate();
  }).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      showUpdate();
      checkForUpdate();
    }
  });
}
