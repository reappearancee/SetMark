const smithPress = '스미스 머신 숄더 프레스';
const burnFitLibrary = 'https://burnfit.io/라이브러리/';
const burnFitPages = new Map([
  ['벤치 프레스', '벤치프레스/'],
  [smithPress, '스미스머신-오버헤드-프레스/'],
  ['인클라인 덤벨 프레스', '인클라인-덤벨-벤치프레스/'],
]);


const burnFitAnimations = new Map([
  ['벤치 프레스', 'BB_BP-1.gif'],
  [smithPress, 'SM_PRESS.gif'],
]);

function showInlineAnimation(dialog, name, file) {
  const figure = document.createElement('figure');
  figure.className = 'exercise-inline-demo';
  const image = document.createElement('img');
  image.alt = name + ' 운동 동작';
  const caption = document.createElement('figcaption');
  caption.textContent = '동작 이미지 · 번핏';
  image.addEventListener('error', () => {
    image.remove();
    caption.textContent = '동작 이미지를 불러오지 못했어요. 아래에서 원본을 열 수 있어요.';
  }, {once:true});
  image.src = new URL(file, 'https://burnfit.io/wp-content/uploads/').href;
  figure.append(image, caption);
  dialog.append(figure);
}

function mountPress(canvas) {
  const ctx = canvas.getContext('2d');
  let angle = -0.36, pitch = 0.12, pointer, frame, started = performance.now();
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pauseAt = started;
  const toggle = canvas.parentElement.querySelector('button');
  const updateLabel = () => {
    toggle.textContent = paused ? '재생' : '일시정지';
  };
  updateLabel();
  toggle.onclick = () => {
    const now = performance.now();
    if (paused) started += now - pauseAt;
    else pauseAt = now;
    paused = !paused;
    updateLabel();
  };

  canvas.onpointerdown = event => {
    if (pointer) return;
    pointer = {id:event.pointerId, x:event.clientX, y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = event => {
    if (pointer?.id !== event.pointerId) return;
    angle += (event.clientX-pointer.x)*0.014;
    pitch = Math.max(-0.45,Math.min(0.65,pitch+(event.clientY-pointer.y)*0.01));
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };
  canvas.onlostpointercapture = () => { pointer = null; };
  canvas.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key==='ArrowLeft') angle -= 0.14;
    if (event.key==='ArrowRight') angle += 0.14;
    if (event.key==='ArrowUp') pitch = Math.max(-0.45,pitch-0.1);
    if (event.key==='ArrowDown') pitch = Math.min(0.65,pitch+0.1);
  };

  // Build shaded 3D ellipsoids and rods, then project them from the current view.
  const skin = [180,193,187], target = [69,172,124], dark = [38,56,51], steel = [104,132,124];
  function draw(now) {
    const w = canvas.width, h = canvas.height;
    const scale = h/3.35;
    const c = Math.cos(angle), s = Math.sin(angle);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const pieces = [];
    const project = ([x,y,z]) => {
      const depth = x*s+z*c;
      const vertical = y-1.45;
      return [w/2+(x*c-z*s)*scale, h/2-(vertical*cp-depth*sp)*scale, depth*cp+vertical*sp];
    };
    function ellipsoid(center, radii, color, axis = [0,1,0]) {
      const length = Math.hypot(...axis);
      if (!length) return;
      const unit = axis.map(v=>v/length);
      const reference = Math.abs(unit[2]) < 0.8 ? [0,0,1] : [1,0,0];
      const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const edge = cross(unit,reference);
      const side = edge.map(v=>v/Math.hypot(...edge));
      const front = cross(side,unit);
      const rings = 8, slices = 12;
      const mesh = Array.from({length:rings+1},(_,i)=>Array.from({length:slices},(_,j)=>{
        const lat = Math.PI*i/rings, lon = Math.PI*2*j/slices;
        const x = Math.sin(lat)*Math.cos(lon), y = Math.cos(lat), z = Math.sin(lat)*Math.sin(lon);
        return project(center.map((v,k)=>v+side[k]*x*radii[0]+unit[k]*y*radii[1]+front[k]*z*radii[2]));
      }));
      for (let i=0;i<rings;i++) for (let j=0;j<slices;j++) {
        const next = (j+1)%slices;
        const vertices = [mesh[i][j],mesh[i+1][j],mesh[i+1][next],mesh[i][next]];
        const normal = cross(vertices[2].map((v,k)=>v-vertices[0][k]),vertices[3].map((v,k)=>v-vertices[1][k]));
        if (normal[2] <= 0) continue;
        const brightness = 0.63+0.37*Math.max(0,(-normal[0]+normal[1]+normal[2]*2)/(Math.hypot(...normal)*Math.sqrt(6)));
        pieces.push({vertices, depth:vertices.reduce((sum,v)=>sum+v[2],0)/4,
          fill:'rgb('+color.map(v=>Math.round(v*brightness)).join(',')+')'});
      }
    }
    function rod(a,b,r,color) {
      const axis = b.map((v,i)=>v-a[i]);
      ellipsoid(a.map((v,i)=>(v+b[i])/2),[r,Math.hypot(...axis)/2+r*0.45,r],color,axis);
    }
    const progress = (1-Math.cos(((paused?pauseAt:now)-started)*Math.PI/1800))/2;
    const bar = 1.85+progress*0.75;
    for (const side of [-1,1]) {
      const x = side*0.91;
      rod([x,0.08,-0.47],[x,2.85,-0.47],0.052,steel);
      rod([x,0.06,-0.65],[x,0.06,0.76],0.064,dark);
      rod([x,0.14,-0.47],[x,2.76,0.02],0.037,steel);
      const shoulder = [side*.28,1.71,0.02];
      // The elbow follows the bend of two fixed-length arm segments in the press plane.
      const hand = [side*.47,bar,0.11];
      const dx = Math.abs(hand[0]-shoulder[0]), dy = hand[1]-shoulder[1];
      const distance = Math.hypot(dx,dy);
      const bend = Math.sqrt(Math.max(0,.47**2-(distance/2)**2));
      const elbow = [side*(.375+dy/distance*bend),1.71+dy/2-dx/distance*bend,.07];
      ellipsoid(shoulder,[.115,.13,.12],target);
      rod(shoulder,elbow,.083,skin);
      rod(elbow,hand,.065,skin);
      ellipsoid(hand,[.071,.06,.065],skin);
      rod([side*.14,.94,.01],[side*.25,.8,.53],.12,dark);
      rod([side*.25,.8,.53],[side*.27,.17,.56],.076,skin);
      ellipsoid([side*.28,.11,.65],[.091,.06,.17],dark);
      ellipsoid([side*.85,bar,.11],[.17,.047,.17],dark,[1,0,0]);
    }
    rod([-.93,2.84,-.47],[.93,2.84,-.47],.05,steel);
    rod([-1.12,bar,.11],[1.12,bar,.11],.031,steel);
    rod([0,.12,-.15],[0,.8,-.15],.082,steel);
    ellipsoid([0,.82,.20],[.33,.068,.47],dark);
    rod([0,.87,-.17],[0,1.67,-.24],.16,dark);
    ellipsoid([0,1.1,.01],[.20,.27,.14],skin);
    ellipsoid([0,1.48,.02],[.28,.33,.17],skin);
    rod([0,1.73,.02],[0,1.88,.02],.075,skin);
    ellipsoid([0,1.99,.02],[.105,.142,.11],skin);
    ctx.clearRect(0,0,w,h);
    pieces.sort((a,b)=>a.depth-b.depth);
    for (const {vertices,fill} of pieces) {
      ctx.beginPath();
      vertices.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
      ctx.closePath();
      ctx.strokeStyle = fill;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}

export function showExerciseGuide(name, catalog) {
  const group = Object.keys(catalog).find(key=>catalog[key].includes(name));
  const dialog = document.createElement('dialog');
  dialog.className = 'exercise-guide-dialog';
  dialog.setAttribute('aria-labelledby','exercise-guide-name');
  dialog.innerHTML = '<header class="row between"><h2 id="exercise-guide-name"></h2><button type="button">닫기</button></header><p class="muted" data-guide-category></p>';
  dialog.querySelector('h2').textContent = name;
  dialog.querySelector('[data-guide-category]').textContent = group || '직접 추가한 종목';
  dialog.querySelector('header button').onclick = () => dialog.close();
  const animation = burnFitAnimations.get(name);
  if (animation) showInlineAnimation(dialog, name, animation);
  const demo = name === smithPress && !animation;
  if (demo) {
    dialog.insertAdjacentHTML('beforeend','<section class="exercise-demo"><canvas width="540" height="490" tabindex="0" aria-label="스미스 머신 숄더 프레스 3D 모델. 방향키로 회전"></canvas><div class="row between"><small>드래그해서 각도 바꾸기</small><button type="button">일시정지</button></div></section><h3>운동 방법</h3><p>스미스 머신 · 어깨와 삼두근</p><ol><li>벤치에 앉아 발을 바닥에 두고 바를 어깨 높이에서 잡아요.</li><li>몸통을 안정적으로 유지하면서 바를 위로 밀어요.</li><li>바를 천천히 시작 높이로 내려요.</li></ol>');
  }
  const page = burnFitPages.get(name);
  const reference = document.createElement('a');
  reference.className = 'exercise-reference';
  reference.href = new URL(page ?? '', burnFitLibrary).href;
  reference.target = '_blank';
  reference.rel = 'noopener noreferrer';
  reference.textContent = page ? '번핏에서 이 운동 동작 보기 ↗' : '번핏 운동 라이브러리 열기 ↗';
  dialog.append(reference);
  const trigger = document.activeElement;
  document.body.append(dialog);
  dialog.showModal();
  const stop = demo ? mountPress(dialog.querySelector('canvas')) : null;
  dialog.addEventListener('close', () => {
    stop?.();
    dialog.remove();
    trigger?.focus({preventScroll:true});
  }, {once:true});
}
