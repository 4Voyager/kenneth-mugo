/* ============================================================
   KENNETH MUGO — Official Website · Scripts
   ============================================================
   Plain JavaScript, no libraries. Each numbered module below is
   independent: it looks for its own elements and does nothing if
   they are not on the page.

   Contents
      1. Theme toggle
      2. Custom cursor
      3. Guitar string pluck — visual + audio
      4. Hero dot field
      5. Floating audio player
      6. Mobile navigation
      7. Scroll reveal (intersection observer)
      8. Events carousel
      9. Animated stat counters
     10. Journey timeline
     11. Video showcase
     12. Gallery mobile limit
     13. Gallery filter
     14. Photo lightbox
     15. Image fallbacks
     16. Testimonials carousel
     17. Gear tabs
     18. Contact form validation & submission
     19. Footer year

   Shortcuts used everywhere:  $('.thing')  /  $$('.things')
   ============================================================ */

/* ── Utility: query shortcuts ── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ===========================================================
   MODULE 1: THEME TOGGLE
   Reads device preference on load.
   Toggle button switches between dark/light.
   Preference saved to localStorage so it persists.
   =========================================================== */

const themeToggleBtn = $('#theme-toggle');
const html = document.documentElement;

function setTheme(theme) {
  /* Apply theme to <html> data-theme attribute */
  html.setAttribute('data-theme', theme);
  /* Match the browser / status-bar colour to the chosen theme */
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', theme === 'dark' ? '#0d0a1a' : '#f0eafa');
  });
  /* Save preference */
  localStorage.setItem('kk-theme', theme);
  /* Update aria-label for accessibility */
  themeToggleBtn.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
}

function initTheme() {
  /* Check for saved preference first */
  const saved = localStorage.getItem('kk-theme');
  if (saved) {
    setTheme(saved);
    return;
  }
  /* Otherwise, match the OS/device preference */
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}

themeToggleBtn.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

/* Listen for OS-level theme changes (e.g., auto dark mode at sunset) */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  /* Only follow OS if user hasn't manually overridden */
  if (!localStorage.getItem('kk-theme')) {
    setTheme(e.matches ? 'dark' : 'light');
  }
});

/* Run theme init immediately (before paint) to prevent flash */
initTheme();

/* ===========================================================
   MODULE 2: CUSTOM CURSOR
   Gold dot follows mouse. Grows on hover.
   Only active on desktop (pointer: fine = mouse/trackpad).
   =========================================================== */

const cursor = $('#cursor');
const cursorTrail = $('#cursor-trail');

/* Only run cursor logic if device has a fine pointer (mouse) */
if (window.matchMedia('(pointer: fine)').matches) {
  let mouseX = 0,
    mouseY = 0;
  let cursorRafPending = false;

  /* Batch cursor DOM writes inside requestAnimationFrame so they
     run once per frame instead of on every mousemove event.
     This cuts CPU usage noticeably on fast mice / trackpads. */
  /* `translate` is its own CSS property, so it moves the element on the compositor
     without touching the centring/scale in `transform`. Old browsers fall back to left/top. */
  const canTranslate = window.CSS && CSS.supports && CSS.supports('translate', '1px 1px');
  function updateCursorDOM() {
    if (canTranslate) {
      cursor.style.translate = mouseX + 'px ' + mouseY + 'px';
      cursorTrail.style.translate = mouseX + 'px ' + mouseY + 'px';
    } else {
      cursor.style.left = mouseX + 'px';
      cursor.style.top = mouseY + 'px';
      cursorTrail.style.left = mouseX + 'px';
      cursorTrail.style.top = mouseY + 'px';
    }
    cursorRafPending = false;
  }

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!cursorRafPending) {
      cursorRafPending = true;
      requestAnimationFrame(updateCursorDOM);
    }
  });

  /* Grow cursor when hovering interactive elements */
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('a, button, [role="button"]')) {
      cursor.classList.add('is-hovering');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('a, button, [role="button"]')) {
      cursor.classList.remove('is-hovering');
    }
  });

  /* Hide cursor when it leaves the window */
  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    cursorTrail.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
    cursorTrail.style.opacity = '1';
  });
}

/* ===========================================================
   MODULE 3: GUITAR STRING PLUCK — VISUAL + AUDIO
   Each of the 6 strings plays a different guitar note
   using the Web Audio API (no audio files needed — tones
   are synthesised in the browser using the Karplus-Strong
   algorithm, which closely mimics a plucked guitar string).

   STRING → NOTE MAPPING (low to high, like a real guitar):
     String 1 (leftmost)  → E2  (82 Hz)  — low E
     String 2             → A2  (110 Hz) — A
     String 3             → D3  (147 Hz) — D
     String 4             → G3  (196 Hz) — G
     String 5             → B3  (247 Hz) — B
     String 6 (rightmost) → E4  (330 Hz) — high E

   TO CHANGE A NOTE: edit the frequencies array below.
   =========================================================== */

