const puppeteer = require('/Users/garva/sb-smoke/node_modules/puppeteer-core');
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
  p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 150)));
  await p.goto(
    (process.env.BASE || 'http://127.0.0.1:3091') + '/edit-pdf-text',
    { waitUntil: 'networkidle0' }
  );
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
  await new Promise((r) => setTimeout(r, 2000));
  await p.click('#find');
  await p.waitForSelector('#findText', { visible: true });
  await p.type('#findText', find);
  await p.type('#replText', repl);
  await p.click('#replAll');
  await new Promise((r) => setTimeout(r, 1500));
  console.log(
    'status:',
    await p.$eval('#findStatus', (e) => e.textContent.trim())
  );
  await p.click('#save');
  await new Promise((r) => setTimeout(r, 8000));
  console.log(
    'toast:',
    await p.$eval('#toast', (e) => e.textContent.trim()).catch(() => '')
  );
  await b.close();
})().catch((e) => {
  console.log('ERR', e.message);
  process.exit(1);
});
