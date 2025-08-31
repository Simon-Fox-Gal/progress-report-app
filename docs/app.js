(() => {
  /* ----------------------- helpers / wiring ----------------------- */

  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const pick = (...ids) => ids.map(byId).find(Boolean);

  const ui = {
    codeInput: pick('code', 'codeInput'),
    loadBtn:   pick('btnLoad', 'load', 'load-btn'),
    langEn:    pick('btnEn', 'lang-en'),
    langDe:    pick('btnDe', 'lang-de'),
    theme:     pick('btnTheme', 'theme'),
    pdf:       pick('btnPdf', 'pdf'),
    thead:     byId('thead'),
    rows:      byId('rows'),
    hdr:       byId('hdr'),
    ftr:       byId('ftr'),
    summary:   byId('r-summary'),
    source:    byId('r-source'),
    title:     byId('r-title')
  };

  const CFG = (window.CONFIG || {
    GITHUB_USER: 'yourOwner',
    REPO: 'yourRepo',
    BRANCH: 'main',
    DATA_PATH: 'projects'
  });

  function rawUrlFor(code) {
    const p = (CFG.DATA_PATH || '').replace(/^\/+|\/+$/g, '');
    return `https://raw.githubusercontent.com/${CFG.GITHUB_USER}/${CFG.REPO}/${CFG.BRANCH}/${p}/${encodeURIComponent(code)}.json`;
  }

  function setTheme(next) {
    document.body.dataset.theme = next;
    localStorage.setItem('reader_theme', next);
  }
  function toggleTheme() {
    const cur = document.body.dataset.theme || 'dark';
    setTheme(cur === 'dark' ? 'light' : 'dark');
  }

  /* ----------------------- markdown (light) ----------------------- */

  function mdToHtml(src){
    if(!src) return '';
    const lines = String(src).replace(/\r\n?/g,'\n').split('\n');
    const out = [];
    let i = 0;

    function flushList(buf, ordered){
      if(!buf.length) return;
      out.push(ordered ? '<ol>' : '<ul>');
      for(const item of buf){
        let t = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');
        out.push('<li>' + t + '</li>');
      }
      out.push(ordered ? '</ol>' : '</ul>');
    }

    while(i < lines.length){
      const ln = lines[i];

      if(/^\s*\d+\.\s+/.test(ln)){           // ordered list
        const buf = [];
        while(i < lines.length && /^\s*\d+\.\s+/.test(lines[i])){
          buf.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        flushList(buf, true);
        continue;
      }

      if(/^\s*([*+-])\s+/.test(ln)){         // unordered list
        const buf = [];
        while(i < lines.length && /^\s*([*+-])\s+/.test(lines[i])){
          buf.push(lines[i].replace(/^\s*([*+-])\s+/, ''));
          i++;
        }
        flushList(buf, false);
        continue;
      }

      let s = ln;
      s = s.replace(/^>\s?(.*)$/, '<blockquote>$1</blockquote>');
      s = s.replace(/^\s*---+\s*$/, '<hr />');
      s = s.replace(/^###\s+(.*)$/, '<h3>$1</h3>');
      s = s.replace(/^##\s+(.*)$/,  '<h2>$1</h2>');
      s = s.replace(/^#\s+(.*)$/,   '<h1>$1</h1>');
      if(!/^<h[123]>|^<hr|^<blockquote>/.test(s)){
        s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
             .replace(/\*(.*?)\*/g, '<em>$1</em>');
      }
      out.push(s);
      i++;
    }
    return out.join('\n').replace(/(?<!>)\n(?!<)/g,'<br/>');
  }

  /* ----------------------- state ----------------------- */

  let lang = localStorage.getItem('reader_lang') || 'en';
  let current = null;

  const T = {
    en: { track:'Track', stage:'Current Stage', progress:'Progress' },
    de: { track:'Bereich', stage:'Aktuelle Stufe', progress:'Fortschritt' }
  };

  function setLang(next){
    lang = next;
    localStorage.setItem('reader_lang', next);
    if(current) render(current);
  }

  /* ----------------------- fetch + timestamp ----------------------- */

  async function fetchProject(code){
    const url = rawUrlFor(code);
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    let lastModified = r.headers.get('Last-Modified') || '';
    if(!lastModified){
      try{
        const rh = await fetch(url, { method:'HEAD', cache:'no-store' });
        if(rh.ok) lastModified = rh.headers.get('Last-Modified') || '';
      }catch(_e){}
    }
    if(lastModified) data.lastModified = lastModified;
    return data;
  }

  /* ----------------------- rendering ----------------------- */

  function calcStats(d) {
    let done=0,total=0;
    (d.tracks||[]).forEach(t=>{
      const ms=t.milestones||[];
      const segs = Math.max(ms.length-1,0);
      total += segs;
      let idx = ms.findIndex(m=>m.id===t.currentMilestoneId);
      if(idx<0) idx = 0;
      if(idx>=segs) done += segs;
      else done += idx;
    });
    const pct = total ? Math.round((done/total)*100) : 0;
    return {done,total,pct};
  }

  function render(data){
    if(!localStorage.getItem('reader_lang')){
      const def = data?.settings?.defaults?.language;
      if(def) { lang = def; localStorage.setItem('reader_lang', def); }
    }

    current = data;
    if(ui.title) ui.title.textContent = data.projectName || 'Progress Reader';

    if(ui.hdr) ui.hdr.innerHTML = mdToHtml(data.header||'');
    if(ui.ftr) ui.ftr.innerHTML = mdToHtml(data.footer||'');

    const stats = calcStats(data);
    if(ui.summary){
      const lm = data.lastModified ? (new Date(data.lastModified)).toLocaleString() : '';
      const lmLine = lm ? `Last updated: ${lm}` : '';
      ui.summary.textContent = `${lmLine}${lm ? '   ' : ''}${stats.done}/${stats.total} (${stats.pct}%)`;
    }

    const L = T[lang] || T.en;
    if(ui.thead){
      ui.thead.innerHTML = `
        <th>${L.track}</th>
        <th>${L.stage}</th>
        <th style="width:50%">${L.progress}</th>`;
    }

    if(ui.rows){
      ui.rows.innerHTML = '';
      (data.tracks||[]).forEach(t=>{
        const ms = t.milestones||[];
        const segs = Math.max(ms.length-1,0);
        let idx = ms.findIndex(m=>m.id===t.currentMilestoneId);
        if(idx<0) idx = 0;
        const pct = segs ? Math.round((idx / segs) * 100) : 0;

        const name = (lang==='de' ? (t.de||t.en||t.id) : (t.en||t.de||t.id));
        const cur = ms[idx] || {};
        const stageText = (lang==='de' ? (cur.de||cur.en||'') : (cur.en||cur.de||''));

        const bar = document.createElement('div');
        bar.className = 'progress segmented' + (idx >= segs ? ' full' : '');
        for(let j=0;j<segs;j++){
          const seg = document.createElement('div');
          seg.className = 'segment ' + (j < idx ? 'done' : 'todo');
          const next = ms[j+1];
          if(next){
            const label = (lang==='de' ? (next.de||next.en||next.id) : (next.en||next.de||next.id));
            seg.title = label;
          }
          bar.appendChild(seg);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${name}</td>
          <td>${stageText}</td>
          <td></td>`;
        const cell = tr.children[2];
        cell.appendChild(bar);
        const pctSpan = document.createElement('div');
        pctSpan.className = 'small';
        pctSpan.textContent = pct + '%';
        cell.appendChild(pctSpan);

        ui.rows.appendChild(tr);
      });
    }
  }

  /* ----------------------- events ----------------------- */

  const savedTheme = localStorage.getItem('reader_theme') || 'dark';
  setTheme(savedTheme);

  if(ui.langEn) ui.langEn.onclick = () => setLang('en');
  if(ui.langDe) ui.langDe.onclick = () => setLang('de');
  if(ui.theme)  ui.theme.onclick  = toggleTheme;

  if(ui.pdf) ui.pdf.onclick = () => {
    const prev = document.body.dataset.theme || 'dark';
    document.body.dataset.theme = 'light';
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => { document.body.dataset.theme = prev; }, 50);
    });
  };

  /* ----------------------- loader ----------------------- */

  async function loadFromInput() {
    const code = (ui.codeInput?.value || '').trim();
    if (!code) return;

    try {
      const data = await fetchProject(code);
      render(data);

      if (ui.source) {
        const lm = data.lastModified ? (new Date(data.lastModified)).toLocaleString() : '';
        ui.source.textContent = (lang === 'de' ? 'Quelle: Code ' : 'Source: code ')
          + code + (lm ? (' • ' + (lang === 'de' ? 'Zuletzt geändert: ' : 'Last modified: ') + lm) : '');
      }

      // update URL so ?code=...&lang=... stays visible
      const params = new URLSearchParams(location.search);
      params.set('code', code);
      params.set('lang', lang);
      history.replaceState(null, '', location.pathname + '?' + params.toString());

    } catch (e) {
      console.error(e);
      if (e && /404/.test(e.message)) {
        alert((lang === 'de'
          ? `Projekt '${code}' nicht gefunden.`
          : `Project '${code}' not found.`));
      } else {
        alert((lang === 'de'
          ? 'Konnte Projekt nicht laden: '
          : 'Failed to load project: ')
          + (e && e.message ? e.message : e));
      }
    }
  }

  if(ui.loadBtn) ui.loadBtn.onclick = loadFromInput;
  if(ui.codeInput) ui.codeInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') loadFromInput();
  });

  // --- Robust ?code=... auto-load (with ?lang=...) ---
  (function ensureAutoLoad() {
    const params = new URLSearchParams(location.search);
    const pre = (params.get('code') || '').trim();
    const preLang = (params.get('lang') || '').trim().toLowerCase();

    if (preLang === 'de' || preLang === 'en') {
      setLang(preLang);
    }

    if (!pre) return;

    let tries = 0;
    const tick = () => {
      const input = document.getElementById('code') || document.getElementById('codeInput');
      if (input && typeof loadFromInput === 'function') {
        input.value = pre;
        loadFromInput();
        return;
      }
      if (++tries < 10) setTimeout(tick, 100);
    };
    tick();
  })();

})(); // closes IIFE
