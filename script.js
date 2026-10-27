// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = 'https://osjmeuzejyqfkooviwxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_p72XaPx3GAQP0LvyPD0-2Q_IaoLWPRn';

// Supabase 표를 부르는 함수. path 예: 'projects?select=*'
async function db(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const error = new Error(`Supabase 오류 ${res.status}`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ===== 작은 도우미 =====
const $ = (id) => document.getElementById(id);

// 태그를 만들고 글자를 넣는다 (글자는 항상 textContent로 넣어서 안전하게)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// http/https 주소만 쓴다
function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

// 이 브라우저의 번호 (좋아요를 카드마다 한 번만 누르게 하려고 저장해 둔다)
function getClientId() {
  let id = localStorage.getItem('resume_client_id');
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('resume_client_id', id);
  }
  return id;
}

// 이 브라우저에서 좋아요를 누른 카드 번호들
function getLikedIds() {
  try {
    return JSON.parse(localStorage.getItem('resume_liked') || '[]');
  } catch {
    return [];
  }
}
function saveLikedId(projectId) {
  const ids = getLikedIds();
  if (!ids.includes(projectId)) ids.push(projectId);
  localStorage.setItem('resume_liked', JSON.stringify(ids));
}

const HEART_SVG =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.5 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.4 3.5 4.1 6.7C19.5 16.4 12 21 12 21z"/></svg>';

// ===== 프로필 =====
async function loadProfile() {
  const rows = await db('profile?select=*&id=eq.1');
  const p = rows[0];
  if (!p) return;

  document.title = p.name ? `${p.name} | Portfolio` : 'Portfolio';

  const photoUrl = safeUrl(p.photo_url);
  if (photoUrl) {
    const img = el('img');
    img.src = photoUrl;
    img.alt = `${p.name} 프로필 사진`;
    $('photo').append(img);
  }

  $('name').textContent = p.name;
  $('job-title').textContent = p.title;
  $('career-badge').textContent = p.career_badge;
  $('contact-name').textContent = p.name;
  $('contact-email').textContent = p.email;
  $('contact-phone').textContent = p.phone;
  $('contact-location').textContent = p.location;

  // 한 줄 소개: 이름 부분에만 파란 밑줄
  const headline = $('headline');
  const at = p.name ? p.headline.indexOf(p.name) : -1;
  if (at >= 0) {
    headline.append(
      p.headline.slice(0, at),
      el('span', 'hl-name', p.name),
      p.headline.slice(at + p.name.length)
    );
  } else {
    headline.textContent = p.headline;
  }

  $('intro').textContent = p.intro;
  $('education').textContent = p.education;
  $('skills').textContent = p.skills;
  $('experience').textContent = p.experience;
  $('quote').textContent = p.quote;
}

// ===== 포트폴리오 카드 =====
async function loadProjects() {
  const [projects, likes] = await Promise.all([
    db('projects?select=*&order=sort_order.asc,id.asc'),
    db('likes?select=project_id'),
  ]);

  // 카드별 좋아요 수 세기
  const counts = {};
  for (const like of likes) {
    counts[like.project_id] = (counts[like.project_id] || 0) + 1;
  }

  const box = $('cards');
  box.innerHTML = '';
  if (projects.length === 0) {
    box.append(el('p', 'status', '아직 등록된 프로젝트가 없습니다.'));
    return;
  }

  const liked = getLikedIds();
  for (const project of projects) {
    box.append(makeCard(project, counts[project.id] || 0, liked.includes(project.id)));
  }
}

function makeCard(project, likeCount, isLiked) {
  const card = el('article', 'card');

  // 누르면 열릴 주소: 첨부 파일이 있으면 그것, 없으면 썸네일
  const openUrl = safeUrl(project.file_url) || safeUrl(project.thumbnail_url);
  const link = el(openUrl ? 'a' : 'div', 'card-link');
  if (openUrl) {
    link.href = openUrl;
    link.target = '_blank';
    link.rel = 'noopener';
  }

  // 브라우저 창 모양 썸네일
  const browser = el('div', 'browser');
  const bar = el('div', 'browser-bar');
  bar.append(el('i'), el('i'), el('i'));
  const view = el('div', 'browser-view');
  const thumb = safeUrl(project.thumbnail_url);
  if (thumb) {
    const img = el('img');
    img.src = thumb;
    img.alt = '';
    img.loading = 'lazy';
    view.append(img);
  }
  browser.append(bar, view);

  const body = el('div', 'card-body');
  const meta = el('p', 'card-meta');
  meta.append(el('b', '', project.number), project.category);
  body.append(
    meta,
    el('h4', 'card-title', project.title),
    el('p', 'card-desc', project.description)
  );

  link.append(browser, body);

  // 아래쪽: 태그와 좋아요
  const foot = el('div', 'card-foot');
  const tags = el('div', 'tags');
  for (const tag of project.tags || []) tags.append(el('span', '', tag));

  const likeBtn = el('button', 'like');
  likeBtn.type = 'button';
  likeBtn.innerHTML = HEART_SVG;
  const countEl = el('span', '', likeCount);
  likeBtn.append(countEl);
  setLiked(likeBtn, isLiked);
  likeBtn.addEventListener('click', () => likeProject(project.id, likeBtn, countEl));

  foot.append(tags, likeBtn);
  card.append(link, foot);
  return card;
}

function setLiked(button, isLiked) {
  button.classList.toggle('liked', isLiked);
  button.disabled = isLiked;
  button.setAttribute('aria-label', isLiked ? '좋아요를 눌렀어요' : '좋아요');
}

async function likeProject(projectId, button, countEl) {
  if (getLikedIds().includes(projectId)) return;
  button.disabled = true;
  try {
    await db('likes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: { project_id: projectId, client_id: getClientId() },
    });
    countEl.textContent = Number(countEl.textContent) + 1;
    saveLikedId(projectId);
    setLiked(button, true);
  } catch (error) {
    if (error.status === 409) {
      // 이 브라우저는 이미 눌렀던 카드
      saveLikedId(projectId);
      setLiked(button, true);
    } else {
      button.disabled = false;
      alert('좋아요를 남기지 못했어요. 잠시 후 다시 눌러 주세요.');
    }
  }
}

