const fs = require('fs');
const path = require('path');
const { createServer } = require('../server');
const { chromium } = require('playwright-core');

const SITE_ROOT = path.join(__dirname, '..', 'public');
const IMAGES = path.join(SITE_ROOT, 'images');
const ARTIFACTS = path.join(__dirname, 'artifacts');
const TOTAL = 300;

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : ''));
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const dir = path.join(local, 'ms-playwright');
    if (fs.existsSync(dir)) {
      const builds = fs.readdirSync(dir).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
      for (const b of builds) {
        for (const sub of ['chrome-win64\\chrome.exe', 'chrome-win\\chrome.exe']) {
          const p = path.join(dir, b, sub);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ];
  return candidates.find(fs.existsSync) || null;
}

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function state(page) {
  return page.evaluate(() => window.__player.state());
}

function scrollY(page) {
  return page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0);
}

async function instantTo(page, y) {
  await page.evaluate(v => window.scrollTo({ top: v, left: 0, behavior: 'instant' }), y);
}

async function main() {
  if (!fs.existsSync(ARTIFACTS)) fs.mkdirSync(ARTIFACTS, { recursive: true });

  console.log('\n== 1. image files on disk ==');
  const onDisk = fs.readdirSync(IMAGES).filter(f => /\.jpg$/i.test(f));
  check('300 frame images exist in public/images', onDisk.length === TOTAL, 'found ' + onDisk.length);

  const exe = findChrome();
  if (!exe) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a browser executable.');
  console.log('\nBrowser: ' + exe);

  const browser = await chromium.launch({ executablePath: exe });

  // ---------- A: loader ----------
  console.log('\n== 2. loader waits for every image, then reveals site ==');
  const server = createServer();
  const port = await listen(server);
  const base = 'http://127.0.0.1:' + port + '/';

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  const stillLoading = await page.evaluate(() => !!document.getElementById('loader'));
  check('loader is on screen while images load', stillLoading);

  const during = await page.evaluate(() => ({
    pct: parseInt(document.getElementById('pct').textContent, 10),
    imgs: document.querySelectorAll('.frames img').length
  }));
  if (stillLoading) {
    check('progress reflects real load state', during.pct >= 0 && during.pct < 100, 'pct=' + during.pct);
  }
  check('all 300 <img> elements created', during.imgs === TOTAL, 'found ' + during.imgs);

  await page.waitForSelector('#loader', { state: 'detached', timeout: 60000 });
  const loaderMs = Date.now() - t0;
  check('loader gone only after images finished (' + (loaderMs / 1000).toFixed(1) + 's)', loaderMs > 0);

  const ready = await page.evaluate(() => ({
    imgs: document.querySelectorAll('.frames img').length,
    active: document.querySelectorAll('.frames img.on').length,
    isReady: document.documentElement.classList.contains('ready'),
    stillLocked: document.documentElement.classList.contains('is-loading')
  }));
  check('300 frames in DOM', ready.imgs === TOTAL, 'found ' + ready.imgs);
  check('exactly one frame visible', ready.active === 1, 'active=' + ready.active);
  check('site marked ready', ready.isReady === true);
  check('scroll unlocked', ready.stillLocked === false);

  const boot = await state(page);
  check('player starts paused on frame 001', boot.frame === 0 && boot.playing === false && boot.started === false, JSON.stringify(boot));
  await page.screenshot({ path: path.join(ARTIFACTS, '01-hero.png') });

  // ---------- B: first scroll gesture starts the video ----------
  console.log('\n== 3. first scroll gesture auto-plays the video ==');
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 140);
  await page.waitForTimeout(120);
  const afterFirst = await state(page);
  const yAfterFirst = await scrollY(page);
  check('first wheel-down starts playback', afterFirst.started === true && afterFirst.playing === true, JSON.stringify(afterFirst));
  check('page did NOT scroll on that gesture', yAfterFirst === 0, 'scrollY=' + yAfterFirst);
  check('scroll hint hidden', await page.evaluate(() => document.getElementById('hint').classList.contains('off')));

  await page.waitForTimeout(1100);
  const advancing = await state(page);
  check('video advances at ~30fps', advancing.frame >= 20, 'frame=' + advancing.frame);
  const ui = await page.evaluate(() => ({
    fill: parseFloat(document.getElementById('ctlFill').style.width) || 0,
    time: document.getElementById('time').textContent,
    idx: document.getElementById('ctlIdx').textContent
  }));
  check('progress bar growing', ui.fill > 5, 'fill=' + ui.fill);
  check('time counter running', ui.time.startsWith('00:0'), ui.time);
  check('frame index label updates', /^0\d\d \/ 300$/.test(ui.idx), ui.idx);
  await page.screenshot({ path: path.join(ARTIFACTS, '02-playing.png') });

  // ---------- B2: audio + mute ----------
  console.log('\n== 3b. audio plays with video, mute button works ==');
  const audioLoaded = await page.evaluate(() => {
    const a = document.getElementById('bgAudio');
    return { src: a.getAttribute('src'), hasDuration: isFinite(a.duration) && a.duration > 0 };
  });
  check('audio element points to track.mp3', /audio\/track\.mp3$/.test(audioLoaded.src), audioLoaded.src);
  check('audio decoded a duration', audioLoaded.hasDuration === true);
  const audioPlaying = await page.evaluate(() => {
    const a = document.getElementById('bgAudio');
    return { paused: a.paused, muted: a.muted, t: a.currentTime };
  });
  check('audio playing along with video', audioPlaying.paused === false, JSON.stringify(audioPlaying));
  check('audio starts unmuted', audioPlaying.muted === false);
  await page.waitForTimeout(300);
  const audioAdvanced = await page.evaluate(() => document.getElementById('bgAudio').currentTime);
  check('audio time advances', audioAdvanced > audioPlaying.t, audioPlaying.t + ' -> ' + audioAdvanced);

  await page.locator('#btnMute').click();
  const mutedState = await page.evaluate(() => {
    const a = document.getElementById('bgAudio');
    return { muted: a.muted, paused: a.paused, cls: document.getElementById('btnMute').classList.contains('muted') };
  });
  check('mute button silences audio', mutedState.muted === true && mutedState.cls === true, JSON.stringify(mutedState));
  check('video keeps playing while muted', mutedState.paused === false && (await state(page)).playing === true);

  await page.locator('#btnMute').click();
  const unmuted = await page.evaluate(() => document.getElementById('bgAudio').muted);
  check('second click unmutes', unmuted === false);

  await page.locator('#btnPlay').click();
  await page.waitForTimeout(80);
  const audioPaused = await page.evaluate(() => document.getElementById('bgAudio').paused);
  check('pausing video pauses audio', audioPaused === true);
  await page.locator('#btnPlay').click();
  await page.waitForTimeout(80);
  const audioResumed = await page.evaluate(() => document.getElementById('bgAudio').paused);
  check('resuming video resumes audio', audioResumed === false);

  // ---------- C: normal scrolling resumes while video keeps playing ----------
  console.log('\n== 4. further scrolling moves the page, video keeps playing ==');
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const midScroll = await state(page);
  const yMid = await scrollY(page);
  check('page scrolled into the site', yMid > 200, 'scrollY=' + yMid);
  check('video still playing while page scrolls', midScroll.playing === true, JSON.stringify(midScroll));
  check('nav revealed over site', await page.evaluate(() => document.getElementById('nav').classList.contains('show')));
  await page.screenshot({ path: path.join(ARTIFACTS, '03-site-scrolled.png') });

  // ---------- D: wheel-up at top does NOT restart ----------
  console.log('\n== 5. scrolling up at top does not restart video ==');
  await instantTo(page, 0);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__player.seek(220));
  await page.waitForTimeout(100);
  const beforeUp = await state(page);
  await page.mouse.wheel(0, -140);
  await page.waitForTimeout(250);
  const afterUp = await state(page);
  check('was mid-video before wheel-up', beforeUp.frame > 200, 'frame=' + beforeUp.frame);
  check('wheel-up at top does NOT rewind', afterUp.frame > 200, 'frame=' + afterUp.frame);
  check('playback continues after wheel-up', afterUp.playing === true, JSON.stringify(afterUp));

  // ---------- E: seek, pause, loop at end ----------
  console.log('\n== 6. controls: seek, pause, seamless loop ==');
  const box = await page.locator('#track').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.waitForTimeout(120);
  const sought = await state(page);
  check('clicking mid-bar seeks to ~frame 150', Math.abs(sought.frame - 150) <= 6, 'frame=' + sought.frame);

  await page.locator('#btnPlay').click();
  await page.waitForTimeout(100);
  const paused = await state(page);
  const pFrame = paused.frame;
  await page.waitForTimeout(500);
  const stillPaused = await state(page);
  check('pause button stops playback', paused.playing === false, JSON.stringify(paused));
  check('frame frozen while paused', stillPaused.frame === pFrame, 'f=' + stillPaused.frame);

  await page.evaluate(() => window.__player.seek(window.__player.state().total - 3));
  await page.locator('#btnPlay').click();
  await page.waitForTimeout(400);
  const looped = await state(page);
  check('video loops past the last frame back to start', looped.playing === true && looped.frame < 20, JSON.stringify(looped));
  await page.screenshot({ path: path.join(ARTIFACTS, '04-looping.png') });

  // ---------- E2: intro sequence (frames 128-179) ----------
  console.log('\n== 6b. intro section plays wheel frames 128-179 in view ==');
  await page.evaluate(() => {
    window.__player.stop();
    document.getElementById('about').scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(600);
  const seq = await page.evaluate(() => {
    const el = document.getElementById('introSeq');
    const media = document.getElementById('introMedia');
    const imgs = el ? el.querySelectorAll('img') : [];
    const on = el ? el.querySelector('img.on') : null;
    return {
      count: imgs.length,
      active: !!on,
      src: on ? on.getAttribute('src') : '',
      mediaIn: media ? media.classList.contains('in') : false,
      mediaOut: media ? media.classList.contains('out') : false
    };
  });
  check('intro seq has 109 slow-mo frames', seq.count === 109, 'count=' + seq.count);
  check('intro seq has an active frame in view', seq.active === true);
  check('intro seq sources are beads-slow/slow-*.jpg', /images\/beads-slow\/slow-\d{3}\.jpg$/.test(seq.src), seq.src);
  check('media card slid IN when section in view', seq.mediaIn === true && seq.mediaOut === false, JSON.stringify(seq));
  await page.waitForTimeout(450);
  const seq2 = await page.evaluate(() => {
    const on = document.querySelector('#introSeq img.on');
    return on ? on.getAttribute('src') : '';
  });
  check('intro seq advances while in view', seq2 !== seq.src, seq.src + ' -> ' + seq2);
  await page.screenshot({ path: path.join(ARTIFACTS, '04b-intro-seq.png') });

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(400);
  const seqOff = await page.evaluate(() => {
    const el = document.getElementById('introSeq');
    const media = document.getElementById('introMedia');
    return {
      src: el && el.querySelector('img.on') ? el.querySelector('img.on').getAttribute('src') : null,
      mediaOut: media ? media.classList.contains('out') : false,
      mediaIn: media ? media.classList.contains('in') : false
    };
  });
  await page.waitForTimeout(400);
  const seqOff2 = await page.evaluate(() => {
    const on = document.querySelector('#introSeq img.on');
    return on ? on.getAttribute('src') : null;
  });
  check('intro seq pauses when out of view', seqOff2 === seqOff.src, seqOff.src + ' vs ' + seqOff2);
  check('media card slides OUT when section passed', seqOff.mediaOut === true && seqOff.mediaIn === false, JSON.stringify(seqOff));

  // ---------- F: site content ----------
  console.log('\n== 7. full site content present ==');
  const site = await page.evaluate(() => ({
    services: document.querySelectorAll('#services .svc').length,
    steps: document.querySelectorAll('.rail .step').length,
    packages: document.querySelectorAll('.pkg').length,
    bookingForm: !!document.getElementById('bookForm'),
    footer: !!document.querySelector('footer')
  }));
  check('6 service cards', site.services === 6, 'found ' + site.services);
  check('8 process steps', site.steps === 8, 'found ' + site.steps);
  check('3 packages', site.packages === 3, 'found ' + site.packages);
  check('booking form + footer', site.bookingForm === true && site.footer === true);

  check('no console/page errors (main run)', errors.length === 0, errors.join(' | '));
  await page.close();

  // ---------- G: slow network ----------
  console.log('\n== 8. slow network: loader stays until ALL images arrive ==');
  process.env.IMG_DELAY_MS = '60';
  const slowServer = createServer();
  const slowPort = await listen(slowServer);
  const slowPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const slowErrors = [];
  slowPage.on('pageerror', e => slowErrors.push(e.message));

  await slowPage.goto('http://127.0.0.1:' + slowPort + '/', { waitUntil: 'domcontentloaded' });
  await slowPage.waitForTimeout(900);
  const slowState = await slowPage.evaluate(() => ({
    loaderThere: !!document.getElementById('loader'),
    pct: parseInt(document.getElementById('pct').textContent, 10)
  }));
  check('loader still visible on slow network', slowState.loaderThere === true);
  check('progress below 100% while images pending', slowState.pct < 100, 'pct=' + slowState.pct);
  await slowPage.screenshot({ path: path.join(ARTIFACTS, '05-loader-slow.png') });

  await slowPage.waitForSelector('#loader', { state: 'detached', timeout: 60000 });
  const slowDone = await slowPage.evaluate(() => ({
    isReady: document.documentElement.classList.contains('ready'),
    active: document.querySelectorAll('.frames img.on').length
  }));
  check('loader released after slow load completed', slowDone.isReady === true && slowDone.active === 1);
  check('no errors on slow load', slowErrors.length === 0, slowErrors.join(' | '));
  await slowPage.close();
  await close(slowServer);
  delete process.env.IMG_DELAY_MS;

  // ---------- H: file:// ----------
  console.log('\n== 9. opens directly from disk (file://) ==');
  const fileUrl = 'file://' + path.join(SITE_ROOT, 'index.html').replace(/\\/g, '/');
  const filePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const fileErrors = [];
  filePage.on('pageerror', e => fileErrors.push(e.message));
  filePage.on('console', m => { if (m.type() === 'error') fileErrors.push(m.text()); });
  await filePage.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await filePage.waitForSelector('#loader', { state: 'detached', timeout: 60000 });
  await filePage.mouse.move(640, 400);
  await filePage.mouse.wheel(0, 140);
  await filePage.waitForTimeout(700);
  const fileState = await filePage.evaluate(() => ({
    imgs: document.querySelectorAll('.frames img').length,
    st: window.__player.state(),
    y: window.scrollY || 0
  }));
  check('file:// loads 300 frames', fileState.imgs === TOTAL, 'found ' + fileState.imgs);
  check('file:// wheel starts player at top', fileState.st.started === true && fileState.y === 0, JSON.stringify(fileState.st) + ' y=' + fileState.y);
  check('file:// video advances', fileState.st.frame > 5, 'frame=' + fileState.st.frame);
  check('no errors on file://', fileErrors.length === 0, fileErrors.join(' | '));
  await filePage.close();

  await browser.close();
  await close(server);

  console.log('\n----------------------------------------');
  console.log('  ' + passed + ' passed, ' + failed + ' failed');
  console.log('  screenshots: test\\artifacts');
  console.log('----------------------------------------\n');
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('\nTEST RUN ERROR: ' + err.message);
  process.exit(1);
});
