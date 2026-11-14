import { burnFitGuides } from './burnfit-guides.js';

const burnFitLibrary = 'https://burnfit.io/라이브러리/';

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
  image.src = file;
  figure.append(image, caption);
  dialog.append(figure);
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
  const guide = burnFitGuides.get(name);
  if (guide?.gif) showInlineAnimation(dialog, name, guide.gif);
  else dialog.insertAdjacentHTML('beforeend','<p class="muted">연결된 동작 이미지가 없어요.</p>');
  const page = guide?.page;
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
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger?.focus({preventScroll:true});
  }, {once:true});
}
