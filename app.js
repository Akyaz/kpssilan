// KPSS İlan Takip admin panel (static; hosted on GitHub Pages).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

if (!firebaseConfig.apiKey) {
  document.body.insertAdjacentHTML('beforeend', '<div class="center"><p class="msg">config.js içindeki Firebase ayarları boş. Kurulum rehberine bakın.</p></div>');
  throw new Error('Firebase config missing');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let cfg = {};

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
  await loadConfig();
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