(function initStringPluck() {
  const heroEl = document.getElementById('hero');
  const heroStrings = document.getElementById('hero-strings');
  const stringEls = $$('.string', heroStrings);

  /* ── Note frequencies for each string (E A D G B e) ── */
  const STRING_NOTES = [82, 110, 147, 196, 247, 330];

  /* ── Web Audio context — created lazily on first interaction ──
     (browsers block AudioContext until a user gesture has occurred) */
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    /* Resume if suspended (Chrome policy) */
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  /* ── Karplus-Strong string synthesis ──
     Creates a realistic plucked-string sound by:
     1. Filling a buffer with white noise (the "pluck" impulse)
     2. Feeding it through a looping delay + lowpass filter
        (simulates how string vibration decays and loses highs)
     The result sounds much more like a real guitar string
     than a plain sine or sawtooth wave.

     frequency  — the note in Hz
     duration   — how long the note sustains (seconds)
     volume     — 0.0 to 1.0
  */
  function pluckNote(frequency, duration = 2.0, volume = 0.6) {
    const ctx = getAudioContext();
    const sampleRate = ctx.sampleRate;

    /* Buffer length = one period of the frequency */
    const bufLen = Math.round(sampleRate / frequency);
    const buffer = ctx.createBuffer(1, bufLen, sampleRate);
    const data = buffer.getChannelData(0);

    /* Fill with white noise */
    for (let i = 0; i < bufLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    /* Source node — plays the noise buffer */
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    /* Lowpass filter — removes high frequencies over time,
       mimicking how a real string's tone darkens as it decays */
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency * 8; /* Start bright */

    /* Gain node — controls volume envelope */
    const gainNode = ctx.createGain();
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(volume, now);
    /* Exponential decay — string rings out naturally */
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    /* Slowly darken the tone as it decays */
    filter.frequency.exponentialRampToValueAtTime(frequency * 2, now + duration);

    /* Wire up: source → filter → gain → output */
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }

  /* ── Visual pluck: glow animation + cursor ripple ── */
  function animatePluck(stringEl, x, y) {
    stringEl.classList.remove('is-plucked');
    void stringEl.offsetWidth; /* Force reflow to restart */
    stringEl.classList.add('is-plucked');
    setTimeout(() => stringEl.classList.remove('is-plucked'), 700);

    /* Gold ripple from touch/click point */
    const ripple = document.createElement('div');
    ripple.className = 'cursor-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);

    /* Tell the hero dot field ("Hero dot field" below) which string was plucked, and where */
    const sr = stringEl.getBoundingClientRect();
    document.dispatchEvent(
      new CustomEvent('hero:pluck', {
        detail: { index: stringEls.indexOf(stringEl), x: sr.left + sr.width / 2, y: y },
      }),
    );
  }

  /* ── Find the nearest string to an X coordinate ── */
  function nearestString(clientX) {
    let closest = null;
    let minDist = Infinity;
    let minIndex = 0;

    stringEls.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const strX = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - strX);
      if (dist < minDist) {
        minDist = dist;
        closest = el;
        minIndex = i;
      }
    });

    /* Only trigger within 60px of a string */
    return minDist < 60 ? { el: closest, index: minIndex } : null;
  }

  /* ── Track which strings have already been plucked in
     the current strum so each string only sounds once
     per drag/swipe gesture ── */
  let strumActive = false; /* True while mouse/finger is held down */
  let strummedSet = new Set(); /* Indices of strings plucked this strum */
  let lastStrumX = null; /* Last X position during strum */

  /* ── Core: pluck a string by index ── */
  function triggerString(index, clientX, clientY) {
    if (strummedSet.has(index)) return; /* Already plucked this strum */
    strummedSet.add(index);

    const el = stringEls[index];
    animatePluck(el, clientX, clientY);

    /* Stagger the note slightly based on strum direction so it
       sounds like a real strum rather than all notes at once.
       Delay = 18ms × distance from first string hit this strum. */
    const delay = strummedSet.size * 18;
    setTimeout(() => pluckNote(STRING_NOTES[index], 2.0, 0.55), delay);
  }

  /* ── Check all strings against a given X position and fire
     any that the cursor/finger has just crossed ── */
  function checkStrings(clientX, clientY) {
    stringEls.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const strX = rect.left + rect.width / 2;
      /* Fire if within 28px of the string centre */
      if (Math.abs(clientX - strX) < 28) {
        triggerString(i, clientX, clientY);
      }
    });
  }

  /* ══════════════════════════════════════════════════
     DESKTOP — mouse drag across strings to strum
     ══════════════════════════════════════════════════ */

  heroEl.addEventListener('mousedown', (e) => {
    strumActive = true;
    strummedSet.clear();
    lastStrumX = e.clientX;
    checkStrings(e.clientX, e.clientY);
  });

  /* Move fires continuously as cursor drags */
  heroEl.addEventListener('mousemove', (e) => {
    if (!strumActive) return;

    /* If direction reversed (e.g. strum back), allow re-plucking
       strings that weren't hit in this sweep direction */
    const movingRight = e.clientX > (lastStrumX ?? e.clientX);
    const movingLeft = e.clientX < (lastStrumX ?? e.clientX);

    /* Clear the set on direction change so reverse strum works */
    if (lastStrumX !== null) {
      const prevRight = lastStrumX < e.clientX;
      const prevLeft = lastStrumX > e.clientX;
      if ((movingRight && !prevRight) || (movingLeft && !prevLeft)) {
        strummedSet.clear();
      }
    }

    lastStrumX = e.clientX;
    checkStrings(e.clientX, e.clientY);
  });

  heroEl.addEventListener('mouseup', () => {
    strumActive = false;
    strummedSet.clear();
    lastStrumX = null;
  });
  heroEl.addEventListener('mouseleave', () => {
    strumActive = false;
    strummedSet.clear();
    lastStrumX = null;
  });

  /* ══════════════════════════════════════════════════
     MOBILE — touch swipe across strings to strum
     ══════════════════════════════════════════════════ */

  heroEl.addEventListener(
    'touchstart',
    (e) => {
      strumActive = true;
      strummedSet.clear();
      lastStrumX = e.touches[0].clientX;
      checkStrings(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );

  heroEl.addEventListener(
    'touchmove',
    (e) => {
      if (!strumActive) return;
      const t = e.touches[0];

      /* Direction-change detection — same as mouse */
      if (lastStrumX !== null) {
        /* Clear the strummed set on a big change of direction */
        const delta = t.clientX - lastStrumX;
        if (strummedSet.size > 0) {
          /* Check if we flipped direction vs first string plucked */
          const firstPlucked = [...strummedSet][0];
          const firstX = stringEls[firstPlucked]?.getBoundingClientRect().left ?? t.clientX;
          const goingAwayFromFirst = t.clientX > firstX !== lastStrumX > firstX;
          if (goingAwayFromFirst && Math.abs(delta) > 20) {
            strummedSet.clear();
          }
        }
      }

      lastStrumX = t.clientX;
      checkStrings(t.clientX, t.clientY);
    },
    { passive: true },
  );

  heroEl.addEventListener('touchend', () => {
    strumActive = false;
    strummedSet.clear();
    lastStrumX = null;
  });
  heroEl.addEventListener('touchcancel', () => {
    strumActive = false;
    strummedSet.clear();
    lastStrumX = null;
  });

  /* ── Single tap (no drag) still plucks the nearest string ── */
  heroEl.addEventListener('click', (e) => {
    /* Only fire if it was a genuine tap, not end of a strum drag */
    if (strummedSet.size === 0) {
      const hit = nearestString(e.clientX);
      if (hit) {
        animatePluck(hit.el, e.clientX, e.clientY);
        pluckNote(STRING_NOTES[hit.index]);
      }
    }
  });
})(); /* End initStringPluck */

/* ===========================================================
   MODULE 4: HERO DOT FIELD
   A grid of small dots behind the strings that reacts to:
     • the cursor / finger moving  → nearby dots drift away and glow gold
     • a click / tap               → a shockwave ripples out from the point
     • a string being plucked      → dots near that string shimmer sideways
                                     (lower strings = slower, wider waves)
   Idle dots sit perfectly still, and the animation loop sleeps
   when nothing is moving or the hero is off-screen.
   Colours come from --dot-rgb / --dot-hot-rgb (see hero CSS).
   =========================================================== */

