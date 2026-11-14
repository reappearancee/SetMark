import { burnFitGuides } from './burnfit-guides.js';

function showInlineAnimation(dialog, name, file) {
  const figure = document.createElement('figure');
  figure.className = 'exercise-inline-demo';
  const image = document.createElement('img');
  image.alt = name + ' 운동 동작';
  const caption = document.createElement('figcaption');
  caption.textContent = '동작 이미지 · 번핏';
  image.addEventListener('error', () => {
    image.remove();
    caption.textContent = '동작 이미지를 불러오지 못했어요.';
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
  const heading = document.createElement('h3');
  heading.textContent = '운동 방법';
  dialog.append(heading);
  if (guide?.steps?.length) {
    const list = document.createElement('ol');
    for (const step of guide.steps) {
      const item = document.createElement('li');
      item.textContent = step;
      list.append(item);
    }
    dialog.append(list);
  } else {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = '이 종목의 단계별 안내는 아직 준비되지 않았어요.';
    dialog.append(message);
  }
  const trigger = document.activeElement;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger?.focus({preventScroll:true});
  }, {once:true});
}
