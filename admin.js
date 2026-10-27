// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = 'https://osjmeuzejyqfkooviwxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_p72XaPx3GAQP0LvyPD0-2Q_IaoLWPRn';
const BUCKET = 'resume';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const FILE_TYPES = { ...IMAGE_TYPES, 'application/pdf': 'pdf' };

// ===== 작은 도우미 =====
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

function showMsg(id, text, isError) {
  const box = $(id);
  box.textContent = text;
  box.className = 'msg ' + (isError ? 'err' : 'ok');
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 로그인 정보 (이 브라우저에 보관) =====
const SESSION_KEY = 'resume_admin_session';
let session = null;

function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user: { id: data.user.id, email: data.user.email },
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

async function auth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error_description || data.msg || '로그인 오류');
    error.status = res.status;
    throw error;
  }
  return data;
}

// 토큰이 1분 안에 끝나면 새 토큰으로 바꾼다
async function getToken() {
  if (!session) throw new Error('로그인이 필요해요.');
  if (Date.now() > session.expires_at - 60 * 1000) {
    try {
      saveSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
    } catch {
      clearSession();
      showView('login');
      showMsg('login-msg', '로그인 시간이 끝났어요. 다시 로그인해 주세요.', true);
      throw new Error('로그인 시간이 끝났어요.');
    }
  }
  return session.access_token;
}

// ===== 표 부르기 (로그인 토큰을 붙여서) =====
async function db(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `오류 ${res.status}`;
    try { message = JSON.parse(text).message || message; } catch {}
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

// 고치기·지우기는 바뀐 줄을 돌려받아서, 0줄이면 규칙에 막힌 것으로 본다
async function change(path, method, body, prefer = '') {
  const headers = { Prefer: ['return=representation', prefer].filter(Boolean).join(',') };
  const rows = await db(path, { method, body, headers });
  if (!rows || rows.length === 0) throw new Error('권한이 없거나 이미 없는 항목이에요.');
  return rows;
}

// ===== 파일 올리기 =====
// 문제가 있으면 안내 문구를, 괜찮으면 ''를 돌려준다
function checkFile(file, allowed) {
  if (!file) return '';
  if (!allowed[file.type]) {
    return allowed === IMAGE_TYPES
      ? `"${file.name}"은(는) 이미지(PNG·JPG·WEBP·GIF)가 아니에요.`
      : `"${file.name}"은(는) 이미지나 PDF가 아니에요.`;
  }
  if (file.size > MAX_FILE_SIZE) return `"${file.name}"이(가) 10MB보다 커요.`;
  return '';
}

// 파일 이름은 영어·숫자로 새로 짓는다. 예: projects/20261027-153012-a8f3k2.pdf
function newFileName(folder, file) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const random = Math.random().toString(36).slice(2, 8);
  return `${folder}/${stamp}-${random}.${FILE_TYPES[file.type]}`;
}