(function initHeroDots() {
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('hero-dots');
  if (!hero || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const now = () => performance.now() / 1000;

  let W = 0,
    H = 0;
  let dots = [];
  let running = false,
    visible = true,
    last = 0;
  const pointer = { x: -9999, y: -9999, active: false };
  let waves = []; /* click shockwaves  {x, y, t}            */
  let plucks = []; /* string plucks     {x, y, t, omega}     */
  let colors = { base: [176, 156, 232], hot: [232, 184, 75] };

  /* Read the dot colours from the hero's CSS variables */
  function readColors() {
    const cs = getComputedStyle(hero);
    const parse = (v, fallback) => {
      const p = v.split(',').map((n) => parseFloat(n));
      return p.length === 3 && p.every((n) => !isNaN(n)) ? p : fallback;
    };
    colors.base = parse(cs.getPropertyValue('--dot-rgb'), colors.base);
    colors.hot = parse(cs.getPropertyValue('--dot-hot-rgb'), colors.hot);
  }

  /* Lay the dots out in a staggered (honeycomb) grid */
  function build() {
    const r = hero.getBoundingClientRect();
    W = Math.round(r.width);
    H = Math.round(r.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gap = W < 768 ? 24 : 28;
    const rowH = gap * 0.866;
    dots = [];
    for (let row = 0, y = gap / 2; y < H + gap; row++, y += rowH) {
      for (let x = row % 2 ? gap : gap / 2; x < W + gap; x += gap) {
        /* soft vignette: dots fade toward the edges and the bottom */
        const nx = (x / W - 0.5) * 2,
          ny = (y / H - 0.35) * 1.3;
        const vig = Math.max(0.25, 1 - (nx * nx * 0.45 + ny * ny * 0.55));
        dots.push({
          hx: x,
          hy: y,
          x: x,
          y: y,
          vx: 0,
          vy: 0,
          r: 1.0 + Math.random() * 0.55,
          tone: Math.floor(Math.random() * 3) /* 3 resting brightness levels */,
          vig: vig,
        });
      }
    }
    draw(0, true);
  }

  const REST_ALPHA = [0.16, 0.22, 0.29];

  function kick() {
    if (reduceMotion || running || !visible || document.hidden) return;
    running = true;
    last = now();
    requestAnimationFrame(frame);
  }

  function frame() {
    const t = now();
    const dt = Math.min(0.05, t - last);
    last = t;
    const moving = draw(dt, false);
    if (moving || pointer.active || waves.length || plucks.length) {
      requestAnimationFrame(frame);
    } else {
      running = false; /* everything has settled — go to sleep */
    }
  }

  /* Physics + drawing in one pass. Returns true while anything is still moving. */
  function draw(dt, firstPaint) {
    const t = now();
    ctx.clearRect(0, 0, W, H);

    waves = waves.filter((w) => t - w.t < 2.2);
    plucks = plucks.filter((p) => t - p.t < 2.4);

    const R = 150,
      K = 60,
      C = 8,
      REPEL = 2400;
    const [br, bg, bb] = colors.base;
    const [hr, hg, hb] = colors.hot;
    const rest = [new Path2D(), new Path2D(), new Path2D()];
    let anyMoving = false;

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      let glow = 0,
        offX = 0,
        offY = 0;

      /* ── spring physics: cursor pushes dots away, spring pulls them home ── */
      let ax = -K * (d.x - d.hx) - C * d.vx;
      let ay = -K * (d.y - d.hy) - C * d.vy;
      if (pointer.active) {
        const dx = d.x - pointer.x,
          dy = d.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) {
          const dist = Math.sqrt(d2),
            f = 1 - dist / R;
          ax += (dx / dist) * f * f * REPEL;
          ay += (dy / dist) * f * f * REPEL;
          glow += Math.pow(f, 1.4);
        }
      }
      if (!firstPaint) {
        d.vx += ax * dt;
        d.vy += ay * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
      }

      /* ── click shockwaves: a ring of push + glow travelling outward ── */
      for (let k = 0; k < waves.length; k++) {
        const w = waves[k],
          age = t - w.t;
        const dx = d.hx - w.x,
          dy = d.hy - w.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = Math.abs(dist - age * 560);
        if (diff < 70) {
          let b = 1 - diff / 70;
          b = b * b * (3 - 2 * b);
          const fade = Math.exp(-age * 1.6);
          offX += (dx / dist) * b * fade * 26;
          offY += (dy / dist) * b * fade * 26;
          glow += b * fade * 1.1;
        }
      }

      /* ── string plucks: sideways shimmer spreading from the string ── */
      for (let k = 0; k < plucks.length; k++) {
        const p = plucks[k],
          age = t - p.t;
        const dxs = d.hx - p.x,
          adx = Math.abs(dxs);
        if (adx < 280) {
          const env = Math.exp(-adx / 120) * Math.exp(-age / 1.2);
          const wgt = 0.5 + 0.5 * Math.exp(-Math.abs(d.hy - p.y) / 380);
          const phase = p.omega * age - adx * 0.05;
          offX += (dxs < 0 ? -1 : 1) * Math.sin(phase) * env * wgt * 20;
          /* gold flash right at the string, fading with distance + time */
          glow += (Math.exp(-adx / 85) * Math.exp(-age / 1.3) * 1.9 + env * 0.35) * wgt;
        }
      }

      if (glow > 1) glow = 1;
      const fx = d.x + offX,
        fy = d.y + offY;

      if (
        !anyMoving &&
        (Math.abs(d.vx) > 0.02 ||
          Math.abs(d.vy) > 0.02 ||
          Math.abs(d.x - d.hx) > 0.05 ||
          Math.abs(d.y - d.hy) > 0.05)
      )
        anyMoving = true;

      if (glow < 0.03) {
        /* resting dot: batched into one of 3 paths (fast) */
        const path = rest[d.tone];
        path.moveTo(fx + d.r, fy);
        path.arc(fx, fy, d.r, 0, 6.2832);
      } else {
        /* active dot: blend violet → gold, grow, brighten */
        const rr = Math.round(br + (hr - br) * glow);
        const gg = Math.round(bg + (hg - bg) * glow);
        const bl = Math.round(bb + (hb - bb) * glow);
        const al = REST_ALPHA[d.tone] * d.vig + glow * 0.8 * (0.5 + 0.5 * d.vig);
        ctx.fillStyle = `rgba(${rr},${gg},${bl},${Math.min(al, 0.95)})`;
        ctx.beginPath();
        ctx.arc(fx, fy, d.r * (1 + glow * 1.3), 0, 6.2832);
        ctx.fill();
      }
    }

    /* resting dots: one fill per brightness level (vignette folded into alpha) */
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(${br},${bg},${bb},${REST_ALPHA[k] * 0.85})`;
      ctx.fill(rest[k]);
    }
    return anyMoving;
  }

  /* ── Input: cursor / finger movement and clicks anywhere on the hero ── */
  function toLocal(e) {
    const r = hero.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  hero.addEventListener('pointermove', (e) => {
    const p = toLocal(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
    kick();
  });
  hero.addEventListener('pointerleave', () => {
    pointer.active = false;
    kick();
  });
  hero.addEventListener('pointercancel', () => {
    pointer.active = false;
    kick();
  });
  hero.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') {
      pointer.active = false;
      kick();
    } /* finger lifted */
  });
  hero.addEventListener('pointerdown', (e) => {
    const p = toLocal(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
    waves.push({ x: p.x, y: p.y, t: now() });
    if (waves.length > 8) waves.shift();
    kick();
  });

  /* ── Input: a string was plucked (event sent by "Guitar string pluck") ── */
  document.addEventListener('hero:pluck', (e) => {
    const r = hero.getBoundingClientRect();
    plucks.push({
      x: e.detail.x - r.left,
      y: e.detail.y - r.top,
      t: now(),
      omega: 24 - e.detail.index * 2.6 /* low E: slow wave … high E: fast wave */,
    });
    if (plucks.length > 24) plucks.shift();
    kick();
  });

  /* ── Housekeeping ── */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) kick();
      },
      { threshold: 0 },
    ).observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });

  let resizeTimer;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        kick();
      }, 120);
    }).observe(hero);
  } else {
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 120);
    });
  }

  /* Re-read colours when the theme is toggled */
  new MutationObserver(() => {
    readColors();
    draw(0, true);
    kick();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  readColors();
  build();
})(); /* End initHeroDots */

/* ===========================================================
   MODULE 5: FLOATING AUDIO PLAYER
   Play/pause ambient guitar loop.
   On touch devices: tapping button toggles tooltip first,
   second tap plays. On desktop: hover reveals tooltip.
   =========================================================== */

const audioPlayer = $('#audio-player');
const audioBtn = $('#audio-btn');
const audioElement = $('#audio-element');
const heroPlayBtn = $('#hero-play-btn');

let isPlaying = false;
let tooltipOpen = false; /* Tracks touch-tooltip state */

function startAudio() {
  const playPromise = audioElement.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        audioPlayer.classList.add('is-playing');
        audioBtn.setAttribute('aria-label', 'Pause ambient guitar music');
        isPlaying = true;
      })
      .catch((err) => {
        console.info('Audio autoplay blocked:', err.message);
      });
  }
}

function pauseAudio() {
  audioElement.pause();
  audioPlayer.classList.remove('is-playing');
  audioBtn.setAttribute('aria-label', 'Play ambient guitar music');
  isPlaying = false;
}

function toggleAudio() {
  isPlaying ? pauseAudio() : startAudio();
}

/* Desktop: clicking the button always toggles play/pause */
audioBtn.addEventListener('click', toggleAudio);

/* Touch devices: first tap opens tooltip, second tap plays/pauses.
   This gives mobile users a chance to see track info before committing. */
audioPlayer.addEventListener(
  'touchstart',
  (e) => {
    if (!tooltipOpen) {
      /* First touch — just show the tooltip */
      e.preventDefault();
      audioPlayer.classList.add('is-hovered');
      tooltipOpen = true;

      /* Auto-hide tooltip after 4 seconds if no second tap */
      setTimeout(() => {
        if (!isPlaying) {
          audioPlayer.classList.remove('is-hovered');
          tooltipOpen = false;
        }
      }, 4000);
    }
    /* Second touch falls through to the button's click handler */
  },
  { passive: false },
);

/* Close tooltip when tapping outside the player */
document.addEventListener('touchstart', (e) => {
  if (tooltipOpen && !audioPlayer.contains(e.target)) {
    audioPlayer.classList.remove('is-hovered');
    tooltipOpen = false;
  }
});

/* Hero "Listen now" button also starts audio */
heroPlayBtn.addEventListener('click', () => {
  if (!isPlaying) startAudio();
});

/* ===========================================================
   MODULE 6: MOBILE NAVIGATION
   Hamburger button opens/closes the slide-down menu.
   Clicking a menu link closes the menu.
   =========================================================== */

const hamburger = $('#hamburger');
const mobileMenu = $('#mobile-menu');

function toggleMobileMenu() {
  const isOpen = mobileMenu.classList.toggle('is-open');
  hamburger.classList.toggle('is-open', isOpen);
  hamburger.setAttribute('aria-expanded', isOpen.toString());
  /* Prevent body scroll while menu is open */
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

hamburger.addEventListener('click', toggleMobileMenu);

/* Close menu when a link is clicked */
$$('a', mobileMenu).forEach((link) => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('is-open');
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });
});

/* Close menu on Escape key */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
    toggleMobileMenu();
  }
});

/* ===========================================================
   MODULE 7: SCROLL REVEAL (Intersection Observer)
   Elements with class .reveal or .reveal-group become
   visible (.visible) when they enter the viewport.
   =========================================================== */

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        /* Unobserve after reveal so it only fires once */
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.15 /* Trigger when 15% of element is visible */,
    rootMargin: '0px 0px -40px 0px' /* Slight offset from bottom */,
  },
);

/* Observe all reveal elements */
$$('.reveal, .reveal-group').forEach((el) => revealObserver.observe(el));

/* Also trigger hero reveals immediately (they're already in view) */
setTimeout(() => {
  $$('#hero .reveal').forEach((el) => el.classList.add('visible'));
}, 200);

/* ===========================================================
   MODULE 8: EVENTS CAROUSEL
   Handles arrow button navigation and dot indicators.
   Touch/swipe is handled natively by CSS scroll-snap.
   Dots stay in sync whether the user swipes or uses buttons.
   =========================================================== */

(function initEventsCarousel() {
  const track = $('#events-track');
  const prevBtn = $('#events-prev');
  const nextBtn = $('#events-next');
  const dotsWrap = $('#events-dots');

  if (!track) return; /* Safety check — bail if section not in DOM */

  const cards = $$('.event-card', track);
  const total = cards.length;
  let activeIndex = 0;

  /* ── Build dot indicators ── */
  cards.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Go to event ${i + 1}`);
    dot.addEventListener('click', () => scrollToCard(i));
    dotsWrap.appendChild(dot);
  });

  const dots = $$('.carousel-dot', dotsWrap);

  /* ── Scroll track to a given card index ── */
  function scrollToCard(index) {
    /* Clamp index within bounds */
    index = Math.max(0, Math.min(index, total - 1));

    const card = cards[index];
    const trackRect = track.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    /* Scroll so the card's left edge aligns with the track's left edge */
    track.scrollBy({
      left: cardRect.left - trackRect.left,
      behavior: 'smooth',
    });

    setActive(index);
  }

  /* ── Update active dot and button states ── */
  function setActive(index) {
    activeIndex = index;

    /* Update dots */
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));

    /* Disable prev/next at the bounds */
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === total - 1;
  }

  /* ── Arrow button handlers ── */
  if (prevBtn) prevBtn.addEventListener('click', () => scrollToCard(activeIndex - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => scrollToCard(activeIndex + 1));

  /* ── Keep dots in sync with native touch scroll ──
     IntersectionObserver watches each card. When a card
     becomes ≥50% visible, it becomes the active index. */
  const cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = cards.indexOf(entry.target);
          if (index !== -1) setActive(index);
        }
      });
    },
    {
      root: track /* Observe within the scrollable track */,
      threshold: 0.5 /* Card must be ≥50% visible to activate */,
    },
  );

  cards.forEach((card) => cardObserver.observe(card));

  /* ── Initial state ── */
  setActive(0);
})(); /* End initEventsCarousel */

