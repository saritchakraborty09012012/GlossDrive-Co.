(function () {
  'use strict';

  /* ================= CONFIG ================= */
  var TOTAL = 300;
  var FPS = 30;
  var FRAME_MS = 1000 / FPS;
  var DURATION_S = Math.round(TOTAL / FPS);

  var root = document.documentElement;
  var loader = document.getElementById('loader');
  var fillEl = document.getElementById('fill');
  var pctEl = document.getElementById('pct');
  var countEl = document.getElementById('count');
  var phaseEl = document.getElementById('phase');
  var framesEl = document.getElementById('frames');

  var hero = document.querySelector('.hero');
  var player = document.getElementById('player');
  var hint = document.getElementById('hint');
  var controls = document.getElementById('controls');
  var btnPlay = document.getElementById('btnPlay');
  var timeEl = document.getElementById('time');
  var track = document.getElementById('track');
  var ctlFill = document.getElementById('ctlFill');
  var ctlIdx = document.getElementById('ctlIdx');
  var btnFs = document.getElementById('btnFs');

  var nav = document.getElementById('nav');
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  var audio = document.getElementById('bgAudio');
  var btnMute = document.getElementById('btnMute');

  function pad(n, len) {
    n = String(n);
    while (n.length < len) n = '0' + n;
    return n;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    return pad(Math.floor(s / 60), 2) + ':' + pad(s % 60, 2);
  }
  function scrollY() { return window.scrollY || document.documentElement.scrollTop || 0; }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  /* ================= LOADER : preload every frame ================= */
  var imgs = [];
  var loaded = 0;
  var finished = false;

  var PHASES = [
    [0, 'PRE-SOAK'],
    [18, 'SNOW FOAM'],
    [42, 'BRUSHING'],
    [66, 'RINSING'],
    [86, 'DRY & SHINE'],
    [100, 'READY']
  ];

  for (var i = 1; i <= TOTAL; i++) {
    var img = document.createElement('img');
    img.decoding = 'async';
    img.draggable = false;
    img.alt = 'Car wash sequence frame ' + i;
    (function (el) {
      var counted = false;
      function settle() {
        if (counted) return;
        counted = true;
        onSettled();
      }
      el.addEventListener('load', settle);
      el.addEventListener('error', settle);
      el.src = 'images/ezgif-frame-' + pad(i, 3) + '.jpg';
      if (el.complete) settle();
    })(img);
    framesEl.appendChild(img);
    imgs.push(img);
  }

  function onSettled() {
    loaded++;
    var p100 = Math.round((loaded / TOTAL) * 100);
    fillEl.style.width = p100 + '%';
    pctEl.textContent = p100 + '%';
    countEl.textContent = loaded + ' / ' + TOTAL + ' images';
    for (var k = PHASES.length - 1; k >= 0; k--) {
      if (p100 >= PHASES[k][0]) {
        phaseEl.textContent = PHASES[k][1];
        break;
      }
    }
    if (loaded >= TOTAL) finishLoad();
  }

  function finishLoad() {
    if (finished) return;
    finished = true;

    fillEl.style.width = '100%';
    pctEl.textContent = '100%';
    phaseEl.textContent = 'READY';

    loader.classList.add('hide');
    root.classList.remove('is-loading');
    root.classList.add('ready');

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    paint(true);
    warm(0);

    setTimeout(function () {
      if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    }, 800);
  }

  /* ================= PLAYER ================= */
  var frame = 0;
  var playing = false;
  var started = false;
  var rafId = 0;
  var lastT = 0;
  var acc = 0;
  var lastTimeStr = '';
  var decoded = new Uint8Array(TOTAL);

  function warm(from) {
    var start = Math.max(0, from - 2);
    var end = Math.min(TOTAL, from + 11);
    for (var i = start; i < end; i++) {
      if (!decoded[i]) {
        decoded[i] = 1;
        if (imgs[i].decode) imgs[i].decode().catch(function () {});
      }
    }
  }

  function setFrame(i) {
    i = clamp(i, 0, TOTAL - 1);
    if (i === frame && imgs[i].classList.contains('on')) { paint(true); return; }
    if (imgs[frame]) imgs[frame].classList.remove('on');
    frame = i;
    imgs[frame].classList.add('on');
    if (ctlIdx) ctlIdx.textContent = pad(frame + 1, 3) + ' / ' + TOTAL;
    warm(frame);
    paint(true);
  }

  function paint(interp) {
    var pos = frame + (interp && playing ? Math.min(1, acc / FRAME_MS) : 0);
    var pct = clamp(pos / (TOTAL - 1), 0, 1) * 100;
    ctlFill.style.width = pct.toFixed(2) + '%';
    track.setAttribute('aria-valuenow', Math.round(pct));
    var t = fmtTime(clamp(pos / FPS, 0, DURATION_S)) + ' / ' + fmtTime(DURATION_S);
    if (t !== lastTimeStr) {
      lastTimeStr = t;
      timeEl.textContent = t;
    }
  }

  function tick(now) {
    if (!playing) return;
    var dt = now - lastT;
    lastT = now;
    if (dt > 400) dt = FRAME_MS;
    acc += dt;
    var adv = Math.floor(acc / FRAME_MS);
    if (adv > 0) {
      acc -= adv * FRAME_MS;
      var next = (frame + adv) % TOTAL;
      if (next < frame) syncAudioToFrame(0);
      setFrame(next);
    }
    paint(true);
    rafId = requestAnimationFrame(tick);
  }

  function audioTimeForFrame(i) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return 0;
    return (i / TOTAL) * audio.duration;
  }

  function syncAudioToFrame(i) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    try { audio.currentTime = audioTimeForFrame(i); } catch (err) {}
  }

  function audioPlay() {
    if (!audio) return;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }

  function play() {
    if (playing) return;
    if (frame >= TOTAL - 1) { hardSeek(0); }
    playing = true;
    started = true;
    hint.classList.add('off');
    controls.classList.add('playing');
    lastT = performance.now();
    acc = 0;
    syncAudioToFrame(frame);
    audioPlay();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    playing = false;
    controls.classList.remove('playing');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    acc = 0;
    if (audio) audio.pause();
    paint(false);
  }

  function togglePlay() { playing ? stop() : play(); }

  function hardSeek(i) {
    var was = playing;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0; acc = 0;
    if (imgs[frame]) imgs[frame].classList.remove('on');
    frame = clamp(i, 0, TOTAL - 1);
    imgs[frame].classList.add('on');
    if (ctlIdx) ctlIdx.textContent = pad(frame + 1, 3) + ' / ' + TOTAL;
    warm(frame);
    syncAudioToFrame(frame);
    paint(false);
    if (was) { lastT = performance.now(); rafId = requestAnimationFrame(tick); }
  }

  /* first scroll gesture starts the video, page stays put */
  function startVideo() {
    if (!started) { started = true; hint.classList.add('off'); }
    play();
  }

  /* ---------- controls ---------- */
  btnPlay.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!started && !playing) { startVideo(); return; }
    togglePlay();
  });

  btnFs.addEventListener('click', function (e) {
    e.stopPropagation();
    var doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    } else {
      (player.requestFullscreen || player.webkitRequestFullscreen || function () {}).call(player);
    }
  });

  if (btnMute && audio) {
    btnMute.addEventListener('click', function (e) {
      e.stopPropagation();
      audio.muted = !audio.muted;
      btnMute.classList.toggle('muted', audio.muted);
      btnMute.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
    });
  }

  player.addEventListener('click', function (e) {
    if (e.target.closest('.controls')) return;
    if (!started) { startVideo(); return; }
    togglePlay();
  });

  /* seek bar */
  var dragging = false;
  function posToFrame(x) {
    var r = track.getBoundingClientRect();
    var p = r.width > 0 ? (x - r.left) / r.width : 0;
    return Math.round(clamp(p, 0, 1) * (TOTAL - 1));
  }
  track.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    dragging = true;
    track.classList.add('drag');
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
    hardSeek(posToFrame(e.clientX));
  });
  track.addEventListener('pointermove', function (e) {
    if (dragging) hardSeek(posToFrame(e.clientX));
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    track.addEventListener(ev, function () {
      dragging = false;
      track.classList.remove('drag');
    });
  });
  track.addEventListener('keydown', function (e) {
    var handled = true;
    if (e.key === 'ArrowLeft') hardSeek(frame - 15);
    else if (e.key === 'ArrowRight') hardSeek(frame + 15);
    else if (e.key === 'Home') hardSeek(0);
    else if (e.key === 'End') hardSeek(TOTAL - 1);
    else handled = false;
    if (handled) e.preventDefault();
  });

  /* ---------- scroll / touch / keys : media-player feel ---------- */
  var suppressUntil = 0;
  var suppressTouch = false;
  var touchStartY = null;

  function atTop() { return scrollY() <= 0.5; }

  window.addEventListener('wheel', function (e) {
    if (!atTop()) return;
    var now = performance.now();
    if (now < suppressUntil) { e.preventDefault(); return; }
    if (e.deltaY > 0 && !started) {
      e.preventDefault();
      startVideo();
      suppressUntil = now + 650;
    }
  }, { passive: false });

  window.addEventListener('touchstart', function (e) {
    if (e.touches.length) touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    if (touchStartY === null) return;
    if (!atTop()) return;
    if (suppressTouch) { e.preventDefault(); return; }
    var dy = touchStartY - e.touches[0].clientY;
    if (dy > 10 && !started) {
      e.preventDefault();
      startVideo();
      suppressTouch = true;
      suppressUntil = performance.now() + 900;
    }
  }, { passive: false });

  window.addEventListener('touchend', function () {
    suppressTouch = false;
    touchStartY = null;
  }, { passive: true });

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!atTop()) return;
    if (!started && (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Spacebar')) {
      e.preventDefault();
      startVideo();
      suppressUntil = performance.now() + 500;
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!audio) return;
    if (document.hidden) {
      audio.pause();
    } else if (playing) {
      lastT = performance.now();
      audioPlay();
    }
  });

  /* ================= NAV + MENU ================= */
  var menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    menu.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  burger.addEventListener('click', function () { setMenu(!menuOpen); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });

  /* smooth anchors (works with overlay menu too) */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href === '#') return;
    var el = document.querySelector(href);
    if (!el) return;
    e.preventDefault();
    if (menuOpen) setMenu(false);
    var top = href === '#top' ? 0 : el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: top, behavior: 'smooth' });
  });

  /* ================= SCROLL : nav always visible ================= */
  nav.classList.add('show');

  /* ================= REVEAL + COUNTERS ================= */
  var rvs = [].slice.call(document.querySelectorAll('.rv'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
          var b = en.target.matches('.stat') ? en.target.querySelector('[data-count]') : null;
          if (b) countUp(b);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
    rvs.forEach(function (el) { io.observe(el); });
  } else {
    rvs.forEach(function (el) { el.classList.add('in'); });
    [].forEach.call(document.querySelectorAll('[data-count]'), countUp);
  }

  function countUp(b) {
    if (b.dataset.done) return;
    b.dataset.done = '1';
    var target = parseInt(b.getAttribute('data-count'), 10) || 0;
    var suffix = b.getAttribute('data-suffix') || '';
    var t0 = performance.now();
    var dur = 1500;
    (function step(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      b.textContent = Math.round(target * eased).toLocaleString('en-IN') + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ================= INTRO SEQ (smooth slow-mo, slides in once) ================= */
  var introSeq = document.getElementById('introSeq');
  var introMedia = document.getElementById('introMedia');
  if (introSeq) {
    var SEQ_TOTAL = 109;
    var seqImgs = [];
    for (var si = 0; si < SEQ_TOTAL; si++) {
      var simg = document.createElement('img');
      simg.src = 'images/beads-slow/slow-' + pad(si + 1, 3) + '.jpg';
      simg.alt = '';
      simg.decoding = 'async';
      simg.draggable = false;
      introSeq.appendChild(simg);
      seqImgs.push(simg);
    }
    var seqFrame = -1, seqOn = false, seqRaf = 0, seqLast = 0, seqAcc = 0;
    var SEQ_MS = 50;

    function seqShow(i) {
      i = ((i % SEQ_TOTAL) + SEQ_TOTAL) % SEQ_TOTAL;
      if (i === seqFrame) return;
      if (seqFrame >= 0) seqImgs[seqFrame].classList.remove('on');
      seqFrame = i;
      seqImgs[seqFrame].classList.add('on');
    }

    function seqTick(now) {
      if (!seqOn) return;
      var dt = now - seqLast;
      seqLast = now;
      if (dt > 400) dt = SEQ_MS;
      seqAcc += dt;
      var adv = Math.floor(seqAcc / SEQ_MS);
      if (adv > 0) {
        seqAcc -= adv * SEQ_MS;
        seqShow(seqFrame + adv);
      }
      seqRaf = requestAnimationFrame(seqTick);
    }

    function seqStart() {
      if (seqOn) return;
      seqOn = true;
      seqLast = performance.now();
      seqAcc = 0;
      if (seqFrame < 0) seqShow(0);
      seqRaf = requestAnimationFrame(seqTick);
    }

    function seqStop() {
      seqOn = false;
      if (seqRaf) cancelAnimationFrame(seqRaf);
      seqRaf = 0;
    }

    seqShow(0);
    var introSec = document.getElementById('about');
    if ('IntersectionObserver' in window && introMedia && introSec) {
      var seqIO = new IntersectionObserver(function (ens) {
        ens.forEach(function (en) {
          if (en.isIntersecting) {
            introMedia.classList.remove('out');
            introMedia.classList.add('in');
            seqStart();
          } else {
            introMedia.classList.remove('in');
            introMedia.classList.add('out');
            seqStop();
          }
        });
      }, { threshold: 0.3 });
      seqIO.observe(introSec);
    } else {
      if (introMedia) introMedia.classList.add('in');
      seqStart();
    }
  }

  /* ================= PROCESS RAIL ================= */
  var rail = document.getElementById('rail');
  var railPrev = document.getElementById('railPrev');
  var railNext = document.getElementById('railNext');
  if (rail) {
    function railStep() {
      var c = rail.querySelector('.step');
      return c ? c.offsetWidth + 18 : 420;
    }
    function railState() {
      if (!railPrev) return;
      railPrev.disabled = rail.scrollLeft < 8;
      railNext.disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 8;
    }
    if (railNext) railNext.addEventListener('click', function () { rail.scrollBy({ left: railStep(), behavior: 'smooth' }); });
    if (railPrev) railPrev.addEventListener('click', function () { rail.scrollBy({ left: -railStep(), behavior: 'smooth' }); });
    rail.addEventListener('scroll', railState, { passive: true });
    railState();

    var rDrag = false, rX = 0, rL = 0;
    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      rDrag = true; rX = e.clientX; rL = rail.scrollLeft;
      rail.classList.add('dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!rDrag) return;
      rail.scrollLeft = rL - (e.clientX - rX);
    });
    window.addEventListener('pointerup', function () {
      if (!rDrag) return;
      rDrag = false;
      rail.classList.remove('dragging');
      railState();
    });
  }

  /* ================= BOOKING FORM ================= */
  var form = document.getElementById('bookForm');
  if (form) {
    var dateInput = document.getElementById('fDate');
    if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      document.getElementById('formOk').hidden = false;
      form.reset();
      if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
    });
  }

  /* ================= INIT ================= */
  setFrame(0);
  paint(false);

  window.__player = {
    state: function () {
      return { frame: frame, playing: playing, started: started, total: TOTAL };
    },
    play: play,
    stop: stop,
    seek: function (i) { hardSeek(i); }
  };
})();
