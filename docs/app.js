(() => {
  /* ----------------------- helpers / wiring ----------------------- */

  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const pick = (...ids) => ids.map(byId).find(Boolean);

  // Support multiple possible IDs so this file works with older/newer index.html
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
    // Try GET first; also read Last-Modified if sent. If not, do a HEAD for it.
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    let lastModified = r.headers.get('Last-Modified') || r.headers.get('last-modified') || '';
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
    // adopt default language if editor provided it
    if(!localStorage.getItem('reader_lang')){
      const def = data?.settings?.defaults?.language;
      if(def) { lang = def; localStorage.setItem('reader_lang', def); }
    }

    current = data;
    if(ui.title) ui.title.textContent = data.projectName || 'Progress Reader';

    // header/footer markdown
    if(ui.hdr) ui.hdr.innerHTML = mdToHtml(data.header||'');
    if(ui.ftr) ui.ftr.innerHTML = mdToHtml(data.footer||'');

    // summary + last updated
    const stats = calcStats(data);
    if(ui.summary){
      const lm = data.lastModified ? (new Date(data.lastModified)).toLocaleString() : '';
      const lmLine = lm ? `Last updated: ${lm}` : '';
      ui.summary.textContent = `${lmLine}${lm ? '   ' : ''}${stats.done}/${stats.total} (${stats.pct}%)`;
    }

    // table header with tip button
    const L = T[lang] || T.en;
    const tipKey = 'reader_tip_progress_' + lang;
    if(ui.thead){
      ui.thead.innerHTML = `
        <th>${L.track}</th>
        <th>${L.stage}</th>
        <th style="width:50%">
          ${L.progress}
          <button id="progress-tip" class="chip" title="${lang==='de'?'Hinweis':'Tip'}">?</button>
        </th>`;
    }

    // body
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

        // segmented bar
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

    // one-time, per-language tip (alert-based; dead simple & robust)
    const tipBtn = byId('progress-tip');
    if(tipBtn){
      const msg = (lang==='de')
        ? 'Tipp: Mit der Maus über die Leiste fahren, um Meilensteine zu sehen.'
        : 'Tip: Hover the bar to see milestones.';
      tipBtn.onclick = () => {
        alert(msg + '\n\n' + (lang==='de' ? 'Nicht mehr anzeigen?' : 'Don’t show again?'));
        localStorage.setItem(tipKey, '1');
      };
      if(!localStorage.getItem(tipKey)){
        setTimeout(()=>tipBtn.click(), 250);
      }
    }
  }

  /* ----------------------- events ----------------------- */

  // default theme
  const savedTheme = localStorage.getItem('reader_theme') || 'dark';
  setTheme(savedTheme);

  if(ui.langEn) ui.langEn.onclick = () => setLang('en');
  if(ui.langDe) ui.langDe.onclick = () => setLang('de');
  if(ui.theme)  ui.theme.onclick  = toggleTheme;

  // Print/PDF: force light theme for paper, then restore.
  if(ui.pdf) ui.pdf.onclick = () => {
    const prev = document.body.dataset.theme || 'dark';
    document.body.dataset.theme = 'light';
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => { document.body.dataset.theme = prev; }, 50);
    });
  };

  async function loadFromInput(){
    const code = (ui.codeInput?.value || '').trim();
    if(!code) return;
    try{
      const data = await fetchProject(code);
      render(data);
      if(ui.source){
        const lm = data.lastModified ? (new Date(data.lastModified)).toLocaleString() : '';
        ui.source.textContent = (lang==='de'?'Quelle: Code ':'Source: code ') + code + (lm? (' • ' + (lang==='de'?'Zuletzt geändert: ':'Last modified: ') + lm) : '');
      }
    }catch(e){
      console.error(e);
      alert((lang==='de'?'Konnte Projekt nicht laden: ':'Failed to load project: ') + (e && e.message ? e.message : e));
    }
  }

  if (ui.loadBtn) ui.loadBtn.onclick = loadFromInput;
  if (ui.codeInput) ui.codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadFromInput();
  });

  // --- Robust ?code=... auto-load ---
  (function ensureAutoLoad() {
    const params = new URLSearchParams(location.search);
    const pre = (params.get('code') || '').trim();
    if (!pre) return;

    let tries = 0;
    const tick = () => {
      const input = document.getElementById('code') || document.getElementById('codeInput');
      if (input && typeof loadFromInput === 'function') {
        input.value = pre;
        loadFromInput();   // call directly
        return;
      }
      if (++tries < 10) setTimeout(tick, 100);
    };
    tick();
  })();

})(); // <— DO NOT REMOVE: closes the file's top-level IIFE