/* ===========================================================
   MODULE 9: ANIMATED STAT COUNTERS
   Numbers in the About section count up from 0 to their
   target value when they scroll into view.
   Uses IntersectionObserver — fires once per element.
   =========================================================== */

(function initStatCounters() {
  /* Easing function — starts fast, slows at the end */
  function easeOutQuad(t) {
    return t * (2 - t);
  }

  function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-target'), 10);
    const duration = 1400; /* ms — how long the count takes */
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuad(progress);
      el.textContent = Math.round(eased * target);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target; /* Ensure exact final value */
      }
    }

    requestAnimationFrame(update);
  }

  /* Observe the stats container — trigger when it enters viewport */
  const statsSection = document.querySelector('.about-stats');
  if (!statsSection) return;

  const statsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          /* Animate each number with a small stagger */
          $$('.stat-number', statsSection).forEach((el, i) => {
            setTimeout(() => animateCounter(el), i * 150);
          });
          statsObserver.unobserve(entry.target); /* Fire once only */
        }
      });
    },
    { threshold: 0.4 },
  );

  statsObserver.observe(statsSection);
})(); /* End initStatCounters */

/* ===========================================================
   MODULE 10: JOURNEY TIMELINE
   Two behaviours:
   1. The vertical line fills progressively as the user scrolls
      through the timeline section.
   2. Each milestone dot activates (glows) when its card
      enters the viewport.
   =========================================================== */

