(() => {
  const config = window.CONFIG || {};
  const { GITHUB_USER, REPO, BRANCH, DATA_PATH } = config;
  // Normalise data path by trimming leading/trailing slashes.  When
  // constructing the raw GitHub URL, we append a trailing slash
  // only if the path is non‑empty.
  let dataPath = DATA_PATH || '';
  dataPath = dataPath.replace(/^\/+/,'').replace(/\/+$/,'');
  const rawBase = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO}/${BRANCH}/${dataPath}` + (dataPath ? '/' : '');

  let currentData = null;
  let lang = localStorage.getItem('reader_lang') || 'en';
  let theme = localStorage.getItem('reader_theme') || 'dark';
  document.body.dataset.theme = theme;

  // Translation strings for table headers
  const T = {
    en: { track:'Track', stage:'Current Stage', progress:'Progress' },
    de: { track:'Bereich', stage:'Aktuelle Stufe', progress:'Fortschritt' }
  };

  // DOM references
  const codeInput = document.getElementById('code-input');
  const loadBtn   = document.getElementById('load-code-btn');
  const errorEl   = document.getElementById('error-message');
  const summaryEl = document.getElementById('r-summary');
  const modifiedEl= document.getElementById('r-modified');
  const hdrEl     = document.getElementById('hdr');
  const ftrEl     = document.getElementById('ftr');
  const titleEl   = document.getElementById('r-title');
  const theadEl   = document.getElementById('thead');
  const tbodyEl   = document.getElementById('rows');
  const loadingEl = document.getElementById('loading-spinner');

  // Show and hide the loading spinner
  function showLoading() {
    loadingEl.classList.add('active');
  }
  function hideLoading() {
    loadingEl.classList.remove('active');
  }
  // Display an error message or hide it when message is empty
  function showError(message) {
    if(message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
  function hideError() {
    showError('');
  }

  // Highlight the currently selected language button
  function updateLangButtons() {
    const btnEn = document.getElementById('lang-en');
    const btnDe = document.getElementById('lang-de');
    btnEn.classList.remove('primary');
    btnDe.classList.remove('primary');
    if(lang === 'de') {
      btnDe.classList.add('primary');
    } else {
      btnEn.classList.add('primary');
    }
  }

  // Set the interface language and re‑render the current project
  function setLang(l) {
    lang = l;
    localStorage.setItem('reader_lang', l);
    updateLangButtons();
    if(currentData) {
      render(currentData);
    }
  }

  // Toggle between dark and light themes and persist the choice
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = theme;
    localStorage.setItem('reader_theme', theme);
  }

  // Fetch a project JSON by its code.  Throws if the request fails.
  async function fetchProject(code) {
    const url = rawBase + encodeURIComponent(code) + '.json';
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) {
      throw new Error(res.status === 404 ? 'Project not found' : 'Failed to fetch project data');
    }
    return await res.json();
  }

  // Determine a last modified timestamp for the project file.  Try
  // capturing the Last‑Modified header via a HEAD request; if not
  // available, fall back to the GitHub commits API.  Returns an
  // empty string if the timestamp cannot be determined.
  async function getLastModified(code) {
    let lm = '';
    const fileUrl = rawBase + encodeURIComponent(code) + '.json';
    try {
      const res = await fetch(fileUrl, { method: 'HEAD' });
      lm = res.headers.get('last-modified') || res.headers.get('Last-Modified') || '';
    } catch(_e) {
      // ignore HEAD errors
    }
    if(!lm) {
      try {
        const path = (dataPath ? dataPath + '/' : '') + encodeURIComponent(code) + '.json';
        const apiUrl = 'https://api.github.com/repos/' + GITHUB_USER + '/' + REPO + '/commits?path=' + encodeURIComponent(path) + '&sha=' + encodeURIComponent(BRANCH) + '&per_page=1';
        const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } });
        if(res.ok) {
          const commits = await res.json();
          if(Array.isArray(commits) && commits.length > 0) {
            const c = commits[0];
            if(c && c.commit && c.commit.author && c.commit.author.date) {
              lm = c.commit.author.date;
            }
          }
        }
      } catch(_e2) {
        // ignore API errors
      }
    }
    return lm;
  }

  // Minimal Markdown parser supporting headings, horizontal rules,
  // blockquotes, lists, bold and italic text.  Unrecognised line
  // breaks are converted to <br/>.  This matches the behaviour of
  // the original Reader implementation.
  function mdToHtml(src) {
    if(!src) return '';
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    let out = [];
    let i = 0;
    function flushList(buf, ordered) {
      if(!buf.length) return;
      out.push(ordered ? '<ol>' : '<ul>');
      for(const item of buf) {
        let t = item
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        out.push('<li>' + t + '</li>');
      }
      out.push(ordered ? '</ol>' : '</ul>');
    }
    while(i < lines.length) {
      const ln = lines[i];
      // Ordered list
      if(/^\s*\d+\.\s+/.test(ln)) {
        const buf = [];
        while(i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        flushList(buf, true);
        continue;
      }
      // Unordered list
      if(/^\s*([*+-])\s+/.test(ln)) {
        const buf = [];
        while(i < lines.length && /^\s*([*+-])\s+/.test(lines[i])) {
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
      s = s.replace(/^##\s+(.*)$/, '<h2>$1</h2>');
      s = s.replace(/^#\s+(.*)$/, '<h1>$1</h1>');
      if(!/^<h[123]>|^<hr|^<blockquote>/.test(s)) {
        s = s
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
      }
      out.push(s);
      i++;
    }
    return out.join('\n').replace(/(?<!>)\n(?!<)/g, '<br/>');
  }

  // Compute summary statistics: how many segments are done vs total
  function calcStats(d) {
    let done = 0;
    let total = 0;
    (d.tracks || []).forEach(t => {
      const ms = t.milestones || [];
      const len = ms.length;
      if(len < 2) return;
      const segs = len - 1;
      total += segs;
      const idx = ms.findIndex(m => m.id === t.currentMilestoneId);
      if(idx <= 0) return;
      if(idx >= len - 1) done += segs;
      else done += idx;
    });
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }

  // Render the report data into the page.  This sets the title,
  // header, summary, last updated timestamp and builds the tracks
  // table with segmented progress bars and tooltips.
  function render(data) {
    if(!data) return;
    titleEl.textContent = data.projectName || 'Progress Reader';
    document.title  = data.projectName || 'Progress Reader';
    hdrEl.innerHTML = mdToHtml(data.header || '');
    ftrEl.innerHTML = mdToHtml(data.footer || '');
    const stats = calcStats(data);
    summaryEl.textContent = `${stats.done}/${stats.total} (${stats.pct}%)`;
    if(data.lastModified) {
      let formatted = data.lastModified;
      try { formatted = new Date(data.lastModified).toLocaleString(); } catch(_e) {}
      modifiedEl.textContent = 'Last updated: ' + formatted;
    } else {
      modifiedEl.textContent = '';
    }
    theadEl.innerHTML = `<th>${T[lang].track}</th><th>${T[lang].stage}</th><th style="width:50%">${T[lang].progress}</th>`;
    tbodyEl.innerHTML = '';
    (data.tracks || []).forEach(t => {
      const row = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.textContent = (lang === 'de' ? (t.de || t.en || t.id) : (t.en || t.de || t.id)) || '';
      row.appendChild(nameTd);
      const stageTd = document.createElement('td');
      const ms = t.milestones || [];
      let curIndex = ms.findIndex(m => m.id === t.currentMilestoneId);
      if(curIndex < 0) curIndex = 0;
      const stage = ms[curIndex];
      stageTd.textContent = stage ? (lang === 'de' ? (stage.de || stage.en || stage.id) : (stage.en || stage.de || stage.id)) : '';
      row.appendChild(stageTd);
      const progressTd = document.createElement('td');
      const segs = ms.length > 1 ? ms.length - 1 : 0;
      let pct = 0;
      if(segs > 0) {
        const bar = document.createElement('div');
        bar.className = 'progress segmented' + (curIndex >= segs ? ' full' : '');
        for(let j = 0; j < segs; j++) {
          const seg = document.createElement('div');
          seg.className = 'segment ' + (j < curIndex ? 'done' : 'todo');
          const nextMs = ms[j + 1];
          if(nextMs) {
            const langKey = lang === 'de' ? 'de' : 'en';
            let label = nextMs[langKey] || nextMs[langKey === 'de' ? 'en' : 'de'] || nextMs.id;
            seg.title = label;
          }
          bar.appendChild(seg);
        }
        pct = Math.round((curIndex / segs) * 100);
        progressTd.appendChild(bar);
      } else {
        const bar = document.createElement('div');
        bar.className = 'progress';
        const inner = document.createElement('div');
        inner.style.width = '0%';
        bar.appendChild(inner);
        progressTd.appendChild(bar);
        pct = 0;
      }
      const pctSpan = document.createElement('div');
      pctSpan.className = 'small';
      pctSpan.textContent = pct + '%';
      progressTd.appendChild(pctSpan);
      row.appendChild(progressTd);
      tbodyEl.appendChild(row);
    });
  }

  // Attempt to load the project referenced by the current code input
  async function loadCurrentCode() {
    const code = codeInput.value.trim();
    if(!code) {
      showError('Please enter a project code.');
      return;
    }
    showLoading();
    hideError();
    try {
      const [data, lm] = await Promise.all([fetchProject(code), getLastModified(code)]);
      if(lm && !data.lastModified) {
        data.lastModified = lm;
      }
      currentData = data;
      render(data);
      localStorage.setItem('last_code', code);
    } catch(e) {
      showError(e.message || 'Failed to load project.');
      currentData = null;
      hdrEl.innerHTML = '';
      ftrEl.innerHTML = '';
      summaryEl.textContent = '';
      modifiedEl.textContent = '';
      theadEl.innerHTML = '';
      tbodyEl.innerHTML = '';
    } finally {
      hideLoading();
    }
  }

  // Bind UI event handlers
  document.getElementById('lang-en').addEventListener('click', () => setLang('en'));
  document.getElementById('lang-de').addEventListener('click', () => setLang('de'));
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('pdf-btn').addEventListener('click', () => {
    const prevTheme = document.body.dataset.theme;
    document.body.dataset.theme = 'light';
    window.print();
    document.body.dataset.theme = prevTheme;
  });
  loadBtn.addEventListener('click', loadCurrentCode);
  codeInput.addEventListener('keypress', evt => {
    if(evt.key === 'Enter') {
      evt.preventDefault();
      loadCurrentCode();
    }
  });

  // Initialise language buttons
  updateLangButtons();

  // Prepopulate code input from the query string (code parameter) or
  // previously used code stored in localStorage.  Query string
  // overrides localStorage.  We only auto‑load when a code is
  // explicitly provided via the query string; otherwise the user
  // must click the Load button.
  (function() {
    const params = new URLSearchParams(window.location.search);
    const qCode = params.get('code');
    const stored = localStorage.getItem('last_code');
    if(qCode) {
      codeInput.value = qCode;
      loadCurrentCode();
    } else if(stored) {
      codeInput.value = stored;
      // Do not auto‑load stored code; user must click Load.
    }
  })();
})();
