const puppeteer = require('/Users/garva/sb-smoke/node_modules/puppeteer-core');
// Абзац № idx → выделить всё → шрифт fam → сохранить в dir/out. Проверка: pdffonts + pdfcheck.py.
const [, , chrome, dir, fam, idx] = process.argv;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-first-run'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 1000 });
  const cdp = await p.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dir + '/out',
  });
  p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 150)));
  p.on('console', (m) => {
    if (m.type() === 'error' || /swarm/.test(m.text()))
      console.log('console:', m.text());
  });
  await p.goto(process.env.BASE + '/edit-pdf-text', {
    waitUntil: 'networkidle0',
  });
  const input = (await p.$('#file-input')) || (await p.$('#file'));
  await input.uploadFile(dir + '/in.pdf');
  // Опрос страницы в первые секунды открытия файла вешает CDP-вызов (headless): ждём молча.
  await new Promise((r) => setTimeout(r, 20000));
  for (let i = 0; ; i++) {
    if (await p.$eval('#toolbar', (e) => !!e.offsetParent).catch(() => false))
      break;
    if (i > 180) throw new Error('editor did not open');
    await new Promise((r) => setTimeout(r, 500));
  }
  await p
    .waitForNetworkIdle({ idleTime: 1500, timeout: 60000 })
    .catch(() => {});
  await wait(2000);
  const boxes = await p.$$('.para-box');
  const box = await boxes[Number(idx)].boundingBox();
  await p.mouse.click(box.x + 5, box.y + box.height / 2);
  await wait(800);
  console.log(
    'editing:',
    await p
      .$eval('.editor [contenteditable]', (e) => e.textContent.slice(0, 60))
      .catch(() => 'none')
  );
  await p.evaluate(() => {
    const ed = document.querySelector('.editor [contenteditable]');
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(ed);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  console.log('selected:', await p.select('#fFamily', fam));
  await wait(2500);
  console.log(
    'spans:',
    await p.$$eval('.editor span[data-src]', (ss) =>
      [...new Set(ss.map((s) => s.dataset.family))].join('|')
    )
  );
  await p.focus('.editor [contenteditable]');
  await p.keyboard.press('Escape');
  await wait(1500);
  await p.click('#save');
  await wait(8000);
  console.log(
    'toast:',
    await p.$eval('#toast', (e) => e.textContent.trim()).catch(() => '')
  );
  await b.close();
})().catch((e) => {
  console.log('ERR', e.message);
  process.exit(1);
});