(function initJourneyTimeline() {
  const timeline = document.getElementById('journey-timeline');
  const lineFill = document.getElementById('journey-line-fill');
  const items = $$('.journey-item', timeline);

  if (!timeline || !lineFill) return;

  /* ── 1. Progressive line fill on scroll ── */
  function updateLineFill() {
    const rect = timeline.getBoundingClientRect();
    const viewH = window.innerHeight;

    /* How far the viewport has travelled through the timeline */
    const scrolled = viewH - rect.top;
    const total = rect.height + viewH;
    const progress = Math.min(Math.max(scrolled / total, 0), 1);

    lineFill.style.transform = 'scaleY(' + progress + ')';
  }

  window.addEventListener('scroll', updateLineFill, { passive: true });
  updateLineFill(); /* Run once on load */

  /* ── 2. Activate dots as cards enter viewport ── */
  const dotObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-active', entry.isIntersecting);
      });
    },
    {
      threshold: 0.4,
      rootMargin: '0px 0px -80px 0px',
    },
  );

  items.forEach((item) => dotObserver.observe(item));
})(); /* End initJourneyTimeline */

/* ===========================================================
   MODULE 11: VIDEO SHOWCASE
   Self-hosted videos (videos/<name>.mp4), one <video> per card.

   • Every video autoplays MUTED as a silent preview — only the first
     10 seconds, looping. Previews start when the Media section scrolls
     into view and pause when it scrolls away.
   • Pressing a play button moves that video into the big "active" slot
     and plays it WITH SOUND from the start. A video playing with sound
     is never auto-paused: it plays until the visitor pauses it.
   • When it ends, the card returns to its silent preview.
   • Thumbnails sit in a swipeable row (scrolls sideways if there are
     more than fit). Cards glide between slots by animating
     left/top/width/height; the <video> elements are never re-parented,
     so nothing reloads when a card moves.
   • Visitors with reduced-motion or Data Saver turned on get a still
     first frame instead of autoplay; sound-on play still works.
   =========================================================== */

