// KPSS İlan Takip admin panel (static; hosted on GitHub Pages).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, getFirestore, orderBy, query, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const msOf = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

if (!firebaseConfig.apiKey) {
  document.body.insertAdjacentHTML('beforeend', '<div class="center"><p class="msg">config.js içindeki Firebase ayarları boş. Kurulum rehberine bakın.</p></div>');
  throw new Error('Firebase config missing');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let users = [];
let cfg = {};
let sortKey = 'lastSeenAt';
let sortDir = -1;

$('signin').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => showLoginMsg(e.message));
$('signout').onclick = () => signOut(auth);

function showLoginMsg(t) {
  $('loginMsg').textContent = t;
  $('loginMsg').hidden = !t;
}

onAuthStateChanged(auth, async (u) => {
  $('signout').hidden = !u;
  $('who').textContent = u ? u.email : '';
  if (!u) {
    $('login').hidden = false;
    $('app').hidden = true;
    return;
  }
  const admin = await getDoc(doc(db, 'admins', u.email)).catch(() => null);
  if (!admin?.exists()) {
    showLoginMsg(`${u.email} yönetici olarak tanımlı değil. Firestore'da admins/${u.email} belgesini oluşturun.`);
    $('login').hidden = false;
    $('app').hidden = true;
    return;
  }
  $('login').hidden = true;
  $('app').hidden = false;
  await Promise.all([loadConfig(), loadUsers()]);
});

// ---------- config ----------
const F = ['latestBuild', 'minBuild', 'updateTitle', 'updateMessage', 'storeUrlAndroid', 'storeUrlIos', 'privacyUrl'];

async function loadConfig() {
  const snap = await getDoc(doc(db, 'config', 'app'));
  cfg = snap.exists() ? snap.data() : {};
  for (const k of F) $(k).value = cfg[k] ?? '';
  $('blockedBuilds').value = (cfg.blockedBuilds ?? []).join(', ');
  $('forceUpdate').checked = cfg.forceUpdate === true;
  const n = cfg.notice ?? {};
  $('noticeActive').checked = n.active === true;
  $('noticeTitle').value = n.title ?? '';
  $('noticeMessage').value = n.message ?? '';
  $('noticeUrl').value = n.url ?? '';
  $('cfgMsg').hidden = snap.exists();
  $('cfgMsg').textContent = 'Henüz ayar kaydı yok. Değerleri girip “Ayarları kaydet”e basın.';
  renderStats();
}

$('save').onclick = async () => {
  const num = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
  const message = $('noticeMessage').value.trim();
  const prevNotice = cfg.notice ?? {};
  const noticeChanged = message !== (prevNotice.message ?? '') || $('noticeTitle').value.trim() !== (prevNotice.title ?? '');
  const next = {
    latestBuild: num('latestBuild'),
    minBuild: num('minBuild'),
    blockedBuilds: $('blockedBuilds').value.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n)),
    forceUpdate: $('forceUpdate').checked,
    updateTitle: $('updateTitle').value.trim(),
    updateMessage: $('updateMessage').value.trim(),
    storeUrlAndroid: $('storeUrlAndroid').value.trim(),
    storeUrlIos: $('storeUrlIos').value.trim(),
    privacyUrl: $('privacyUrl').value.trim(),
    notice: {
      // a new id makes every user see an edited notice again
      id: noticeChanged || !prevNotice.id ? String(Date.now()) : prevNotice.id,
      active: $('noticeActive').checked && !!message,
      title: $('noticeTitle').value.trim() || 'Duyuru',
      message,
      url: $('noticeUrl').value.trim(),
    },
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.email,
  };
  if (next.minBuild > next.latestBuild && next.latestBuild) {
    if (!confirm('En düşük geçerli sürüm, mağazadaki son sürümden büyük. Bu durumda herkes engellenir. Devam edilsin mi?')) return;
  }
  $('save').disabled = true;
  try {
    await setDoc(doc(db, 'config', 'app'), next);
    $('saveState').textContent = 'Kaydedildi · ' + new Date().toLocaleTimeString('tr-TR');
    await loadConfig();
  } catch (e) {
    $('saveState').textContent = 'Kaydedilemedi: ' + e.message;
  } finally {
    $('save').disabled = false;
  }
};

// ---------- users ----------
async function loadUsers() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('lastSeenAt', 'desc')));
  users = snap.docs.map((d) => d.data());
  renderStats();
  renderUsers();
}

function buildState(b) {
  if ((cfg.blockedBuilds ?? []).includes(b) || b < (cfg.minBuild ?? 0)) return 'blocked';
  if (b < (cfg.latestBuild ?? 0)) return 'old';
  return '';
}

function renderStats() {
  const now = Date.now();
  const day = 864e5;
  const active7 = users.filter((u) => now - msOf(u.lastSeenAt) < 7 * day).length;
  const new7 = users.filter((u) => now - msOf(u.firstSeenAt) < 7 * day).length;
  const byBuild = {};
  for (const u of users) byBuild[u.appBuild] = (byBuild[u.appBuild] ?? 0) + 1;
  const blocked = users.filter((u) => buildState(u.appBuild) === 'blocked').length;
  const cells = [
    ['Toplam kullanıcı', users.length],
    ['Son 7 günde aktif', active7],
    ['Son 7 günde yeni', new7],
    ['Engelli sürümde', blocked],
    ...Object.entries(byBuild)
      .sort((a, b) => b[0] - a[0])
      .map(([b, n]) => [`Build ${b}`, n]),
  ];
  $('stats').innerHTML = cells.map(([k, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');
}

function renderUsers() {
  const q = $('q').value.trim().toLocaleLowerCase('tr');
  const val = (u, k) => (k.endsWith('At') ? msOf(u[k]) : k === 'versions' ? (u.versions ?? []).length : String(u[k] ?? '').toLocaleLowerCase('tr'));
  const list = users
    .filter((u) => !q || `${u.name} ${u.email} ${u.appVersion} ${u.appBuild} ${u.deviceModel}`.toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => (val(a, sortKey) > val(b, sortKey) ? 1 : val(a, sortKey) < val(b, sortKey) ? -1 : 0) * sortDir);
  $('rows').innerHTML = list.length
    ? list
        .map(
          (u) => `<tr>
      <td>${esc(u.name || '—')}<div class="sub">${esc(u.email)}</div></td>
      <td><span class="tag ${buildState(u.appBuild)}">${esc(u.appVersion)} (${esc(u.appBuild)})</span></td>
      <td>${(u.versions ?? []).map((v) => `<span class="tag">${esc(v)}</span>`).join('')}</td>
      <td>${esc(u.deviceModel)}<div class="sub">${esc(u.platform)} ${esc(u.osVersion)}</div></td>
      <td>${fmt(u.firstSeenAt)}</td>
      <td>${fmt(u.lastSeenAt)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="sub">Kayıt yok.</td></tr>';
}

$('q').oninput = renderUsers;
document.querySelectorAll('th[data-k]').forEach((th) => {
  th.onclick = () => {
    const k = th.dataset.k;
    sortDir = sortKey === k ? -sortDir : -1;
    sortKey = k;
    renderUsers();
  };
});

$('csv').onclick = () => {
  const head = ['name', 'email', 'appVersion', 'appBuild', 'versions', 'platform', 'osVersion', 'deviceModel', 'firstSeenAt', 'lastSeenAt'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')].concat(
    users.map((u) =>
      head.map((k) => cell(k.endsWith('At') ? fmt(u[k]) : k === 'versions' ? (u.versions ?? []).join(' | ') : u[k])).join(','),
    ),
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `kpss-ilan-kullanicilar-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};
