const puppeteer = require('/Users/garva/sb-smoke/node_modules/puppeteer-core');
// Гонка шрифтов (#2): запасные Liberation задерживаются на FONT_DELAY мс, замена делается сразу
// после открытия. Запуск: BASE=<адрес> FONT_DELAY=45000 node race-run.cjs <chrome> <папка с in.pdf> <было> <стало>,
// затем pdfcheck.py <папка>/out/*.pdf --orig <папка>/in.pdf --replace <было>=<стало>.
const [, , chrome, dir, find, repl] = process.argv;
(async () => {
  const b = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-first-run'],
  });
  const p = await b.newPage();
  const cdp = await p.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dir + '/out',
  });
  // Гонка из swarm-pdf#2: запасные Liberation приходят позже, чем человек успевает править.
  const DELAY = Number(process.env.FONT_DELAY || 45000);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/\/fonts\/liberation\//.test(r.url())) {
      console.log('font delayed', r.url().split('/').pop());
      setTimeout(() => r.continue().catch(() => {}), DELAY);
    } else r.continue().catch(() => {});
  });
  p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 150)));
  await p.goto(
    (process.env.BASE || 'http://127.0.0.1:3091') + '/edit-pdf-text',
    { waitUntil: 'networkidle0' }
  );
  const input = (await p.$('#file-input')) || (await p.$('#file'));
  const t0 = Date.now();
  await input.uploadFile(dir + '/in.pdf');
  // Опрос страницы в первые секунды открытия файла вешает CDP-вызов (headless): ждём молча.
  await new Promise((r) => setTimeout(r, 20000));
  for (let i = 0; ; i++) {
    if (await p.$eval('#toolbar', (e) => !!e.offsetParent).catch(() => false))
      break;
    if (i > 180) throw new Error('editor did not open');
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 3000));
  console.log('toolbar at', Math.round((Date.now() - t0) / 1000), 's');
  await p.screenshot({ path: dir + '/race-wait.png' });
  for (
    let i = 0;
    i < 400 &&
    !(await p
      .evaluate(
        () => !document.body.innerText.includes('Loading PDF Text Editor')
      )
      .catch(() => false));
    i++
  )
    await new Promise((r) => setTimeout(r, 1000));
  console.log('doc at', Math.round((Date.now() - t0) / 1000), 's');
  await p.click('#find');
  await p.waitForSelector('#findText', { visible: true });
  await p.type('#findText', find);
  await p.type('#replText', repl);
  await p.click('#replAll');
  console.log('replaced at', Math.round((Date.now() - t0) / 1000), 's');
  await new Promise((r) => setTimeout(r, 1500));
  console.log(
    'status:',
    await p.$eval('#findStatus', (e) => e.textContent.trim())
  );
  await p.click('#save');
  await new Promise((r) =>
    setTimeout(r, 8000 + Number(process.env.SAVE_WAIT || 0))
  );
  console.log(
    'toast:',
    await p.$eval('#toast', (e) => e.textContent.trim()).catch(() => '')
  );
  await b.close();
})().catch((e) => {
  console.log('ERR', e.message);
  process.exit(1);
});
