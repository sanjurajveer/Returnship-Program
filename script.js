// ---------- CONFIG ----------
const API_BASE = "https://0pucip4bnl.execute-api.us-east-1.amazonaws.com"; // $default stage

// ---------- STATE ----------
let programs = [];   // full dataset from API or local fallback
let view = [];       // filtered view
let resources = [];  // external support sites
const PAGE_SIZE = 4;
let visibleCount = PAGE_SIZE;

// ---------- DOM (Returners page) ----------
const elList     = document.getElementById('list');        // programs grid
const elQ        = document.getElementById('q');           // search box
const elPaidOnly = document.getElementById('paidOnly');    // paid only checkbox
const elRegion   = document.getElementById('region');      // region select
const elDuration = document.getElementById('duration');    // duration select
const resList    = document.getElementById('resources-list'); // resources grid
const elLoadMore = document.getElementById('loadMore');

// ---------- HELPERS ----------
const norm = (s) => (s ?? '').toString().trim().toLowerCase();

// Turn a tag like "resume guidance" → "#resume-guidance"
const toHashtag = (s) => {
  const t = (s || '').toString().trim().toLowerCase().replace(/\s+/g, '-');
  return t ? `#${t}` : '';
};

// Build a unique, sorted list of suggestion keywords for the datalist
function buildSuggestions(list){
  const set = new Set();
  list.forEach(p => {
    if (p.company) set.add(p.company);
    if (p.title)   set.add(p.title);
    (Array.isArray(p.region) ? p.region : []).forEach(r => set.add(r));
    (Array.isArray(p.tags)   ? p.tags   : []).forEach(t => set.add(t));
  });
  // Helpful common terms
  ['paid','unpaid','mentorship','training','hybrid','remote','cohort','full-time']
    .forEach(k => set.add(k));
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function populateDatalist(options){
  const dl = document.getElementById('q-suggestions');
  if (!dl) return;
  dl.innerHTML = options.map(opt => `<option value="${opt}"></option>`).join('');
}

function matchesQuery(p, q){
  if (!q) return true;
  const hay = `${p.title||''} ${p.company||''} ${p.description||''}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}
function matchesPaid(p, paidOnly){ return !paidOnly || !!p.paid; }
function matchesRegion(p, sel){
  if (!sel) return true;
  const regions = Array.isArray(p.region) ? p.region : [];
  return regions.some(r => norm(r) === norm(sel));
}
function matchesDuration(p, sel){
  if (!sel) return true;
  const w = parseInt(p.durationWeeks || 0, 10);
  if (sel === 'short') return w <= 16;
  if (sel === 'mid')   return w >= 17 && w <= 26;
  if (sel === 'long')  return w >= 27;
  return true;
}

// ---------- RENDER (Programs) ----------
function render(){
  if (!elList) return;
  elList.innerHTML = '';

  if (!view.length){
    elList.innerHTML = `
      <div class="empty">
        <p>No programs match your filters. Try clearing filters.</p>
      </div>`;
    if (elLoadMore) elLoadMore.style.display = 'none';
    return;
  }

  // NEW: slice to visible portion
  const subset = view.slice(0, visibleCount);

  const frag = document.createDocumentFragment();
  subset.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';

    const weeks   = p.durationWeeks ? `${p.durationWeeks} wks` : '—';
    const regions = (p.region || []).join(', ') || '—';

    const hashtags = (p.tags || [])
      .map(toHashtag).filter(Boolean)
      .map(h => `<span class="hashtag">${h}</span>`).join(' ');

    card.innerHTML = `
      <div class="card-hd">
        <h3 class="card-title">${p.title || 'Untitled'}</h3>
        <div class="company">${p.company || ''}</div>
      </div>
      <p class="desc">${p.description || ''}</p>
      <div class="meta">
        <span class="pill">${p.paid ? 'Paid' : 'Unpaid/Varies'}</span>
        <span class="pill">${weeks}</span>
        <span class="pill">${regions}</span>
      </div>
      <div class="tags-row">${hashtags || ''}</div>
      <div class="cta">
        <a class="btn" target="_blank" rel="noopener" href="${p.applicationUrl}">Apply</a>
      </div>
    `;
    frag.appendChild(card);
  });
  elList.appendChild(frag);

  // NEW: toggle button
  if (elLoadMore) {
    elLoadMore.style.display = (visibleCount < view.length) ? 'inline-flex' : 'none';
  }
}


// ---------- RENDER (Resources) ----------
function renderResources(){
  if (!resList) return;
  if (!resources.length){
    resList.innerHTML = `<div class="empty"><p>No resources found.</p></div>`;
    return;
  }
  resList.innerHTML = resources.map(r => `
    <article class="resource-card">
      <div class="rc-head">
        ${r.logo ? `<img class="rc-logo" src="${r.logo}" alt="${r.name} logo" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div>
          <h3 class="rc-title">${r.name}</h3>
          <div class="rc-meta">
            ${(r.region||[]).map(x=>`<span class="pill">${x}</span>`).join('')}
            ${r.type ? `<span class="pill">${r.type}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="rc-desc">${r.description || ''}</p>
      <div class="rc-cta">
        <a class="btn" target="_blank" rel="noopener" href="${r.url}">Visit site</a>
      </div>
    </article>
  `).join('');
}

// ---------- DATA LOADERS ----------
async function loadPrograms(){
  try {
    const res = await fetch(`${API_BASE}/programs`, { mode: 'cors' });
    if (!res.ok) throw new Error('API error ' + res.status);
    const json = await res.json();
    programs = json.items || [];
  } catch (e) {
    console.warn('API failed, using static programs.json', e);
    const res = await fetch('programs.json', { cache: 'no-store' });
    programs = await res.json();
  }
  populateDatalist(buildSuggestions(programs));
  applyFilters();
}

async function loadResources(){
  try {
    const resp = await fetch('resources.json?v=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('resources.json not found');
    resources = await resp.json();
  } catch (e) {
    console.warn('Falling back to inline resources:', e);
    // Never show a blank section
    resources = [
      {
        id: "backtoworkconnect",
        name: "Back to Work Connect",
        url: "https://backtoworkconnect.ie/",
        region: ["Ireland"],
        type: "Directory",
        description: "Irish platform connecting returners with flexible roles, courses, and community resources.",
        logo: "https://backtoworkconnect.ie/wp-content/uploads/2020/07/btwc-logo.svg"
      },
      {
        id: "employmum",
        name: "Employmum | The Flexible Recruitment Company",
        url: "https://employmum.ie/",
        region: ["Ireland"],
        type: "Recruitment",
        description: "Specialist in flexible work and returner opportunities, plus coaching and employer partnerships.",
        logo: "https://employmum.ie/wp-content/uploads/2020/10/Employmum-logo.svg"
      },
      {
        id: "careerreturners-ireland",
        name: "Career Returners – Ireland",
        url: "https://careerreturners.com/career-returners-ireland/",
        region: ["Ireland", "UK", "EU"],
        type: "Programme Hub",
        description: "Curated returner programmes, events and guidance for experienced professionals returning to work.",
        logo: "https://careerreturners.com/wp-content/uploads/2022/08/career-returners-logo.svg"
      }
    ];
  }
  renderResources();
}

// ---------- FILTERS ----------
function applyFilters(){
  const q      = elQ?.value || '';
  const region = elRegion?.value || '';
  const dur    = elDuration?.value || '';
  const paid   = !!(elPaidOnly && elPaidOnly.checked);

  view = programs
    .filter(p => matchesQuery(p, q))
    .filter(p => matchesRegion(p, region))
    .filter(p => matchesDuration(p, dur))
    .filter(p => matchesPaid(p, paid))
    .sort((a,b) => {
      const ac = norm(a.company), bc = norm(b.company);
      if (ac !== bc) return ac < bc ? -1 : 1;
      return norm(a.title) < norm(b.title) ? -1 : 1;
    });

  visibleCount = PAGE_SIZE;

  render();
}

function wireFilters(){
  elQ?.addEventListener('input', applyFilters);
  elPaidOnly?.addEventListener('change', applyFilters);
  elRegion?.addEventListener('change', applyFilters);
  elDuration?.addEventListener('change', applyFilters);
}

// ---------- SUGGEST FORM (Recruiters) ----------
function wireSuggestForm(){
  const form = document.getElementById('suggest');
  if (!form) return;

  const btn  = document.getElementById('suggest-btn');
  const msg  = document.getElementById('suggest-msg');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    msg.textContent = '';

    // Honeypot (spam trap)
    if ((form.querySelector('input[name="website"]')?.value || '').trim() !== '') {
      msg.textContent = 'Thanks!';
      return;
    }

    const fd = new FormData(form);
    const payload = {
      company: (fd.get('company') || '').toString().trim(),
      link:    (fd.get('link') || '').toString().trim(),
      notes:   (fd.get('notes') || '').toString().trim()
    };

    if (!payload.company || !payload.link){
      msg.textContent = 'Company and link are required.';
      return;
    }

    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch(`${API_BASE}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify(payload)
      });

      if (!r.ok){
        const txt = await r.text();
        throw new Error(`API error ${r.status}: ${txt}`);
      }

      msg.textContent = 'Thanks! We received your suggestion.';
      form.reset();
    } catch (err) {
      console.error(err);
      msg.textContent = 'Sorry, something went wrong. Please try again.';
    } finally {
      btn.disabled = false; btn.textContent = 'Send suggestion';
    }
  });
}

// ---------- BOOT ----------
document.addEventListener('DOMContentLoaded', async () => {
  const needPrograms  = !!document.getElementById('list');
  const needResources = !!document.getElementById('resources-list');
  const needSuggest   = !!document.getElementById('suggest');

  if (needPrograms) {
    wireFilters();
    await loadPrograms();
  }
  if (needResources) {
    await loadResources();
  }
  if (needSuggest) {
    wireSuggestForm();
  }
  // NEW: Load more
  if (elLoadMore) {
    elLoadMore.addEventListener('click', () => {
      visibleCount += PAGE_SIZE;
      render();
    });
  }
});