// ===== 방명록 =====
function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeGuestbookItem(entry) {
  const li = el('li');
  const head = el('div', 'gb-head');
  const time = el('time', '', formatDate(entry.created_at));
  time.dateTime = entry.created_at;
  head.append(el('b', '', entry.nickname), time);
  li.append(head, el('p', 'gb-text', entry.message));
  return li;
}

async function loadGuestbook() {
  const entries = await db('resume_guestbook?select=*&order=created_at.desc');
  const list = $('gb-list');
  list.innerHTML = '';
  if (entries.length === 0) {
    list.append(el('li', 'status', '첫 번째 한마디를 남겨 주세요.'));
    return;
  }
  for (const entry of entries) list.append(makeGuestbookItem(entry));
}

async function addGuestbook() {
  const nickname = $('gb-nickname').value.trim();
  const message = $('gb-message').value.trim();
  const notice = $('gb-notice');
  const button = $('gb-submit');

  if (!nickname || !message) {
    notice.textContent = '별명과 한마디를 모두 적어 주세요.';
    return;
  }
  notice.textContent = '';
  button.disabled = true;
  try {
    const rows = await db('resume_guestbook', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { nickname, message },
    });
    const list = $('gb-list');
    const empty = list.querySelector('.status');
    if (empty) empty.remove();
    list.prepend(makeGuestbookItem(rows[0]));   // 목록 맨 위에
    $('gb-message').value = '';
  } catch {
    notice.textContent = '남기지 못했어요. 잠시 후 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
}

$('gb-submit').addEventListener('click', addGuestbook);
$('gb-message').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) addGuestbook();
});

// ===== 시작 =====
loadProfile().catch(() => {
  $('headline').textContent = '프로필을 불러오지 못했어요.';
});
loadProjects().catch(() => {
  $('cards').innerHTML = '';
  $('cards').append(el('p', 'status', '프로젝트를 불러오지 못했어요.'));
});
loadGuestbook().catch(() => {
  $('gb-list').innerHTML = '';
  $('gb-list').append(el('li', 'status', '방명록을 불러오지 못했어요.'));
});
