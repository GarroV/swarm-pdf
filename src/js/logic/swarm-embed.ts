// SWARM: режим встраивания. Swarm открывает редактор окном с iframe на `?embed=1`; там уже
// есть своя шапка с названием и закрытием, поэтому обвязка сайта BentoPDF (верхнее меню,
// «Back to Tools» в их каталог, хлебные крошки, подвал, заголовок) только мешает и уводит
// человека из окна. Вне `?embed=1` страница не меняется.

const HIDE = [
  'nav[data-simple-nav]',
  'nav[data-bentopdf-breadcrumb]',
  '#back-to-tools',
  'footer[data-simple-footer]',
  '#tool-uploader > h1',
].join(',');

export function applyEmbedMode(search: string = location.search): boolean {
  if (!new URLSearchParams(search).has('embed')) return false;
  document.documentElement.classList.add('swarm-embed');
  const style = document.createElement('style');
  style.textContent =
    `${HIDE}{display:none!important}` +
    '.swarm-embed #uploader{padding-top:16px;min-height:100vh}';
  document.head.appendChild(style);
  return true;
}

applyEmbedMode();
