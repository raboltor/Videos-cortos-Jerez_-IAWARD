// SERIES ENGINE - deterministic 45 s renderer for the AI-at-ACCIONA vertical series.
// render(t) is a pure function of time: no state accumulates between frames, so play,
// pause, seek, restart and frame-by-frame export always agree.
(function () {
  'use strict';

  // ---------- math ----------------------------------------------------------------------------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeBack = (k) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  };
  // fade in over [a, a+fi], hold, fade out over [b-fo, b]
  const window_ = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- engine --------------------------------------------------------------------------
  class Episode {
    constructor(canvas, series, cfg) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.S = series;
      this.C = cfg;
      this.P = series.palette;
      this.L = series.layout;
      this.T = series.type;
      canvas.width = series.width;
      canvas.height = series.height;
      this.audit = null; // set to [] to collect every text box (used by tools/validate.mjs)
      this.showSafe = false;
      this._buildNoise();
    }

    // ---- infrastructure ----
    _buildNoise() {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const img = g.createImageData(256, 256);
      const rnd = mulberry32(7);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(rnd() * 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.noise = c;
    }

    chapterAt(t) {
      const tl = this.S.timeline;
      for (const c of tl) if (t >= c.start && t < c.end) return c;
      return tl[tl.length - 1];
    }

    font(size, weight = 800) {
      return `${weight} ${size}px ${this.T.family}`;
    }

    measure(str, size, weight = 800) {
      this.ctx.font = this.font(size, weight);
      return this.ctx.measureText(str).width;
    }

    wrap(str, size, weight, maxW) {
      if (str.includes('\n')) return str.split('\n').flatMap((part) => this.wrap(part, size, weight, maxW));
      const words = str.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (line && this.measure(test, size, weight) > maxW) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      return lines;
    }

    // Draws text and (optionally) records its on-screen box for validation.
    text(str, x, y, o = {}) {
      const ctx = this.ctx;
      const size = o.size || this.T.label;
      const weight = o.weight || 700;
      ctx.save();
      ctx.font = this.font(size, weight);
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = 'alphabetic';
      if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
      if (o.glow) {
        ctx.shadowColor = o.glow;
        ctx.shadowBlur = o.glowBlur || 24;
      }
      ctx.fillStyle = o.color || this.P.text;
      if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
      ctx.fillText(str, x, y);
      const w = ctx.measureText(str).width;
      if (this.audit && ctx.globalAlpha > 0.02) {
        const left = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x;
        const m = ctx.getTransform();
        const p0 = m.transformPoint(new DOMPoint(left, y - size * 0.74));
        const p1 = m.transformPoint(new DOMPoint(left + w, y + size * 0.2));
        this.audit.push({
          text: str, role: o.role || 'label', size: size * m.a, alpha: ctx.globalAlpha,
          x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y,
        });
      }
      ctx.restore();
      return w;
    }

    rr(x, y, w, h, r) {
      const ctx = this.ctx;
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // ---- primitives --------------------------------------------------------------------------
    chip(str, x, y, o = {}) {
      // y = vertical centre; returns width
      const ctx = this.ctx, P = this.P;
      const size = o.size || this.T.labelMin;
      const padX = o.padX || 26, h = size + 30;
      const w = this.measure(str, size, 700) + padX * 2 + (o.icon ? size * 0.9 : 0);
      const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      ctx.save();
      if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
      this.rr(left, y - h / 2, w, h, h / 2);
      ctx.fillStyle = o.bg || P.surface2;
      ctx.fill();
      if (o.border) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = o.border;
        if (o.dashed) ctx.setLineDash([10, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      let tx = left + padX;
      if (o.icon === 'check') {
        this.check(tx + size * 0.32, y, size * 0.55, o.fg || P.text, 5);
        tx += size * 0.9;
      } else if (o.icon === 'ai') {
        this.sparkle(tx + size * 0.32, y, size * 0.34, o.fg || P.cyan);
        tx += size * 0.9;
      } else if (o.icon === 'buyer') {
        this.buyer(tx + size * 0.32, y, size * 0.36, o.fg || P.text);
        tx += size * 0.9;
      }
      ctx.restore();
      this.text(str, tx, y + size * 0.36, {
        size, weight: 700, color: o.fg || P.text, alpha: o.alpha, role: o.role || 'label',
      });
      return w;
    }

    check(x, y, s, color, lw = 6) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y + s * 0.02);
      ctx.lineTo(x - s * 0.15, y + s * 0.38);
      ctx.lineTo(x + s * 0.55, y - s * 0.38);
      ctx.stroke();
      ctx.restore();
    }

    sparkle(x, y, r, color) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.32;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Generic person glyph used for the human role (no face, no robot).
    buyer(x, y, r, color, fill = false) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.38, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.62, r * 0.78, r * 0.52, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (fill) return;
    }

    agentNode(x, y, r, t, color, alpha = 1) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha *= alpha;
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.8 + i * 0.5) % 1;
        ctx.strokeStyle = rgba(color, (1 - k) * 0.55);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r + k * r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(color, 0.55));
      g.addColorStop(1, rgba(color, 0.08));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      this.sparkle(x, y, r * 0.5, '#ffffff');
    }

    doc(x, y, w, h, o = {}) {
      // page with folded corner; x,y = top-left
      const ctx = this.ctx, P = this.P;
      const f = Math.min(w, h) * 0.22;
      ctx.save();
      if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
      if (o.rot) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(o.rot);
        ctx.translate(-x - w / 2, -y - h / 2);
      }
      if (o.glow) {
        ctx.shadowColor = o.glow;
        ctx.shadowBlur = 40;
      }
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.arcTo(x, y, x + 8, y, 8);
      ctx.lineTo(x + w - f, y);
      ctx.lineTo(x + w, y + f);
      ctx.lineTo(x + w, y + h - 8);
      ctx.arcTo(x + w, y + h, x + w - 8, y + h, 8);
      ctx.lineTo(x + 8, y + h);
      ctx.arcTo(x, y + h, x, y + h - 8, 8);
      ctx.closePath();
      ctx.fillStyle = o.fill || P.surface2;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = o.lw || 3;
      ctx.strokeStyle = o.stroke || '#3a3e4c';
      if (o.dashed) ctx.setLineDash([9, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x + w - f, y);
      ctx.lineTo(x + w - f, y + f);
      ctx.lineTo(x + w, y + f);
      ctx.stroke();
      if (o.accent) {
        ctx.fillStyle = o.accent;
        ctx.fillRect(x + w * 0.14, y + h * 0.16, w * 0.38, Math.max(4, h * 0.06));
      }
      const lines = o.lines === undefined ? 3 : o.lines;
      ctx.fillStyle = o.lineColor || '#4a4f60';
      for (let i = 0; i < lines; i++) {
        const lw = (i % 3 === 2 ? 0.45 : 0.68) * w;
        ctx.fillRect(x + w * 0.14, y + h * (0.36 + i * 0.16), lw, Math.max(3, h * 0.045));
      }
      ctx.restore();
    }

    bubble(x, y, w, h, alpha = 1, color) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha *= alpha;
      this.rr(x, y, w, h, 22);
      ctx.fillStyle = this.P.surface2;
      ctx.fill();
      ctx.strokeStyle = color || '#3a3e4c';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 30, y + h);
      ctx.lineTo(x + 26, y + h + 22);
      ctx.lineTo(x + 54, y + h);
      ctx.fillStyle = this.P.surface2;
      ctx.fill();
      ctx.fillStyle = '#4a4f60';
      ctx.fillRect(x + 24, y + h * 0.32, w * 0.55, 8);
      ctx.fillRect(x + 24, y + h * 0.58, w * 0.35, 8);
      ctx.fillStyle = color || this.P.text2;
      ctx.font = this.font(h * 0.5, 800);
      ctx.textAlign = 'center';
      ctx.fillText('?', x + w - 34, y + h * 0.68);
      ctx.restore();
    }

    // The recurring purchase request (fictional illustration).
    requestCard(cx, cy, w, h, o = {}) {
      const ctx = this.ctx, P = this.P, hero = this.C.openingVisual.hero;
      const x = cx - w / 2, y = cy - h / 2;
      ctx.save();
      if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
      ctx.shadowColor = o.glow || P.redGlow;
      ctx.shadowBlur = o.glowSize || 60;
      this.rr(x, y, w, h, 28);
      ctx.fillStyle = P.surface;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = o.border || '#343846';
      ctx.stroke();
      // red top strip
      ctx.save();
      this.rr(x, y, w, h, 28);
      ctx.clip();
      ctx.fillStyle = P.red;
      ctx.fillRect(x, y, w, 12);
      ctx.restore();
      // doc glyph
      this.doc(x + 34, y + 44, 64, 80, { fill: '#1c1f28', stroke: P.red, lines: 2, lw: 3 });
      this.text(hero.kind, x + 124, y + 86, { size: 44, weight: 800, role: 'label' });
      this.text(hero.item, x + 124, y + 138, { size: 42, weight: 600, color: P.text2, role: 'label' });
      ctx.restore();
      const a = o.alpha === undefined ? 1 : o.alpha;
      if (o.fields) {
        // structured fields being filled by the agent
        o.fields.forEach((f, i) => {
          const fy = y + 205 + i * 60;
          const k = o.fieldProgress ? o.fieldProgress[i] : 1;
          this.text(f, x + 40, fy, { size: 42, weight: 600, color: P.text2, alpha: a, role: 'label' });
          const bx = x + w * 0.56, bw = w * 0.36;
          ctx.save();
          ctx.globalAlpha *= a;
          this.rr(bx, fy - 30, bw, 26, 13);
          ctx.fillStyle = '#20232d';
          ctx.fill();
          if (k > 0) {
            this.rr(bx, fy - 30, bw * k, 26, 13);
            ctx.fillStyle = P.cyan;
            ctx.shadowColor = P.cyanGlow;
            ctx.shadowBlur = 16;
            ctx.fill();
          }
          ctx.restore();
        });
      }
      if (o.status) {
        const st = o.status;
        this.chip(st.text, x + 40, o.fields ? y + h - 52 : y + h - 66, {
          size: 42, bg: st.bg, fg: st.fg, border: st.border, dashed: st.dashed, icon: st.icon, alpha: a,
        });
      }
      if (o.note) {
        this.text(hero.note, x + w - 30, y + h + 46, {
          size: this.T.note, weight: 600, color: P.muted, align: 'right', alpha: a, role: 'note',
        });
      }
    }

    status(kind, text) {
      const P = this.P;
      if (kind === 'proposed') return { text, fg: P.cyan, bg: 'rgba(46,230,242,0.08)', border: P.cyan, dashed: true, icon: 'ai' };
      if (kind === 'approved') return { text, fg: '#fff', bg: P.red, border: P.red, icon: 'check' };
      if (kind === 'ai') return { text, fg: P.cyan, bg: 'rgba(46,230,242,0.08)', border: rgba(P.cyan, 0.6), icon: 'ai' };
      return { text, fg: P.text2, bg: P.surface2, border: '#3a3e4c' };
    }

    // ---- frame -------------------------------------------------------------------------------
    render(t) {
      t = clamp(t, 0, this.S.duration - 1e-6);
      const ctx = this.ctx;
      if (this.audit) this.audit.length = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      const ch = this.chapterAt(t);
      this.background(t, ch);

      ctx.save();
      this.camera(t, ch);
      const fn = VISUALS[this.visualFor(ch.id).type];
      if (!fn) throw new Error('Unknown visual type: ' + this.visualFor(ch.id).type);
      fn(this, t, ch, this.visualFor(ch.id));
      ctx.restore();

      if (ch.id === 'opening' || ch.id === 'closing') this.titleBlock(t, ch);
      else {
        this.progressBar(t, ch);
        this.chapterLabel(t, ch);
        this.messages(t, ch);
      }
      this.wipe(t);
      this.subtitles(t);
      this.vignetteTop();
      if (this.showSafe) this.safeOverlay();
    }

    visualFor(id) {
      const C = this.C;
      return {
        opening: C.openingVisual,
        project: C.projectDescription.visual,
        need: C.need.visual,
        how: C.workflow.visual,
        value: C.value.visual,
        next: C.nextSteps.visual,
        closing: C.openingVisual,
      }[id];
    }

    messagesFor(id) {
      const C = this.C;
      return ({
        project: C.projectDescription.messages,
        need: C.need.messages,
        how: C.workflow.messages,
        value: C.value.messages,
        next: C.nextSteps.messages,
      }[id]) || [];
    }

    background(t, ch) {
      const ctx = this.ctx, P = this.P, W = this.S.width, H = this.S.height;
      ctx.fillStyle = P.bg;
      ctx.fillRect(0, 0, W, H);
      // slow-moving light pools for depth
      const gx = 540 + Math.sin(t * 0.21) * 220, gy = 1500 + Math.cos(t * 0.17) * 120;
      let g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 900);
      g.addColorStop(0, 'rgba(229,37,41,0.20)');
      g.addColorStop(1, 'rgba(229,37,41,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const cx = 820 + Math.cos(t * 0.13) * 160, cy = 620 + Math.sin(t * 0.19) * 140;
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 760);
      g.addColorStop(0, 'rgba(46,230,242,0.10)');
      g.addColorStop(1, 'rgba(46,230,242,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // faint perspective grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 2;
      const off = (t * 18) % 120;
      for (let y = -120 + off; y < H; y += 120) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let x = 60; x < W; x += 120) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.restore();
      // film grain (deterministic, stepped 12 times per second)
      ctx.save();
      ctx.globalAlpha = 0.045;
      ctx.globalCompositeOperation = 'overlay';
      const step = Math.floor(t * 12);
      const ox = (step * 73) % 256, oy = (step * 151) % 256;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = ctx.createPattern(this.noise, 'repeat');
      ctx.fillRect(0, 0, W + 256, H + 256);
      ctx.restore();
    }

    vignetteTop() {
      const ctx = this.ctx, W = this.S.width, H = this.S.height;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    camera(t, ch) {
      // controlled, subtle camera move per chapter; applied to visuals only, never to text bands
      const ctx = this.ctx;
      const k = easeInOut(prog(t, ch.start, ch.end));
      const moves = {
        opening: [1.0, 1.035, 0, -10],
        project: [1.0, 1.03, 0, -12],
        need: [1.03, 1.0, 0, 0],
        how: [1.0, 1.02, 0, 0],
        value: [1.06, 1.0, 0, 0],
        next: [1.0, 1.03, 0, -8],
        closing: [1.02, 1.0, 0, 0],
      }[ch.id] || [1, 1, 0, 0];
      let s = lerp(moves[0], moves[1], k);
      if (ch.id === 'value') s = lerp(1.04, 1.0, easeOut(prog(t, 30, 31.2)));
      const ox = 495, oy = 960;
      ctx.translate(ox + moves[2] * k, oy + moves[3] * k);
      ctx.scale(s, s);
      ctx.translate(-ox, -oy);
    }

    safeOverlay() {
      const ctx = this.ctx, s = this.S.safe, W = this.S.width, H = this.S.height;
      ctx.save();
      ctx.fillStyle = 'rgba(229,37,41,0.14)';
      ctx.fillRect(0, 0, W, s.top);
      ctx.fillRect(0, H - s.bottom, W, s.bottom);
      ctx.fillRect(0, s.top, s.left, H - s.top - s.bottom);
      ctx.fillRect(W - s.right, s.top, s.right, H - s.top - s.bottom);
      ctx.strokeStyle = '#2EE6F2';
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 2;
      ctx.strokeRect(s.left, s.top, W - s.left - s.right, H - s.top - s.bottom);
      ctx.restore();
    }

    // ---- series chrome (identical in every episode) -------------------------------------------
    titleBlock(t, ch) {
      const P = this.P, C = this.C, L = this.L, x = this.S.safe.left;
      const closing = ch.id === 'closing';
      // series identifier
      const ia = closing ? easeOut(prog(t, 43.05, 43.45)) : 1;
      this.text(C.company, x, 236, { size: 46, weight: 800, spacing: 6, alpha: ia, role: 'series' });
      const ep = `${String(C.episodeNumber).padStart(2, '0')} / ${C.totalEpisodes}`;
      this.text(ep, 900, 236, { size: 46, weight: 700, color: P.text2, align: 'right', alpha: ia, role: 'series' });
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = ia;
      ctx.fillStyle = P.red;
      ctx.fillRect(x, 262, 810, 4);
      ctx.restore();
      // title: visible from frame 0; settles with a small scale
      const ta = closing ? easeOut(prog(t, 43.1, 43.55)) : 1;
      const ts = closing ? lerp(1.06, 1, easeOut(prog(t, 43.1, 43.7))) : lerp(1.04, 1, easeOut(prog(t, 0, 0.8)));
      ctx.save();
      ctx.translate(x, 420);
      ctx.scale(ts, ts);
      this.text(C.projectTitle, 0, 0, {
        size: this.T.title, weight: 800, alpha: ta, glow: P.redGlow, glowBlur: 40, role: 'title',
      });
      ctx.restore();
      // tagline
      const line = closing ? C.closingLine : C.tagline;
      const lines = this.wrap(line, 76, 800, 810);
      const la = closing ? easeOut(prog(t, 43.25, 43.7)) : 1;
      lines.forEach((ln, i) => {
        const col = closing && i === lines.length - 1 ? P.red : i === 0 ? P.text : P.text2;
        this.text(ln, x, 520 + i * 84, { size: 76, weight: 800, color: col, alpha: la, role: 'message' });
      });
      if (lines.length > 2) console.warn('Tagline wraps to more than two lines:', line);
    }

    progressBar(t, ch) {
      const ctx = this.ctx, P = this.P;
      const chapters = this.S.timeline.filter((c) => c.label);
      const x0 = 90, x1 = 900, gap = 12, y = this.L.progressY;
      const w = (x1 - x0 - gap * (chapters.length - 1)) / chapters.length;
      const a = Math.min(prog(t, 4, 4.4), 1 - prog(t, 42.7, 43));
      ctx.save();
      ctx.globalAlpha = a;
      chapters.forEach((c, i) => {
        const x = x0 + i * (w + gap);
        this.rr(x, y, w, 8, 4);
        ctx.fillStyle = '#2a2d38';
        ctx.fill();
        const k = prog(t, c.start, c.end);
        if (k > 0) {
          this.rr(x, y, w * k, 8, 4);
          ctx.fillStyle = c.id === ch.id ? P.red : '#8a1d20';
          ctx.fill();
        }
      });
      ctx.restore();
    }

    chapterLabel(t, ch) {
      const P = this.P, ctx = this.ctx;
      const k = easeOut(prog(t, ch.start + 0.05, ch.start + 0.45));
      const out = prog(t, ch.end - 0.18, ch.end);
      const a = k * (1 - out);
      const dx = (1 - k) * -40;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = P.red;
      ctx.fillRect(90 + dx, this.L.chapterY - 38, 14, 40);
      ctx.restore();
      this.text(ch.label, 120 + dx, this.L.chapterY, {
        size: this.T.chapter, weight: 700, color: P.text2, alpha: a, role: 'chapter',
      });
    }

    fitMessage(str) {
      const maxW = 810;
      for (let s = this.T.message; s >= this.T.messageMin; s -= 2) {
        const lines = this.wrap(str, s, 800, maxW);
        if (lines.length <= 2) return { size: s, lines };
      }
      const lines = this.wrap(str, this.T.messageMin, 800, maxW);
      console.warn('Main message needs more than two lines - shorten it:', str);
      return { size: this.T.messageMin, lines };
    }

    messages(t, ch) {
      const P = this.P, tr = this.S.transition;
      for (const m of this.messagesFor(ch.id)) {
        if (t < m.start || t >= m.end) continue;
        const kin = easeOut(prog(t, m.start, m.start + tr.messageIn));
        const isLast = Math.abs(m.end - ch.end) < 0.01;
        const kout = isLast ? 0 : prog(t, m.end - tr.messageOut, m.end);
        const a = kin * (1 - kout);
        const { size, lines } = this.fitMessage(m.text);
        const lh = Math.round(size * 1.08);
        lines.forEach((ln, i) => {
          const li = easeOut(prog(t, m.start + i * 0.08, m.start + i * 0.08 + tr.messageIn));
          const dy = (1 - li) * 46 - kout * 30;
          let col = P.text;
          if (m.emphasis && i === lines.length - 1 && lines.length > 1) col = P.red;
          this.text(ln, 90, this.L.messageTop + size * 0.8 + i * lh + dy, {
            size, weight: 800, color: col, alpha: a * li, role: 'message',
          });
        });
      }
    }

    wipe(t) {
      // red slash wipe centred on each chapter cut
      const ctx = this.ctx, P = this.P, W = this.S.width, H = this.S.height;
      const d = this.S.transition.wipe;
      for (const c of this.S.timeline) {
        if (c.start === 0) continue;
        const k = prog(t, c.start - d / 2, c.start + d / 2);
        if (k <= 0 || k >= 1) continue;
        const e = easeInOut(k);
        const span = W + H * 0.6 + 600;
        const pos = lerp(-600 - H * 0.3, W + H * 0.3 + 600, e);
        const bw = 520 * Math.sin(Math.PI * k) + 40;
        ctx.save();
        ctx.translate(pos, H / 2);
        ctx.rotate(-0.32);
        ctx.fillStyle = P.red;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(-bw / 2, -span, bw, span * 2);
        ctx.fillStyle = P.cyan;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(bw / 2, -span, 8, span * 2);
        ctx.restore();
      }
    }

    subtitles(t) {
      const P = this.P, T = this.T, ctx = this.ctx;
      const cap = this.C.captions.find((c) => t >= c.start && t < c.end);
      if (!cap) return;
      const a = Math.min(prog(t, cap.start, cap.start + 0.12), 1 - prog(t, cap.end - 0.1, cap.end));
      const maxW = 810 - 64;
      let size = T.subtitle;
      let lines = this.wrap(cap.text, size, 700, maxW);
      while (lines.length > this.L.subtitleMaxLines && size > 48) {
        size -= 2;
        lines = this.wrap(cap.text, size, 700, maxW);
      }
      const lh = T.subtitleLineHeight * (size / T.subtitle);
      const boxH = lines.length * lh + 44;
      const boxW = Math.max(...lines.map((l) => this.measure(l, size, 700))) + 64;
      const cx = 495, bottom = this.L.subtitleBottom;
      ctx.save();
      ctx.globalAlpha = a;
      this.rr(cx - boxW / 2, bottom - boxH, boxW, boxH, 22);
      ctx.fillStyle = 'rgba(5,5,7,0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      lines.forEach((ln, i) => {
        this.text(ln, cx, bottom - boxH + 22 + size * 0.84 + i * lh, {
          size, weight: 700, align: 'center', color: P.text, alpha: a, role: 'subtitle',
        });
      });
    }
  }

  // ---------- VISUAL LIBRARY ----------------------------------------------------------------------
  // Each visual draws the main visual band (y 560-1360) for a chapter, from config data only.
  // New projects pick any of these by `type`, or add a new function here.
  const VISUALS = {};

  // Opening / closing: the hero request surrounded by documents that connect into one workflow.
  VISUALS.documentSwarm = function (E, t, ch, v) {
    const P = E.P, ctx = E.ctx;
    const closing = ch.id === 'closing';
    const cx = 495, cy = 1010;
    // k = 0 scattered ring, 1 = connected workflow line
    let k;
    if (!closing) k = easeInOut(prog(t, 1.4, 2.9));
    else k = 1 - easeInOut(prog(t, 43.3, 44.6)); // resolve back to the opening composition (loop)
    const tt = closing ? 0 : t; // closing settles to the exact t=0 ring
    const n = v.satellites.length;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.35 + tt * 0.12;
      const rx = 400, ry = 330;
      const sx = cx + Math.cos(ang) * rx, sy = cy + Math.sin(ang) * ry;
      // workflow positions: an S-curve through the card
      const u = i / (n - 1);
      const wx = lerp(130, 860, u), wy = cy + Math.sin(u * Math.PI * 2) * 230 - 40;
      pts.push({ x: lerp(sx, wx, k), y: lerp(sy, wy, k), rot: (1 - k) * Math.sin(i * 2.1 + tt) * 0.18, i });
    }
    // connections
    if (k > 0.01) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = rgba(P.cyan, 0.75 * k);
      ctx.shadowColor = P.cyanGlow;
      ctx.shadowBlur = 20;
      ctx.setLineDash([2000]);
      ctx.lineDashOffset = 2000 * (1 - k);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      // pulses travelling along the workflow
      for (let j = 0; j < 3; j++) {
        const f = ((t * 0.45 + j / 3) % 1) * (n - 1);
        const a = pts[Math.floor(f)], b = pts[Math.min(n - 1, Math.floor(f) + 1)];
        const q = f - Math.floor(f);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = P.cyan;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(lerp(a.x, b.x, q), lerp(a.y, b.y, q), 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    pts.forEach((p) => {
      const kind = v.satellites[p.i];
      const s = lerp(1, 0.62, k);
      const w = 120 * s, h = 150 * s;
      ctx.save();
      if (kind === 'Message') E.bubble(p.x - 80 * s, p.y - 50 * s, 160 * s, 96 * s, 1, P.text2);
      else
        E.doc(p.x - w / 2, p.y - h / 2, w, h, {
          rot: p.rot, accent: kind === 'Offer' ? P.cyan : kind === 'Quote' ? P.red : null,
          stroke: k > 0.5 ? rgba(P.cyan, 0.9) : '#3a3e4c',
        });
      ctx.restore();
    });
    const st = closing && t > 43.2 ? E.status('approved', 'Approved by buyer') : E.status('neutral', 'Draft');
    const pulse = 1 + Math.sin(t * 3) * 0.006;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.translate(-cx, -cy);
    E.requestCard(cx, cy, 600, 300, { status: st, note: true, glowSize: 70 + k * 40 });
    ctx.restore();
  };

  // The project: the request travels through a vertical sequence of stages.
  VISUALS.stagePipeline = function (E, t, ch, v) {
    const P = E.P, ctx = E.ctx;
    const n = v.stages.length;
    const x = 150, y0 = 632, dy = 150;
    const reveal = (i) => ch.start + 0.6 + i * 1.25;
    // spine
    const lastRevealed = v.stages.reduce((m, s, i) => (t >= reveal(i) ? i : m), -1);
    ctx.save();
    ctx.strokeStyle = '#2a2d38';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + dy * (n - 1));
    ctx.stroke();
    // lit segment follows the request
    const docPos = (() => {
      let p = 0;
      for (let i = 1; i < n; i++) p += easeInOut(prog(t, reveal(i) - 0.5, reveal(i) - 0.05));
      return p;
    })();
    ctx.strokeStyle = P.red;
    ctx.shadowColor = P.redGlow;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + dy * docPos);
    ctx.stroke();
    ctx.restore();

    v.stages.forEach((s, i) => {
      const a = easeOut(prog(t, reveal(i) - 0.35, reveal(i) + 0.1));
      if (a <= 0) return;
      const y = y0 + i * dy;
      const active = Math.round(docPos) === i;
      // node
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, 50, 0, Math.PI * 2);
      ctx.fillStyle = P.surface;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = docPos >= i - 0.02 ? P.red : '#3a3e4c';
      if (s.destination) ctx.setLineDash([10, 8]);
      ctx.stroke();
      ctx.restore();
      const dx = (1 - a) * 40;
      E.text(s.label, 230 + dx, y + 2, { size: 48, weight: 800, alpha: a, color: active ? P.text : P.text2 });
      E.text(s.sub, 230 + dx, y + 56, { size: 42, weight: 600, alpha: a * 0.95, color: s.destination ? P.cyan : P.muted });
      if (s.destination && a > 0) {
        // dashed frame: a destination in the workflow, not a product screen
        ctx.save();
        ctx.globalAlpha = a * 0.8;
        ctx.setLineDash([12, 10]);
        ctx.strokeStyle = rgba(P.cyan, 0.7);
        ctx.lineWidth = 3;
        E.rr(205, y - 62, 695, 146, 22);
        ctx.stroke();
        ctx.restore();
      }
    });
    // the travelling request
    const dyDoc = y0 + docPos * dy;
    const idx = Math.min(n - 1, Math.round(docPos));
    E.doc(x - 30, dyDoc - 38, 60, 76, { fill: '#fff', stroke: '#fff', lineColor: '#9aa0b0', lines: 3, glow: P.redGlow, accent: P.red });
    stageBadge(E, x + 32, dyDoc + 30, idx, t);
  };

  function stageBadge(E, x, y, idx, t) {
    const ctx = E.ctx, P = E.P;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = idx === 4 ? P.cyan : P.red;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#fff';
    if (idx === 0) E.check(x, y, 20, '#fff', 4);
    else if (idx === 1) { for (let i = 0; i < 3; i++) ctx.fillRect(x - 9 + i * 7, y - 8 + i * 2, 4, 14 - i * 2); }
    else if (idx === 2) {
      ctx.beginPath(); ctx.moveTo(x - 9, y - 4); ctx.lineTo(x + 9, y - 4); ctx.moveTo(x + 9, y + 5); ctx.lineTo(x - 9, y + 5); ctx.stroke();
    } else if (idx === 3) { ctx.beginPath(); ctx.arc(x, y - 2, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 5, y + 3, 4, 9); ctx.fillRect(x + 1, y + 3, 4, 9); }
    else { ctx.beginPath(); ctx.ellipse(x, y - 6, 9, 4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x - 9, y + 7); ctx.ellipse(x, y + 7, 9, 4, 0, Math.PI, 0, true); ctx.lineTo(x + 9, y - 6); ctx.stroke(); }
    ctx.restore();
  }

  // The need: repetitive work in close-up, reorganised into one coordinated flow.
  VISUALS.clutterToFlow = function (E, t, ch, v) {
    const P = E.P, ctx = E.ctx;
    const r = easeInOut(prog(t, v.reorganiseAt, v.reorganiseAt + 1.3));
    const groups = v.frictions;
    const items = [];
    // messy positions per group (deterministic)
    const rnd = mulberry32(42);
    const gy = [640, 880, 1120]; // label baselines; items sit below each label
    groups.forEach((g, gi) => {
      for (let j = 0; j < 3; j++) {
        const mx = 170 + j * 250 + (rnd() - 0.5) * 70;
        const my = gy[gi] + 105 + (rnd() - 0.5) * 30;
        const rot = (rnd() - 0.5) * 0.5;
        items.push({ gi, j, mx, my, rot });
      }
    });
    // ordered grid positions
    const cols = [220, 495, 770];
    const rows = [860, 1030, 1200];
    items.forEach((it, i) => {
      it.ox = cols[i % 3];
      it.oy = rows[Math.floor(i / 3)];
    });
    // group labels (before reorganisation)
    const la = 1 - prog(t, v.reorganiseAt - 0.1, v.reorganiseAt + 0.4);
    groups.forEach((g, gi) => {
      const a = easeOut(prog(t, ch.start + 0.4 + gi * 0.6, ch.start + 0.8 + gi * 0.6)) * la;
      E.text(g, 106, gy[gi], { size: 44, weight: 800, alpha: a, color: P.text2 });
    });
    // connectors in the ordered state
    if (r > 0.02) {
      ctx.save();
      ctx.strokeStyle = rgba(P.cyan, 0.8 * r);
      ctx.lineWidth = 5;
      ctx.shadowColor = P.cyanGlow;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      // snake through the grid
      const order = [0, 1, 2, 5, 4, 3, 6, 7, 8];
      order.forEach((idx, n) => {
        const it = items[idx];
        n ? ctx.lineTo(it.ox, it.oy) : ctx.moveTo(it.ox, it.oy);
      });
      ctx.setLineDash([2400]);
      ctx.lineDashOffset = 2400 * (1 - r);
      ctx.stroke();
      ctx.restore();
    }
    items.forEach((it, i) => {
      const appear = easeOut(prog(t, ch.start + 0.3 + it.gi * 0.6 + it.j * 0.12, ch.start + 0.7 + it.gi * 0.6 + it.j * 0.12));
      if (appear <= 0) return;
      // jitter while messy: things being copied, re-sent, re-checked
      const jit = (1 - r) * Math.sin(t * 5 + i * 1.7) * 6;
      const x = lerp(it.mx, it.ox, r) + jit;
      const y = lerp(it.my, it.oy, r) + (1 - appear) * 40;
      const rot = lerp(it.rot, 0, r);
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (it.gi === 1 && r < 0.5) {
        E.bubble(-80, -48, 160, 90, 1 - r * 2, P.text2);
      }
      if (it.gi !== 1 || r >= 0.5) {
        const w = lerp(120, 150, r), h = lerp(150, 110, r);
        E.doc(-w / 2, -h / 2, w, h, {
          accent: it.gi === 2 ? P.cyan : it.gi === 0 ? P.red : null,
          stroke: r > 0.6 ? rgba(P.cyan, 0.9) : '#3a3e4c',
          alpha: it.gi === 1 ? (r - 0.5) * 2 : 1,
        });
      }
      ctx.restore();
    });
    // copy operations: a block of data shuttling between documents (before reorganisation)
    if (r < 0.98) {
      const c = (t * 0.9) % 1;
      const a0 = items[0], a1 = items[2];
      const bx = lerp(a0.mx + 20, a1.mx - 20, easeInOut(c));
      ctx.save();
      ctx.globalAlpha = (1 - r) * Math.sin(Math.PI * c);
      ctx.fillStyle = P.cyan;
      ctx.shadowColor = P.cyanGlow;
      ctx.shadowBlur = 20;
      E.rr(bx - 40, a0.my - 10 - Math.sin(Math.PI * c) * 30, 80, 18, 9);
      ctx.fill();
      ctx.restore();
    }
    // resolved label
    const ra = easeOut(prog(t, v.reorganiseAt + 0.9, v.reorganiseAt + 1.4));
    E.text(v.resolvedLabel, 106, 740, { size: 48, weight: 800, alpha: ra, color: P.cyan });
  };

  // How it works: specialised agents act on the same request; the buyer approves each decision.
  VISUALS.agentApprovalFlow = function (E, t, ch, v) {
    const P = E.P, ctx = E.ctx;
    const steps = v.steps;
    let si = steps.findIndex((s) => t >= s.start && t < s.end);
    if (si < 0) si = t < steps[0].start ? 0 : steps.length - 1;
    const s = steps[si];
    const cp = s.checkpoint;
    // action time freezes while waiting for the buyer
    let at = t;
    if (cp) {
      if (t >= cp.pauseAt && t < cp.approveAt) at = cp.pauseAt;
      else if (t >= cp.approveAt) at = t - (cp.approveAt - cp.pauseAt);
    }
    const u = at - s.start;
    const sa = Math.min(easeOut(prog(t, s.start, s.start + 0.35)), si === steps.length - 1 ? 1 : 1 - prog(t, s.end - 0.2, s.end));
    const waiting = cp && t >= cp.pauseAt && t < cp.approveAt;
    const approved = cp && t >= cp.approveAt;

    // agent row
    const ay = 640;
    E.agentNode(150, ay, 38, waiting ? cp.pauseAt : t, P.cyan, sa);
    E.text(s.agent, 215, ay + 16, { size: 46, weight: 800, alpha: sa, color: P.text });
    // checkpoint tracker (no labels; the panel names each decision)
    const cps = steps.filter((x) => x.checkpoint);
    cps.forEach((x, i) => {
      const done = t >= x.checkpoint.approveAt;
      const cur = x === s && waiting;
      const px = 790 + i * 44;
      ctx.save();
      ctx.translate(px, ay);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = done ? P.red : cur ? rgba(P.cyan, 0.5 + 0.5 * Math.sin(t * 8)) : '#2a2d38';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.restore();
    });
    // beam from agent to the work
    ctx.save();
    ctx.globalAlpha = sa * (waiting ? 0.35 : 1);
    ctx.strokeStyle = P.cyan;
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 12]);
    ctx.lineDashOffset = waiting ? 0 : -at * 60;
    ctx.beginPath();
    ctx.moveTo(150, ay + 40);
    ctx.lineTo(150, 720);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = sa;
    if (s.scene === 'structure') sceneStructure(E, t, u, s);
    if (s.scene === 'compare') sceneCompare(E, t, u, s, v, waiting, approved);
    if (s.scene === 'terms') sceneTerms(E, t, u, s, v, waiting, approved);
    if (s.scene === 'award') sceneAward(E, t, u, s, v, waiting, approved);
    ctx.restore();

    approvalPanel(E, t, s, v, waiting, approved);
  };

  function sceneStructure(E, t, u, s) {
    const fp = s.fields.map((_, i) => easeOut(prog(u, 0.45 + i * 0.5, 0.95 + i * 0.5)));
    const done = u > 0.45 + s.fields.length * 0.5 + 0.2;
    const st = done ? E.status('ai', s.result) : E.status('neutral', 'Draft');
    const k = easeOut(prog(u, 0, 0.5));
    E.requestCard(495, 935 + (1 - k) * 40, 680, 456, { fields: s.fields, fieldProgress: fp, status: st, glow: E.P.cyanGlow });
  }

  // Supplier selection: the agent proposes a shortlist, the buyer approves it, then offers
  // arrive and line up for comparison (no winner is picked here).
  function sceneCompare(E, t, u, s, v, waiting, approved) {
    const P = E.P, ctx = E.ctx;
    const n = s.options.length;
    const colW = 250, gap = 30, x0 = 495 - (n * colW + (n - 1) * gap) / 2;
    const top = 770, h = 290;
    const cp = s.checkpoint;
    const swap = approved ? easeOut(prog(t, cp.approveAt + 0.2, cp.approveAt + 0.5)) : 0;
    const head = easeOut(prog(u, 0, 0.4));
    E.text(s.shortlistLabel, 100, 738, { size: 44, weight: 800, color: P.text2, alpha: head * (1 - swap) });
    E.text(s.compareLabel, 100, 738, { size: 44, weight: 800, color: P.text2, alpha: swap });
    s.options.forEach((o, i) => {
      const a = easeOut(prog(u, 0.1 + i * 0.15, 0.55 + i * 0.15));
      const x = x0 + i * (colW + gap) + (1 - a) * 120;
      ctx.save();
      ctx.globalAlpha *= a;
      E.rr(x, top, colW, h, 24);
      ctx.fillStyle = P.surface;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#343846';
      ctx.stroke();
      ctx.restore();
      const words = o.split(' ');
      const tag = words.pop();
      if (words.length) E.text(words.join(' '), x + 28, top + 56, { size: 42, weight: 600, color: P.text2, alpha: a });
      E.text(tag, x + 28, top + 124, { size: 64, weight: 800, alpha: a });
      // offers only arrive after the buyer approved the shortlist
      const lens = [[0.62, 0.48, 0.7], [0.86, 0.8, 0.78], [0.5, 0.66, 0.42]][i % 3];
      lens.forEach((L, j) => {
        const g = approved ? easeOut(prog(t, cp.approveAt + 0.35 + i * 0.12 + j * 0.06, cp.approveAt + 0.85 + i * 0.12 + j * 0.06)) : 0;
        ctx.save();
        ctx.globalAlpha *= a;
        E.rr(x + 28, top + 162 + j * 40, colW - 56, 20, 10);
        ctx.fillStyle = '#20232d';
        ctx.fill();
        if (g > 0) {
          E.rr(x + 28, top + 162 + j * 40, (colW - 56) * L * g, 20, 10);
          ctx.fillStyle = P.cyan;
          ctx.fill();
        }
        ctx.restore();
      });
      if (approved) {
        const da = easeOut(prog(t, cp.approveAt + 0.3 + i * 0.12, cp.approveAt + 0.6 + i * 0.12));
        E.doc(x + colW - 76, top + 74, 48, 60, { alpha: da, fill: '#fff', stroke: '#fff', lineColor: '#9aa0b0', lines: 2, accent: P.cyan });
      }
    });
    // the shortlist as a whole is what the buyer approves
    const pa = easeOut(prog(u, 0.7, 0.95));
    if (pa > 0) {
      ctx.save();
      ctx.globalAlpha *= pa;
      ctx.lineWidth = 6;
      if (approved) {
        ctx.strokeStyle = P.red;
        ctx.shadowColor = P.redGlow;
      } else {
        ctx.strokeStyle = P.cyan;
        ctx.setLineDash([16, 12]);
        ctx.lineDashOffset = -(waiting ? cp.pauseAt : t) * 30;
        ctx.shadowColor = P.cyanGlow;
      }
      ctx.shadowBlur = 24;
      E.rr(x0 - 12, top - 12, n * colW + (n - 1) * gap + 24, h + 24, 32);
      ctx.stroke();
      ctx.restore();
      const st = approved ? E.status('approved', v.approvedLabel) : E.status('proposed', v.proposedLabel);
      E.chip(st.text, 495, top + h + 52, { ...st, align: 'center', alpha: pa });
    }
  }

  function sceneTerms(E, t, u, s, v, waiting, approved) {
    const P = E.P, ctx = E.ctx;
    const x = 120, y = 760, w = 770, h = 380;
    const a = easeOut(prog(u, 0, 0.4));
    ctx.save();
    ctx.globalAlpha *= a;
    E.rr(x, y + (1 - a) * 40, w, h, 28);
    ctx.fillStyle = P.surface;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = approved ? P.red : rgba(P.cyan, 0.6);
    ctx.stroke();
    ctx.restore();
    E.text('Terms', x + 36, y + 74, { size: 46, weight: 800, alpha: a });
    const st = approved ? E.status('approved', v.approvedLabel) : E.status('proposed', v.proposedLabel);
    E.chip(st.text, x + w - 30, y + 58, { ...st, align: 'right', alpha: a });
    s.terms.forEach((term, i) => {
      const ry = y + 160 + i * 82;
      const ra = easeOut(prog(u, 0.25 + i * 0.15, 0.6 + i * 0.15));
      E.text(term, x + 36, ry + 14, { size: 42, weight: 600, color: P.text2, alpha: a * ra });
      // negotiation slider: two positions converge on a proposal
      const sx = x + 470, sw = 260;
      ctx.save();
      ctx.globalAlpha *= a * ra;
      E.rr(sx, ry - 6, sw, 12, 6);
      ctx.fillStyle = '#2a2d38';
      ctx.fill();
      const conv = easeInOut(prog(u, 0.4 + i * 0.1, 1.15));
      const wob = Math.sin(u * 9 + i) * 18 * (1 - conv);
      const target = [0.62, 0.45, 0.7][i % 3];
      const p1 = lerp(0.12, target, conv) + wob / sw, p2 = lerp(0.92, target, conv) - wob / sw;
      ctx.fillStyle = '#9aa0b0';
      ctx.beginPath(); ctx.arc(sx + sw * p1, ry, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = approved ? P.red : P.cyan;
      ctx.beginPath(); ctx.arc(sx + sw * p2, ry, 15, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function sceneAward(E, t, u, s, v, waiting, approved) {
    const P = E.P, ctx = E.ctx;
    const cx = 495, y = 760, w = 680, h = 330;
    const a = easeOut(prog(u, 0, 0.4));
    ctx.save();
    ctx.globalAlpha *= a;
    E.rr(cx - w / 2, y + (1 - a) * 40, w, h, 28);
    ctx.fillStyle = P.surface;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = approved ? P.red : rgba(P.cyan, 0.6);
    ctx.stroke();
    // ribbon glyph
    const rx = cx - w / 2 + 90, ry = y + 165;
    ctx.fillStyle = approved ? P.red : P.cyan;
    ctx.beginPath(); ctx.arc(rx, ry, 42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx - 30, ry + 26); ctx.lineTo(rx - 40, ry + 96); ctx.lineTo(rx - 10, ry + 80); ctx.lineTo(rx, ry + 40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx + 30, ry + 26); ctx.lineTo(rx + 40, ry + 96); ctx.lineTo(rx + 10, ry + 80); ctx.lineTo(rx, ry + 40); ctx.fill();
    ctx.restore();
    E.sparkle(rx, ry, 22, '#fff');
    E.text(s.recommendation, cx - w / 2 + 40, y + 76, { size: 44, weight: 800, alpha: a });
    E.text(s.option, cx - w / 2 + 170, y + 168, { size: 46, weight: 800, color: P.text2, alpha: a });
    const st = approved ? E.status('approved', v.approvedLabel) : E.status('proposed', v.proposedLabel);
    E.chip(st.text, cx - w / 2 + 170, y + 250, { ...st, alpha: a });
    // stamp lands only after the buyer's action
    if (approved) {
      const k = prog(t, s.checkpoint.approveAt, s.checkpoint.approveAt + 0.35);
      const sc = lerp(1.8, 1, easeOut(k));
      ctx.save();
      ctx.globalAlpha *= Math.min(1, k * 3);
      ctx.translate(cx + 222, y + 205);
      ctx.rotate(-0.16);
      ctx.scale(sc, sc);
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 7;
      E.rr(-120, -52, 240, 104, 18);
      ctx.stroke();
      E.buyer(-74, 2, 30, P.red);
      ctx.restore();
      ctx.save();
      ctx.translate(cx + 222, y + 205);
      ctx.rotate(-0.16);
      ctx.scale(sc, sc);
      E.check(30, 0, 54, P.red, 10);
      ctx.restore();
    }
    // after approval the request continues to its destination
    const na = easeOut(prog(t, s.checkpoint.approveAt + 0.6, s.checkpoint.approveAt + 1.0));
    if (na > 0) E.chip('Next: Corporate ERP', 100, 1128, { ...E.status('ai', ''), alpha: na });
  }

  function approvalPanel(E, t, s, v, waiting, approved) {
    const P = E.P, ctx = E.ctx;
    const x = 90, y = 1170, w = 810, h = 186;
    const a = easeOut(prog(t, 17.25, 17.7));
    const cp = s.checkpoint;
    const show = cp && t >= cp.pauseAt - 0.15;
    ctx.save();
    ctx.globalAlpha *= a;
    E.rr(x, y, w, h, 28);
    ctx.fillStyle = 'rgba(16,17,22,0.96)';
    ctx.fill();
    ctx.lineWidth = waiting ? 4 : 3;
    ctx.strokeStyle = waiting ? rgba(P.text, 0.5 + 0.3 * Math.sin(t * 6)) : approved && show ? P.red : '#343846';
    ctx.stroke();
    ctx.restore();
    // buyer
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.beginPath();
    ctx.arc(175, y + 76, 48, 0, Math.PI * 2);
    ctx.fillStyle = approved && show ? P.red : '#20232d';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= a;
    E.buyer(175, y + 80, 44, '#fff');
    ctx.restore();
    E.text(v.humanRole, 175, y + 166, { size: 42, weight: 700, align: 'center', alpha: a, color: P.text2 });
    if (!show) {
      E.text('Supervising', 270, y + 82, { size: 46, weight: 800, alpha: a });
      E.text(v.idleLine, 270, y + 146, { size: 42, weight: 600, color: P.muted, alpha: a });
      return;
    }
    const ka = easeOut(prog(t, cp.pauseAt - 0.15, cp.pauseAt + 0.15));
    E.text(cp.decision, 270, y + 82, { size: 46, weight: 800, alpha: a * ka });
    if (waiting) {
      ctx.save();
      ctx.globalAlpha *= a * ka * (0.5 + 0.5 * Math.sin(t * 8));
      ctx.fillStyle = P.cyan;
      ctx.beginPath(); ctx.arc(284, y + 132, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      E.text(v.waitingLabel, 306, y + 146, { size: 42, weight: 600, color: P.text2, alpha: a * ka });
    } else {
      const k = easeOut(prog(t, cp.approveAt + 0.12, cp.approveAt + 0.35));
      E.check(290, y + 132, 34, P.red, 7);
      E.text(v.approvedLabel + ' by buyer', 324, y + 146, { size: 42, weight: 800, color: P.red, alpha: a * k });
    }
    // Approve button - pressed by the buyer, then confirmed
    const bx = 676, by = y + 96, bw = 206, bh = 76;
    const press = prog(t, cp.approveAt - 0.32, cp.approveAt);
    const gone = easeOut(prog(t, cp.approveAt, cp.approveAt + 0.12));
    const bs = press > 0 && press < 1 ? 1 - 0.07 * Math.sin(Math.PI * press) : 1;
    const ba = a * ka * (1 - gone);
    if (ba > 0) {
      ctx.save();
      ctx.globalAlpha *= ba;
      ctx.translate(bx + bw / 2, by + bh / 2);
      ctx.scale(bs, bs);
      E.rr(-bw / 2, -bh / 2, bw, bh, 20);
      ctx.fillStyle = press > 0.6 ? P.red : '#fff';
      ctx.fill();
      ctx.restore();
      E.text(v.actionLabel, bx + bw / 2, by + bh / 2 + 15, { size: 42, weight: 800, align: 'center', color: press > 0.6 ? '#fff' : '#050507', alpha: ba });
      // tap indicator
      if (press > 0 && press < 1) {
        ctx.save();
        ctx.globalAlpha *= (1 - press) * 0.9;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(bx + bw / 2 + 30, by + bh / 2 + 10, 20 + press * 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Value: the connected workflow, then an audit trail linked to each step.
  VISUALS.auditTrail = function (E, t, ch, v) {
    const P = E.P, ctx = E.ctx;
    const x = 150, y0 = 650, dy = 150;
    const n = v.steps.length;
    const la = easeOut(prog(t, ch.start + 0.15, ch.start + 0.7));
    // connected chain
    ctx.save();
    ctx.globalAlpha = la;
    ctx.strokeStyle = rgba(P.cyan, 0.8);
    ctx.lineWidth = 5;
    ctx.shadowColor = P.cyanGlow;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + dy * (n - 1));
    ctx.stroke();
    ctx.restore();
    for (let j = 0; j < 2; j++) {
      const f = (t * 0.5 + j / 2) % 1;
      ctx.save();
      ctx.globalAlpha = la;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = P.cyan;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, y0 + f * dy * (n - 1), 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    v.steps.forEach((s, i) => {
      const y = y0 + i * dy;
      const a = easeOut(prog(t, ch.start + 0.1 + i * 0.12, ch.start + 0.5 + i * 0.12));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fillStyle = P.surface;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = P.red;
      ctx.stroke();
      ctx.restore();
      E.text(s, 210, y + 15, { size: 44, weight: 800, alpha: a });
    });
    // audit trail
    const ta = easeOut(prog(t, v.trailAt, v.trailAt + 0.4));
    if (ta <= 0) return;
    const rx = 590;
    E.text(v.trailTitle, rx, y0 - 72, { size: 44, weight: 800, color: P.cyan, alpha: ta });
    ctx.save();
    ctx.globalAlpha = ta;
    ctx.strokeStyle = '#343846';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - 14, y0 - 50);
    ctx.lineTo(rx - 14, y0 + dy * (n - 1) + 40);
    ctx.stroke();
    ctx.restore();
    v.records.forEach((r, i) => {
      const y = y0 + i * dy;
      const a = easeOut(prog(t, v.trailAt + 0.2 + i * 0.28, v.trailAt + 0.55 + i * 0.28));
      if (a <= 0) return;
      const labelEnd = 210 + E.measure(v.steps[i], 44, 800) + 18;
      // link back to the process step
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.by === 'buyer' ? P.red : P.cyan;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(labelEnd, y);
      ctx.lineTo(lerp(labelEnd, rx, a), y);
      ctx.stroke();
      ctx.restore();
      const st = r.by === 'buyer' ? { ...E.status('approved', r.state), icon: 'buyer' } : E.status('ai', r.state);
      E.chip(st.text, rx + (1 - a) * 60, y, { ...st, alpha: a, padX: 20 });
    });
  };

  // What's next: planned refinement from historical data, then expansion across an abstract globe.
  VISUALS.futureExpansion = function (E, t, ch, v) {
    const P = E.P, ctx = E.ctx;
    const ba = easeOut(prog(t, ch.start + 0.2, ch.start + 0.6));
    const sw = easeInOut(prog(t, v.expandAt - 0.3, v.expandAt + 0.4)); // switch phase
    E.chip(v.plannedBadge, 900, 610, { align: 'right', fg: P.text, bg: 'rgba(255,255,255,0.04)', border: P.text2, dashed: true, alpha: ba });

    // phase 1: historical data -> future refinement
    const a1 = 1 - sw;
    if (a1 > 0) {
      ctx.save();
      ctx.globalAlpha = a1;
      for (let i = 0; i < 5; i++) {
        const k = easeOut(prog(t, ch.start + 0.2 + i * 0.1, ch.start + 0.6 + i * 0.1));
        E.doc(110 + i * 22, 690 + i * 16 + (1 - k) * 40, 130, 160, { alpha: 0.35 + 0.13 * i, fill: '#15171e' });
      }
      ctx.restore();
      E.text(v.historyLabel, 330, 790, { size: 44, weight: 800, alpha: a1 * easeOut(prog(t, ch.start + 0.5, ch.start + 0.9)), color: P.text2 });
      E.text('Planned', 330, 846, { size: 42, weight: 600, alpha: a1 * easeOut(prog(t, ch.start + 0.5, ch.start + 0.9)), color: P.muted });
      // data particles flowing in
      for (let i = 0; i < 9; i++) {
        const f = (t * 0.7 + i / 9) % 1;
        const sx = 200, sy = 860, ex = 495, ey = 1040;
        const bx = lerp(lerp(sx, 300, f), lerp(300, ex, f), f);
        const by = lerp(lerp(sy, 1000, f), lerp(1000, ey, f), f);
        ctx.save();
        ctx.globalAlpha = a1 * Math.sin(Math.PI * f) * easeOut(prog(t, ch.start + 0.6, ch.start + 1));
        ctx.fillStyle = i % 3 === 0 ? P.red : P.cyan;
        ctx.fillRect(bx - 14, by - 4, 28, 8);
        ctx.restore();
      }
      // dashed future box
      const fa = a1 * easeOut(prog(t, ch.start + 0.7, ch.start + 1.1));
      ctx.save();
      ctx.globalAlpha = fa;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -t * 20;
      ctx.strokeStyle = P.cyan;
      ctx.lineWidth = 4;
      E.rr(130, 1030, 750, 300, 30);
      ctx.stroke();
      ctx.restore();
      E.text(v.refineLabel, 495, 1110, { size: 48, weight: 800, align: 'center', color: P.cyan, alpha: fa });
      // mini workflow sharpening
      const sharp = easeInOut(prog(t, ch.start + 1.2, v.expandAt - 0.3));
      for (let i = 0; i < 5; i++) {
        const nx = 210 + i * 147, ny = 1230;
        ctx.save();
        ctx.globalAlpha = fa;
        if (i < 4) {
          ctx.strokeStyle = rgba(P.cyan, 0.3 + 0.6 * sharp);
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(nx + 24, ny); ctx.lineTo(nx + 123, ny); ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(nx, ny, lerp(16, 24, sharp), 0, Math.PI * 2);
        ctx.fillStyle = i === Math.floor((t * 2) % 5) ? P.cyan : P.surface2;
        ctx.fill();
        ctx.strokeStyle = P.cyan;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
    }
    // phase 2: abstract globe with local regulatory checkpoints (no countries)
    if (sw > 0) {
      const gx = 495, gy = 1000, R = 290;
      ctx.save();
      ctx.globalAlpha = sw;
      const g = ctx.createRadialGradient(gx - 80, gy - 100, 20, gx, gy, R);
      g.addColorStop(0, 'rgba(46,230,242,0.16)');
      g.addColorStop(1, 'rgba(16,17,22,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(P.cyan, 0.55);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = rgba(P.cyan, 0.18);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ph = ((i / 6 + t * 0.05) % 1) * Math.PI;
        ctx.beginPath(); ctx.ellipse(gx, gy, Math.abs(Math.cos(ph)) * R, R, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 1; i < 5; i++) {
        const yy = gy - R + (i * 2 * R) / 5;
        const rr = Math.sqrt(R * R - (yy - gy) * (yy - gy));
        ctx.beginPath(); ctx.ellipse(gx, yy, rr, rr * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // checkpoints
      const pts = [];
      for (let i = 0; i < v.checkpoints; i++) {
        const lon = i * 1.25 + t * 0.25 + 0.4, lat = [-0.5, 0.25, 0.65, -0.1, 0.4][i % 5];
        const cx = gx + Math.sin(lon) * Math.cos(lat) * R * 0.92;
        const cy = gy + Math.sin(lat) * R * 0.92;
        const front = Math.cos(lon) > -0.1;
        pts.push({ cx, cy, front, i });
      }
      pts.forEach((p, i) => {
        const pa = sw * easeOut(prog(t, v.expandAt + 0.2 + i * 0.35, v.expandAt + 0.5 + i * 0.35)) * (p.front ? 1 : 0.25);
        if (pa <= 0) return;
        if (i > 0) {
          const q = pts[i - 1];
          ctx.save();
          ctx.globalAlpha = pa * 0.8;
          ctx.strokeStyle = P.red;
          ctx.setLineDash([8, 8]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(q.cx, q.cy);
          ctx.quadraticCurveTo((q.cx + p.cx) / 2, Math.min(q.cy, p.cy) - 80, p.cx, p.cy);
          ctx.stroke();
          ctx.restore();
        }
        shield(E, p.cx, p.cy, 26, pa);
      });
      const la = sw * easeOut(prog(t, v.expandAt + 0.6, v.expandAt + 1.0));
      E.chip(v.expandLabel, 495, 1340 - 30, { align: 'center', fg: P.text, bg: 'rgba(16,17,22,0.95)', border: P.red, dashed: true, alpha: la });
    }
  };

  function shield(E, x, y, r, a) {
    const ctx = E.ctx, P = E.P;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.85, y - r * 0.6);
    ctx.lineTo(x + r * 0.7, y + r * 0.45);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y + r * 0.45);
    ctx.lineTo(x - r * 0.85, y - r * 0.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(229,37,41,0.25)';
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  window.SeriesEngine = { Episode, VISUALS, util: { clamp, lerp, prog, easeOut, easeInOut, easeBack, window_, rgba } };
})();