async function uploadFile(folder, file) {
  const path = newFileName(folder, file);
  const token = await getToken();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type,
    },
    body: file,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`파일을 올리지 못했어요. (${data.message || res.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ===== 화면 바꾸기 =====
function showView(name) {
  $('login-view').classList.toggle('hidden', name !== 'login');
  $('denied-view').classList.toggle('hidden', name !== 'denied');
  $('admin-view').classList.toggle('hidden', name !== 'admin');
}

async function enter() {
  // admins 표에는 "자기 줄"만 보인다. 줄이 있으면 관리자.
  const rows = await db(`admins?select=user_id&user_id=eq.${session.user.id}`);
  if (rows.length === 0) {
    $('denied-email').textContent = `${session.user.email} 계정은 관리자로 등록되어 있지 않아요.`;
    showView('denied');
    return;
  }
  $('admin-email').textContent = session.user.email;
  showView('admin');
  loadProfile();
  loadAll();
}

async function login() {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) {
    showMsg('login-msg', '이메일과 비밀번호를 적어 주세요.', true);
    return;
  }
  $('login-button').disabled = true;
  showMsg('login-msg', '', false);
  try {
    saveSession(await auth('token?grant_type=password', { email, password }));
    $('login-password').value = '';
    await enter();
  } catch (error) {
    clearSession();
    showMsg('login-msg', error.status === 400 ? '이메일 또는 비밀번호가 맞지 않아요.' : error.message, true);
  } finally {
    $('login-button').disabled = false;
  }
}

async function logout() {
  if (session) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  clearSession();
  showView('login');
}

// ===== 프로필 =====
const PROFILE_FIELDS = [
  'name', 'title', 'career_badge', 'email', 'phone', 'location',
  'headline', 'intro', 'education', 'skills', 'experience', 'quote',
];
let profilePhotoUrl = null;

function showPhotoPreview(url) {
  const box = $('pf-photo-preview');
  box.innerHTML = '';
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '프로필 사진 미리 보기';
    box.append(img);
  }
}

async function loadProfile() {
  try {
    const rows = await db('profile?select=*&id=eq.1');
    const p = rows[0] || {};
    for (const key of PROFILE_FIELDS) $(`pf-${key}`).value = p[key] || '';
    profilePhotoUrl = p.photo_url || null;
    showPhotoPreview(safeUrl(profilePhotoUrl));
  } catch (error) {
    showMsg('pf-msg', `프로필을 불러오지 못했어요. (${error.message})`, true);
  }
}

$('pf-photo').addEventListener('change', () => {
  const file = $('pf-photo').files[0];
  const problem = checkFile(file, IMAGE_TYPES);
  if (problem) {
    showMsg('pf-msg', problem, true);
    $('pf-photo').value = '';
    return;
  }
  showMsg('pf-msg', '', false);
  if (file) showPhotoPreview(URL.createObjectURL(file));
});

async function saveProfile() {
  const file = $('pf-photo').files[0];
  const problem = checkFile(file, IMAGE_TYPES);
  if (problem) return showMsg('pf-msg', problem, true);

  $('pf-save').disabled = true;
  showMsg('pf-msg', '저장 중…', false);
  try {
    if (file) profilePhotoUrl = await uploadFile('profile', file);
    const row = { id: 1, photo_url: profilePhotoUrl, updated_at: new Date().toISOString() };
    for (const key of PROFILE_FIELDS) row[key] = $(`pf-${key}`).value.trim();
    // 프로필 줄이 있으면 고치고, 없으면 새로 만든다
    await change('profile?on_conflict=id', 'POST', row, 'resolution=merge-duplicates');
    $('pf-photo').value = '';
    showMsg('pf-msg', '저장했어요. 방문자 화면을 새로고침하면 보여요.', false);
  } catch (error) {
    showMsg('pf-msg', `저장하지 못했어요. (${error.message})`, true);
  } finally {
    $('pf-save').disabled = false;
  }
}

// ===== 포트폴리오 카드 · 방명록 · 좋아요 =====
let projects = [];
let likeCounts = {};

async function loadAll() {
  try {
    const [projectRows, likeRows] = await Promise.all([
      db('projects?select=*&order=sort_order.asc,id.asc'),
      db('likes?select=project_id'),
    ]);
    projects = projectRows;
    likeCounts = {};
    for (const like of likeRows) {
      likeCounts[like.project_id] = (likeCounts[like.project_id] || 0) + 1;
    }
    renderProjects();
    renderLikes();
  } catch (error) {
    showMsg('pj-list-msg', `카드를 불러오지 못했어요. (${error.message})`, true);
  }
  loadGuestbook();
}

function renderProjects() {
  const list = $('pj-list');
  list.innerHTML = '';
  if (projects.length === 0) {
    list.append(el('p', 'status', '아직 카드가 없어요. "+ 카드 추가"를 눌러 주세요.'));
    return;
  }
  projects.forEach((project, index) => {
    const row = el('div', 'row');

    const thumb = el('div', 'row-thumb');
    const thumbUrl = safeUrl(project.thumbnail_url);
    if (thumbUrl) {
      const img = el('img');
      img.src = thumbUrl;
      img.alt = '';
      thumb.append(img);
    }

    const main = el('div', 'row-main');
    const meta = el('p', 'card-meta');
    meta.append(el('b', '', project.number), project.category);
    main.append(meta, el('strong', '', project.title));
    const extra = [];
    if (project.tags && project.tags.length) extra.push(`태그: ${project.tags.join(', ')}`);
    if (project.file_url) extra.push('첨부 파일 있음');
    if (extra.length) main.append(el('p', '', extra.join(' · ')));

    const likes = el('span', 'row-likes', `♥ ${likeCounts[project.id] || 0}`);

    const buttons = el('div', 'row-buttons');
    const up = button('▲ 올리기', 'btn btn-small', () => moveProject(index, -1));
    const down = button('▼ 내리기', 'btn btn-small', () => moveProject(index, 1));
    up.disabled = index === 0;
    down.disabled = index === projects.length - 1;
    buttons.append(
      up,
      down,
      button('수정', 'btn btn-small', () => openEditor(project)),
      button('삭제', 'btn btn-small btn-danger', () => deleteProject(project))
    );

    row.append(thumb, main, likes, buttons);
    list.append(row);
  });
}

// 순서 바꾸기: 자리를 바꾼 뒤 1, 2, 3… 으로 다시 매기고, 달라진 카드만 저장
async function moveProject(index, step) {
  const target = index + step;
  if (target < 0 || target >= projects.length) return;
  const ordered = projects.slice();
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  const changed = [];
  ordered.forEach((project, i) => {
    if (project.sort_order !== i + 1) changed.push({ id: project.id, sort_order: i + 1 });
  });

  $('pj-list').querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    for (const item of changed) {
      await change(`projects?id=eq.${item.id}`, 'PATCH', { sort_order: item.sort_order });
    }
    showMsg('pj-list-msg', '순서를 바꿨어요.', false);
  } catch (error) {
    showMsg('pj-list-msg', `순서를 바꾸지 못했어요. (${error.message})`, true);
  }
  loadAll();
}

async function deleteProject(project) {
  if (!confirm(`"${project.title}" 카드를 지울까요?\n이 카드의 좋아요도 함께 지워져요.`)) return;
  try {
    await change(`projects?id=eq.${project.id}`, 'DELETE');
    showMsg('pj-list-msg', '카드를 지웠어요.', false);
    if (editing && editing.id === project.id) closeEditor();
  } catch (error) {
    showMsg('pj-list-msg', `지우지 못했어요. (${error.message})`, true);
  }
  loadAll();
}

// ----- 카드 추가·수정 상자 -----
let editing = null;            // 고치는 중인 카드 (새 카드면 빈 객체)
let editThumbnailUrl = null;   // 지금 저장되어 있는 썸네일 주소
let editFileUrl = null;        // 지금 저장되어 있는 첨부 파일 주소

function showCurrent(boxId, url, onRemove) {
  const box = $(boxId);
  box.innerHTML = '';
  const safe = safeUrl(url);
  if (!safe) {
    box.append(el('span', 'hint', '지금은 없음'));
    return;
  }
  const link = el('a', '', '지금 파일 보기');
  link.href = safe;
  link.target = '_blank';
  link.rel = 'noopener';
  box.append(link, button('빼기', 'btn btn-small btn-danger', onRemove));
}

function refreshCurrentFiles() {
  showCurrent('pj-thumbnail-current', editThumbnailUrl, () => {
    editThumbnailUrl = null;
    refreshCurrentFiles();
  });
  showCurrent('pj-file-current', editFileUrl, () => {
    editFileUrl = null;
    refreshCurrentFiles();
  });
}

function openEditor(project) {
  editing = project || {};
  $('pj-editor-title').textContent = project ? `카드 수정: ${project.title}` : '카드 추가';
  $('pj-number').value = editing.number || '';
  $('pj-category').value = editing.category || '';
  $('pj-title').value = editing.title || '';
  $('pj-description').value = editing.description || '';
  $('pj-tags').value = (editing.tags || []).join(', ');
  $('pj-thumbnail').value = '';
  $('pj-file').value = '';
  editThumbnailUrl = editing.thumbnail_url || null;
  editFileUrl = editing.file_url || null;
  refreshCurrentFiles();
  showMsg('pj-msg', '', false);
  $('pj-editor').classList.remove('hidden');
  $('pj-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('pj-title').focus({ preventScroll: true });
}

function closeEditor() {
  editing = null;
  $('pj-editor').classList.add('hidden');
}

function watchFileInput(inputId, allowed) {
  $(inputId).addEventListener('change', () => {
    const problem = checkFile($(inputId).files[0], allowed);
    if (problem) {
      showMsg('pj-msg', problem, true);
      $(inputId).value = '';
    } else {
      showMsg('pj-msg', '', false);
    }
  });
}
watchFileInput('pj-thumbnail', IMAGE_TYPES);
watchFileInput('pj-file', FILE_TYPES);

async function saveProject() {
  const title = $('pj-title').value.trim();
  if (!title) return showMsg('pj-msg', '제목을 적어 주세요.', true);

  const thumbFile = $('pj-thumbnail').files[0];
  const attachFile = $('pj-file').files[0];
  const problem = checkFile(thumbFile, IMAGE_TYPES) || checkFile(attachFile, FILE_TYPES);
  if (problem) return showMsg('pj-msg', problem, true);

  $('pj-save').disabled = true;
  showMsg('pj-msg', '저장 중…', false);
  try {
    if (thumbFile) editThumbnailUrl = await uploadFile('projects', thumbFile);
    if (attachFile) editFileUrl = await uploadFile('projects', attachFile);

    const row = {
      number: $('pj-number').value.trim(),
      category: $('pj-category').value.trim(),
      title,
      description: $('pj-description').value.trim(),
      tags: $('pj-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      thumbnail_url: editThumbnailUrl,
      file_url: editFileUrl,
    };

    if (editing && editing.id) {
      await change(`projects?id=eq.${editing.id}`, 'PATCH', row);
    } else {
      // 새 카드는 맨 뒤에
      row.sort_order = projects.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
      await change('projects', 'POST', row);
    }
    closeEditor();
    showMsg('pj-list-msg', '카드를 저장했어요. 방문자 화면을 새로고침하면 보여요.', false);
    loadAll();
  } catch (error) {
    showMsg('pj-msg', `저장하지 못했어요. (${error.message})`, true);
  } finally {
    $('pj-save').disabled = false;
  }
}

// ----- 방명록 -----
async function loadGuestbook() {
  const list = $('gb-admin-list');
  try {
    const entries = await db('resume_guestbook?select=*&order=created_at.desc');
    list.innerHTML = '';
    if (entries.length === 0) {
      list.append(el('p', 'status', '방명록 글이 없어요.'));
      return;
    }
    for (const entry of entries) {
      const row = el('div', 'row');
      const main = el('div', 'row-main');
      const head = el('p', 'card-meta');
      head.append(el('b', '', entry.nickname), formatDate(entry.created_at));
      main.append(head, el('p', '', entry.message));
      row.append(main, button('삭제', 'btn btn-small btn-danger', () => deleteGuestbook(entry)));
      list.append(row);
    }
  } catch (error) {
    showMsg('gb-msg', `방명록을 불러오지 못했어요. (${error.message})`, true);
  }
}

async function deleteGuestbook(entry) {
  if (!confirm(`${entry.nickname}님의 글을 지울까요?\n"${entry.message}"`)) return;
  try {
    await change(`resume_guestbook?id=eq.${entry.id}`, 'DELETE');
    showMsg('gb-msg', '글을 지웠어요.', false);
  } catch (error) {
    showMsg('gb-msg', `지우지 못했어요. (${error.message})`, true);
  }
  loadGuestbook();
}

// ----- 좋아요 -----
function renderLikes() {
  const list = $('lk-list');
  list.innerHTML = '';
  if (projects.length === 0) {
    list.append(el('p', 'status', '카드가 없어요.'));
    return;
  }
  for (const project of projects) {
    const count = likeCounts[project.id] || 0;
    const row = el('div', 'row');
    const main = el('div', 'row-main');
    const meta = el('p', 'card-meta');
    meta.append(el('b', '', project.number), project.category);
    main.append(meta, el('strong', '', project.title));
    const reset = button('좋아요 초기화', 'btn btn-small btn-danger', () => resetLikes(project));
    reset.disabled = count === 0;
    row.append(main, el('span', 'row-likes', `♥ ${count}`), reset);
    list.append(row);
  }
}

async function resetLikes(project) {
  if (!confirm(`"${project.title}" 카드의 좋아요 ${likeCounts[project.id] || 0}개를 모두 지울까요?`)) return;
  try {
    await change(`likes?project_id=eq.${project.id}`, 'DELETE');
    showMsg('lk-msg', '좋아요를 초기화했어요.', false);
  } catch (error) {
    showMsg('lk-msg', `초기화하지 못했어요. (${error.message})`, true);
  }
  loadAll();
}

// ===== 버튼 연결 =====
$('login-button').addEventListener('click', login);
$('login-password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) login();
});
document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
$('pf-save').addEventListener('click', saveProfile);
$('pj-add').addEventListener('click', () => openEditor(null));
$('pj-save').addEventListener('click', saveProject);
$('pj-cancel').addEventListener('click', closeEditor);

// ===== 시작: 전에 로그인해 둔 정보가 있으면 바로 들어간다 =====
try {
  session = JSON.parse(localStorage.getItem(SESSION_KEY));
} catch {
  session = null;
}
if (session) {
  enter().catch(() => {
    clearSession();
    showView('login');
  });
} else {
  showView('login');
}