(function initVideoShowcase() {
  const stage = document.getElementById('video-stage');
  if (!stage) return;

  const cards = $$('.vcard', stage);
  if (!cards.length) return;

  const PREVIEW_SECONDS = 10; /* previews loop only this much of each video */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const autoPreview = !reduceMotion && !saveData;

  const videoOf = (card) => card.querySelector('video');
  const isPlaying = (card) => card.classList.contains('is-playing');

  /* order[0] = the big active slot, order[1…] = thumbnail slots */
  const firstActive = cards.find((c) => c.classList.contains('is-active')) || cards[0];
  const order = [firstActive, ...cards.filter((c) => c !== firstActive)];
  cards.forEach((c) => c.classList.toggle('is-active', c === firstActive));

  /* ── Set up each card: ring text, first-frame fade-in, real duration ── */
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  cards.forEach((card) => {
    /* Rotating text ring: one <span> per letter, placed round the circle by CSS */
    card.querySelectorAll('.vcard-ring').forEach((ring) => {
      const chars = [...(ring.dataset.ring || 'Press play · ')];
      ring.style.setProperty('--n', chars.length);
      ring.textContent = '';
      chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.setProperty('--i', i);
        ring.appendChild(span);
      });
    });

    const video = videoOf(card);
    if (!video) return;

    /* Fade the video in over the dark tile once its first frame is ready */
    const reveal = () => video.classList.add('is-loaded');
    if (video.readyState >= 2) reveal();
    else video.addEventListener('loadeddata', reveal, { once: true });

    /* The duration badge always shows the file's real length */
    const showDuration = () => {
      const badge = card.querySelector('.vcard-duration');
      if (badge && isFinite(video.duration)) badge.textContent = formatTime(video.duration);
    };
    if (video.readyState >= 1) showDuration();
    else video.addEventListener('loadedmetadata', showDuration, { once: true });

    /* Previews only loop the first PREVIEW_SECONDS */
    video.addEventListener('timeupdate', () => {
      if (!isPlaying(card) && video.currentTime > PREVIEW_SECONDS) video.currentTime = 0;
    });

    /* Finished watching → back to the silent preview */
    video.addEventListener('ended', () => {
      if (isPlaying(card)) endSound(card);
    });
  });

  /* ── Layout: big card on top, scrolling row of thumbnails below ──
     Thumbnails have a fixed width. If there are more than fit, the row
     scrolls/swipes sideways. A transparent scroller (.video-rail) sits
     over the row and drives the scrolling; JS shifts each thumbnail card
     by the scroll position. */
  const rail = document.createElement('div');
  rail.className = 'video-rail';
  rail.innerHTML = '<div class="video-rail-track"></div>';
  stage.appendChild(rail);
  const track = rail.firstChild;

  let geo = { W: 0, gap: 16, thumbW: 210, thumbH: 118, activeH: 0 };

  function positionCards() {
    order.forEach((card, i) => {
      if (i === 0) {
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.width = geo.W + 'px';
        card.style.height = geo.activeH + 'px';
      } else {
        card.style.left = (i - 1) * (geo.thumbW + geo.gap) - rail.scrollLeft + 'px';
        card.style.top = geo.activeH + geo.gap + 'px';
        card.style.width = geo.thumbW + 'px';
        card.style.height = geo.thumbH + 'px';
      }
    });
  }

  function layout(animate) {
    const W = stage.clientWidth;
    if (!W) return;

    const gap = W < 520 ? 10 : 16;
    const thumbW = W < 600 ? 190 : 210;
    const thumbH = (thumbW * 9) / 16;
    const activeH = (W * 9) / 16;
    const n = order.length - 1; /* number of thumbnails */
    geo = { W, gap, thumbW, thumbH, activeH };

    if (!animate) stage.classList.add('no-anim');

    rail.style.top = activeH + gap + 'px';
    rail.style.height = thumbH + 'px';
    rail.style.display = n ? '' : 'none';
    track.style.width = n * thumbW + Math.max(0, n - 1) * gap + 'px';

    /* one invisible snap marker per thumbnail, so swiping settles neatly */
    while (track.children.length < n) track.appendChild(document.createElement('i'));
    while (track.children.length > n) track.lastChild.remove();
    [...track.children].forEach((marker, k) => {
      marker.style.left = k * (thumbW + gap) + 'px';
      marker.style.width = thumbW + 'px';
    });

    positionCards();
    stage.style.height = activeH + (n ? gap + thumbH : 0) + 'px';

    if (!animate) {
      void stage.offsetWidth; /* flush, then re-enable transitions */
      stage.classList.remove('no-anim');
    }
  }

  rail.addEventListener('scroll', positionCards, { passive: true });

  /* ── Silent previews: start when visible, pause when not ── */
  let started = false;
  let inView = false;

  function playPreview(card) {
    const video = videoOf(card);
    if (!video) return;
    video.muted = true;
    video.loop = true;
    video.controls = false;
    video.play().catch(() => {});
  }

  function startPreviews() {
    order.forEach((card, i) => {
      setTimeout(() => {
        if (!isPlaying(card)) playPreview(card);
      }, i * 250); /* staggered */
    });
  }

  /* Only the silent PREVIEWS pause when the section is off-screen (saves data and
     battery). A video the visitor started with sound is never paused by scrolling
     or by switching tabs. */
  function pausePreviews() {
    cards.forEach((c) => {
      if (!isPlaying(c)) videoOf(c).pause();
    });
  }
  function resumePreviews() {
    cards.forEach((c) => {
      if (!isPlaying(c)) playPreview(c);
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        if (inView) {
          if (!started) {
            started = true;
            if (autoPreview) startPreviews();
          } else if (autoPreview) resumePreviews();
        } else if (started) {
          pausePreviews();
        }
      },
      { threshold: 0.2 },
    ).observe(stage);
  } else if (autoPreview) {
    started = true;
    startPreviews();
  }

  document.addEventListener('visibilitychange', () => {
    if (!started) return;
    if (document.hidden) pausePreviews();
    else if (inView && autoPreview) resumePreviews();
  });

  /* ── Sound on / sound off ── */
  function startSound(card) {
    const video = videoOf(card);
    card.classList.add('is-playing');
    video.muted = false;
    video.loop = false;
    video.controls = true;
    video.currentTime = 0;
    video.play().catch(() => {}); /* if blocked, the native play button is right there */
  }

  function endSound(card) {
    const video = videoOf(card);
    card.classList.remove('is-playing');
    video.controls = false;
    video.muted = true;
    video.loop = true;
    video.currentTime = 0;
    if (autoPreview && inView) video.play().catch(() => {});
    else video.pause();
  }

  /* ── Press play: move to the big slot + play with sound ── */
  let moveTimer;

  function activate(card) {
    if (isPlaying(card)) return;

    const prev = order[0];
    cards.forEach((c) => c.classList.remove('is-hover'));

    if (card !== prev) {
      /* swap the two cards' slots */
      const i = order.indexOf(card);
      order[0] = card;
      order[i] = prev;

      const prevWasPlaying = isPlaying(prev);
      prev.classList.remove('is-active');
      card.classList.add('is-active');

      /* glide to the new positions */
      stage.classList.add('is-moving');
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => stage.classList.remove('is-moving'), reduceMotion ? 0 : 580);
      layout(true);

      /* the old active video goes back to being a silent preview */
      if (prevWasPlaying) endSound(prev);

      /* if the stage's top has scrolled out of sight, bring it back */
      const top = stage.getBoundingClientRect().top;
      if (top < 70) {
        window.scrollTo({
          top: window.scrollY + top - 100,
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      }
    }

    /* play with sound (runs straight from the click, so browsers allow audio) */
    startSound(card);
  }

  /* Click on the big card (or keyboard Enter on any play button) */
  stage.addEventListener('click', (e) => {
    const card = e.target.closest('.vcard');
    if (card && stage.contains(card)) activate(card);
  });

  /* Thumbnails sit under the scroller, so work out which one was tapped */
  const cursorEl = document.getElementById('cursor');
  function thumbAt(x) {
    return order.slice(1).find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x <= r.right;
    });
  }

  let dragStart = null;
  let dragged = false;

  rail.addEventListener('click', (e) => {
    if (dragged) {
      dragged = false;
      return;
    } /* it was a drag, not a tap */
    const card = thumbAt(e.clientX);
    if (card) activate(card);
  });

  /* Hover feedback for mouse users (the cards are under the scroller) */
  rail.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const hit = thumbAt(e.clientX);
    order.slice(1).forEach((c) => c.classList.toggle('is-hover', c === hit));
    if (cursorEl) cursorEl.classList.toggle('is-hovering', !!hit);
  });
  rail.addEventListener('pointerleave', () => {
    order.forEach((c) => c.classList.remove('is-hover'));
    if (cursorEl) cursorEl.classList.remove('is-hovering');
  });

  /* Click-and-drag scrolling with a mouse (touch + trackpad scroll natively) */
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragStart = { x: e.clientX, left: rail.scrollLeft };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    if (Math.abs(dx) > 5) {
      dragged = true;
      rail.style.scrollSnapType = 'none';
      rail.scrollLeft = dragStart.left - dx;
    }
  });
  window.addEventListener('pointerup', () => {
    if (!dragStart) return;
    dragStart = null;
    rail.style.scrollSnapType = '';
  });

  /* Tabbing to a thumbnail's play button scrolls it into view */
  stage.addEventListener('focusin', (e) => {
    const card = e.target.closest('.vcard');
    const i = order.indexOf(card);
    if (i > 0) {
      const x = (i - 1) * (geo.thumbW + geo.gap) - (geo.W - geo.thumbW) / 2;
      rail.scrollTo({ left: Math.max(0, x), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  });

  /* ── Initial layout + keep it right on resize ── */
  stage.classList.add('is-ready');
  layout(false);

  if ('ResizeObserver' in window) {
    let lastW = stage.clientWidth;
    new ResizeObserver(() => {
      const w = stage.clientWidth;
      if (w !== lastW) {
        lastW = w;
        layout(false);
      }
    }).observe(stage);
  } else {
    window.addEventListener('resize', () => layout(false));
  }
})();

/* ===========================================================
   MODULE 12: GALLERY MOBILE LIMIT
   Collapses gallery to first 6 items on mobile.
   "Show all" button expands to full grid.
   "Show less" collapses it back and scrolls up to gallery.
   =========================================================== */

(function initGalleryToggle() {
  const grid = document.getElementById('gallery-grid');
  const toggleBtn = document.getElementById('gallery-toggle-btn');

  if (!grid || !toggleBtn) return;

  /* Only activate the limit on narrow screens */
  const isMobile = () => window.innerWidth < 600;

  function collapse() {
    grid.classList.add('is-gallery-collapsed');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
               id="gallery-toggle-icon" aria-hidden="true">
            <path d="M2 4l5 5 5-5"/>
          </svg>
          Show all photos`;
  }

  function expand() {
    grid.classList.remove('is-gallery-collapsed');
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
               id="gallery-toggle-icon" aria-hidden="true">
            <path d="M2 10l5-5 5 5"/>
          </svg>
          Show less`;
  }

  /* Start collapsed on mobile */
  if (isMobile()) collapse();

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = grid.classList.contains('is-gallery-collapsed');
    if (isCollapsed) {
      expand();
    } else {
      collapse();
      /* Scroll back up to the gallery header */
      document
        .querySelector('.media-gallery-header')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  /* Re-apply on resize (e.g. rotating phone) */
  window.addEventListener(
    'resize',
    () => {
      if (!isMobile()) {
        grid.classList.remove('is-gallery-collapsed');
      } else if (toggleBtn.getAttribute('aria-expanded') === 'false') {
        collapse();
      }
    },
    { passive: true },
  );
})();

/* ===========================================================
   MODULE 13: GALLERY FILTER
   Filter buttons show/hide items by data-category.
   Uses CSS opacity + pointer-events for smooth transition.
   =========================================================== */

(function initGalleryFilter() {
  const filters = $$('.gallery-filter');
  const items = $$('.gallery-item');

  if (!filters.length) return;

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');

      /* Update active button */
      filters.forEach((f) => f.classList.remove('is-active'));
      btn.classList.add('is-active');

      /* Show/hide items */
      items.forEach((item) => {
        const cat = item.getAttribute('data-category');
        const show = filter === 'all' || cat === filter;
        item.classList.toggle('is-hidden', !show);
      });
    });
  });
})();

