const installed = matchMedia('(display-mode: standalone)').matches
  || navigator.standalone === true;

if (installed) {
  import('./app.js').then(() => {
    document.querySelector('#app').hidden = false;
  }).catch(() => {
    document.querySelector('#notice').textContent =
      '세트마크를 열지 못했어요. 인터넷에 연결한 뒤 다시 열어 주세요.';
  });
} else {
  location.replace(new URL('../install/', import.meta.url));
}
