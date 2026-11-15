# KPSS İlan Takip · Yönetim Paneli

AkyazDev'in KPSS İlan Takip uygulaması için yönetim paneli (GitHub Pages).

- Uygulamayı kullanan Google hesapları, kullandıkları sürümler, cihazlar ve ilk/son görülme zamanları
- Mağazadaki son sürüm, en düşük geçerli sürüm ve geçersiz sürümler (zorunlu güncelleme)
- Uygulamada zorunlu gösterilen duyuru

Erişim yalnızca Firestore'daki `admins/{e-posta}` listesinde olan Google hesaplarına açıktır;
kurallar `firestore.rules` dosyasındadır. `config.js` içindeki Firebase değerleri herkese açık tanımlayıcılardır.