/* ===========================================================
   MODULE 14: PHOTO LIGHTBOX
   Clicking a gallery item opens a full-screen lightbox.
   The lightbox shows the full-size photo with its alt text as caption.
   Close via button, clicking backdrop, or Escape key.
   =========================================================== */

(function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCap = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close');
  const lightboxBg = document.getElementById('lightbox-bg');

  if (!lightbox) return;

  function openLightbox(src, caption) {
    lightboxImg.src = src;
    lightboxImg.alt = caption || '';
    lightboxCap.textContent = caption || '';
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }

  /* Open on gallery item click */
  $$('.gallery-item').forEach((item) => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      if (img && !img.classList.contains('is-broken')) openLightbox(img.src, img.alt);
    });

    /* Keyboard accessible */
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });

  /* Close handlers */
  closeBtn.addEventListener('click', closeLightbox);
  lightboxBg.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
})();

/* ===========================================================
   MODULE 15: IMAGE FALLBACKS
   If a photo file is missing, hide the browser's broken-image icon
   and show a soft tile instead (gallery), or the person's first
   initial (testimonial avatars). The styles are in css/style.css.
   =========================================================== */

(function initImageFallbacks() {
  function markBroken(img) {
    if (!img.getAttribute('src')) return; /* e.g. the empty lightbox <img> */
    img.classList.add('is-broken');

    const tile = img.closest('.gallery-item');
    if (tile) tile.classList.add('is-broken');

    const avatar = img.closest('.testi-avatar');
    if (avatar) avatar.dataset.initial = (img.alt.trim()[0] || '?').toUpperCase();
  }

  $$('img').forEach((img) => {
    img.addEventListener('error', () => markBroken(img));
    img.addEventListener('load', () => img.classList.remove('is-broken'));
    /* The image may already have failed before this script ran */
    if (img.complete && img.naturalWidth === 0) markBroken(img);
  });
})();

/* ===========================================================
   MODULE 16: TESTIMONIALS CAROUSEL
   - Slides translate left/right on prev/next
   - Active slide fades in; inactive fades out
   - Auto-advances every AUTO_DURATION ms
   - Progress bar fills over AUTO_DURATION, resets on change
   - Pauses on hover (desktop) or touch (mobile)
   - Dot indicators: active dot stretches to a pill
   =========================================================== */

(function initTestimonialsCarousel() {
  const carousel = document.getElementById('testi-carousel');
  const track = document.getElementById('testi-track');
  const dotsWrap = document.getElementById('testi-dots');
  const prevBtn = document.getElementById('testi-prev');
  const nextBtn = document.getElementById('testi-next');
  const progressFill = document.getElementById('testi-progress-fill');

  if (!carousel || !track) return;

  const slides = $$('.testimonial-slide', track);
  const total = slides.length;
  const AUTO_DURATION = 6000; /* ms between auto-advances */
  let current = 0;
  let autoTimer = null;
  let isPaused = false;

  /* Set the CSS transition duration to match AUTO_DURATION */
  progressFill.style.setProperty('--testi-duration', AUTO_DURATION / 1000 + 's');

  /* ── Build dot indicators ── */
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'testi-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  });

  const dots = $$('.testi-dot', dotsWrap);

  /* ── Go to a specific slide ── */
  function goTo(index, skipReset = false) {
    /* Deactivate current */
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');

    /* Update index with wrap-around */
    current = (index + total) % total;

    /* Translate the track */
    track.style.transform = `translateX(-${current * 100}%)`;

    /* Activate new slide */
    slides[current].classList.add('is-active');
    dots[current].classList.add('is-active');

    /* Restart progress bar */
    if (!skipReset) resetProgress();
  }

  /* ── Progress bar ── */
  function resetProgress() {
    /* Force reflow so the transition restarts cleanly */
    progressFill.classList.remove('is-running');
    progressFill.style.transition = 'none';
    void progressFill.offsetWidth; /* Trigger reflow */
    progressFill.style.transition = '';
    progressFill.classList.add('is-running');
  }

  /* ── Auto-advance ── */
  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      if (!isPaused && !isOffScreen) goTo(current + 1);
    }, AUTO_DURATION);
  }

  /* ── Pause when carousel scrolls off screen ──
     No point animating when nobody can see it, and it
     prevents audio/animation work happening in background. */
  let isOffScreen = false;
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      isOffScreen = !entries[0].isIntersecting;
      /* Restart progress bar when it comes back into view */
      if (!isOffScreen) resetProgress();
    },
    { threshold: 0.2 },
  );
  visibilityObserver.observe(carousel);

  /* ── Pause on hover/focus (desktop) ── */
  carousel.addEventListener('mouseenter', () => {
    isPaused = true;
  });
  carousel.addEventListener('mouseleave', () => {
    isPaused = false;
  });

  /* ── Pause on touch (mobile) ── */
  let touchStartX = 0;
  carousel.addEventListener(
    'touchstart',
    (e) => {
      isPaused = true;
      touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );

  carousel.addEventListener(
    'touchend',
    (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        /* Swipe left → next, swipe right → prev */
        goTo(diff > 0 ? current + 1 : current - 1);
      }
      isPaused = false;
    },
    { passive: true },
  );

  /* ── Arrow buttons ── */
  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  /* ── Keyboard navigation ── */
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') goTo(current - 1);
    if (e.key === 'ArrowRight') goTo(current + 1);
  });

  /* ── Initialise ── */
  slides[0].classList.add('is-active');
  resetProgress();
  startAuto();
})(); /* End initTestimonialsCarousel */

/* ===========================================================
   MODULE 17: GEAR TABS
   Clicking a tab button shows the corresponding gear panel
   and hides all others. Re-runs reveal animations on the
   newly shown panel's cards.
   =========================================================== */

(function initGearTabs() {
  const tabs = $$('.gear-tab');
  const panels = $$('.gear-panel');

  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-panel');
      const target = document.getElementById(targetId);
      if (!target) return;

      /* Deactivate all tabs and panels */
      tabs.forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach((p) => p.classList.remove('is-active'));

      /* Activate clicked tab and its panel */
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      target.classList.add('is-active');

      /* Re-trigger reveal animations for cards in this panel */
      $$('.reveal-group, .reveal', target).forEach((el) => {
        el.classList.remove('visible');
        /* Small timeout so the remove is painted before re-adding */
        setTimeout(() => el.classList.add('visible'), 30);
      });
    });
  });

  /* Initialise — mark first panel's children as visible */
  const firstPanel = document.querySelector('.gear-panel.is-active');
  if (firstPanel) {
    $$('.reveal-group, .reveal', firstPanel).forEach((el) => {
      setTimeout(() => el.classList.add('visible'), 100);
    });
  }
})(); /* End initGearTabs */

/* ===========================================================
   MODULE 18: CONTACT FORM VALIDATION & SUBMISSION
   Client-side validation runs on submit.
   On success: hides form fields, shows success message.
   On network error: shows error message with fallback links.

   TO WIRE TO FORMSPREE:
     1. Add action="https://formspree.io/f/YOUR_ID" to <form>
     2. Add method="POST" to <form>
     3. Remove the e.preventDefault() line below
     4. Formspree handles redirect/success automatically
     OR keep preventDefault() and use the fetch() approach
     shown in the comments below for AJAX submission.
   =========================================================== */

(function initContactForm() {
  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('form-submit');
  const successMsg = document.getElementById('form-success');
  const errorMsg = document.getElementById('form-error');

  if (!form) return;

  /* ── Validate a single field ── */
  function validateField(input) {
    const field = input.closest('.form-field');
    const errorEl = field ? field.querySelector('.form-error') : null;
    let message = '';

    if (input.required && !input.value.trim()) {
      message = 'This field is required.';
    } else if (input.type === 'email' && input.value) {
      /* Basic email format check */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
        message = 'Please enter a valid email address.';
      }
    }

    input.classList.toggle('is-invalid', !!message);
    if (errorEl) errorEl.textContent = message;
    return !message;
  }

  /* Validate on blur (when user leaves a field) */
  form.querySelectorAll('.form-input').forEach((input) => {
    input.addEventListener('blur', () => validateField(input));
    /* Clear error as user types */
    input.addEventListener('input', () => {
      if (input.classList.contains('is-invalid')) validateField(input);
    });
  });

  /* ── Form submit ── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); /* Remove this line if using Formspree redirect */

    /* Validate all fields */
    const inputs = [...form.querySelectorAll('.form-input[required]')];
    const allValid = inputs.map(validateField).every(Boolean);
    if (!allValid) {
      /* Focus the first invalid field */
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    /* Loading state */
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      /* ── FORMSPREE AJAX SUBMISSION ──
         Uncomment and replace YOUR_FORM_ID to use Formspree
         without a page redirect:

      const response = await fetch('https://formspree.io/f/YOUR_FORM_ID', {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error('Submission failed');
      */

      /* DEMO: simulate a successful submission (remove when wired up) */
      await new Promise((resolve) => setTimeout(resolve, 1200));

      /* ── Success ── */
      form
        .querySelectorAll('.form-row, .form-field, .form-submit')
        .forEach((el) => (el.style.display = 'none'));
      successMsg.hidden = false;
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      /* ── Error ── */
      console.error('Form submission error:', err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send inquiry';
      errorMsg.hidden = false;
    }
  });
})(); /* End initContactForm */

/* ===========================================================
   MODULE 19: FOOTER YEAR
   Keeps the copyright year current automatically.
   =========================================================== */

const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
