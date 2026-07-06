# Security Checklist - Nerox Restaurant System

Bu döküman, Nerox Restaurant sisteminin güvenlik testleri için kullanılır.

## Tenant İzolasyonu Testleri

### ✅ Public QR Kullanıcı Kısıtlamaları
- [ ] Public kullanıcı ürün ekleyemez
- [ ] Public kullanıcı ürün silemez
- [ ] Public kullanıcı fiyat değiştiremez
- [ ] Public kullanıcı kategori değiştiremez
- [ ] Public kullanıcı kampanya değiştiremez
- [ ] Public kullanıcı ayar değiştiremez
- [ ] Public kullanıcı garson ekleyemez
- [ ] Public kullanıcı müşteri puanı güncelleyemez
- [ ] Public kullanıcı sadece aktif restoran verilerini görebilir
- [ ] Expired restaurant QR menü kullanamaz

### ✅ Admin İzolasyonu
- [ ] Admin sadece kendi restaurantId verilerini okuyabilir
- [ ] Admin başka restaurantId yoluna yazamaz
- [ ] Admin başka restaurantId çağrılarını göremez
- [ ] Admin başka restaurantId garsonlarını göremez

### ✅ Waiter İzolasyonu
- [ ] Waiter sadece kendi restaurantId çağrılarını görebilir
- [ ] Waiter başka restaurantId verilerine erişemez
- [ ] Waiter sadece kendi kabul ettiği çağrıyı tamamlayabilir
- [ ] Waiter ürün/kategori/ayar değiştiremez

### ✅ Customer Veri Güvenliği
- [ ] Customer kendi puanını (points) client tarafından yazamaz
- [ ] Customer totalOrders değerini değiştiremez
- [ ] Customer totalSpent değerini değiştiremez
- [ ] Yeni customer kaydı sadece points=0 ile oluşturulabilir

## API Güvenlik Testleri

### ✅ Super Admin API
- [ ] /api/super-admin/* endpointleri sadece super_admin role ile erişilebilir
- [ ] Token olmadan super-admin API'ye erişilemez
- [ ] Geçersiz token ile super-admin API'ye erişilemez
- [ ] Admin veya waiter role ile super-admin API'ye erişilemez

### ✅ Register API
- [ ] Email formatı doğrulanır
- [ ] Şifre minimum 6 karakter kontrolü yapılır
- [ ] Telefon zorunlu alan kontrolü yapılır

## Environment Güvenliği

### ✅ Secret Yönetimi
- [ ] FIREBASE_ADMIN_PRIVATE_KEY sadece server tarafında kullanılır
- [ ] NEXT_PUBLIC_ prefix'li değişkenlerde secret yok
- [ ] Production console.log'larında secret yok
- [ ] firebase-admin/auth import edilmemiş (ESM hata önleme)

## Rate Limiting

### ✅ QR Public İşlemleri
- [ ] Garson çağırma - max 3 istek / 30 saniye
- [ ] Sipariş gönderme - max 2 istek / 60 saniye
- [ ] Müşteri kayıt - max 2 istek / 120 saniye
- [ ] Kampanya kayıt - max 3 istek / 60 saniye
- [ ] Rating gönderme - max 1 istek / 300 saniye

## Audit Logging

### ✅ Loglanacak İşlemler
- [ ] Ürün ekleme/silme/güncelleme
- [ ] Fiyat değiştirme
- [ ] Kategori silme
- [ ] Garson ekleme/silme
- [ ] Kampanya oluşturma/silme
- [ ] Ayar değişikliği
- [ ] Masa silme
- [ ] Abonelik/plan değişikliği
- [ ] Hediye kullandırma

## Hata Yönetimi

### ✅ Güvenli Hata Mesajları
- [ ] UI'da stack trace gösterilmez
- [ ] Kullanıcıya sade hata mesajı gösterilir
- [ ] Detaylı hatalar sadece console/Vercel logs'ta

## Test Senaryoları

### Senaryo 1: Yetkisiz Ürün Değişikliği
```
1. QR menü sayfasını aç (public user)
2. Browser console'dan Firestore'a direkt yazma dene:
   firebase.firestore().collection('restaurants/test/products').add({...})
3. BEKLENEN: Permission denied hatası
```

### Senaryo 2: Başka Restaurant Okuma
```
1. Admin olarak giriş yap (Restaurant A)
2. Browser console'dan başka restaurant oku:
   firebase.firestore().doc('restaurants/restaurant-b').get()
3. BEKLENEN: Permission denied veya boş döküman
```

### Senaryo 3: Müşteri Puan Manipülasyonu
```
1. QR menü sayfasını aç
2. Loyalty kaydı yap
3. Browser console'dan puanı güncellemeye çalış:
   firebase.firestore().doc('restaurants/test/customers/xxx').update({points: 9999})
4. BEKLENEN: Permission denied hatası
```

### Senaryo 4: Expired Restaurant QR Menü
```
1. Firestore'da bir restaurant'ın subscriptionExpiresAt değerini geçmiş tarihe ayarla
2. O restaurant'ın QR menü sayfasını aç
3. BEKLENEN: Erişim engellenir veya uyarı gösterilir
```

### Senaryo 5: Waiter Başka Restaurant
```
1. Waiter olarak giriş yap (Restaurant A)
2. Browser console'dan başka restaurant çağrılarını oku:
   firebase.firestore().collection('restaurants/restaurant-b/calls').get()
3. BEKLENEN: Permission denied veya boş liste
```

## Düzenli Kontroller

- [ ] Haftalık: Firestore rules değişiklik kontrolü
- [ ] Haftalık: Environment variables audit
- [ ] Aylık: Bağımlılık güvenlik taraması (npm audit)
- [ ] Aylık: API endpoint yetki kontrolü

## Acil Durum Prosedürleri

### Güvenlik İhlali Tespit Edilirse
1. İlgili restaurant'ı pasif yap
2. Admin şifresini sıfırla
3. Audit logları incele
4. Firebase Console'dan geçici kural güncellemesi yap
5. İhlal kaynağını tespit et ve kapat

### Şüpheli Aktivite
1. Audit loglarını kontrol et
2. İlgili IP/kullanıcıyı izle
3. Gerekirse rate limit'leri sıkılaştır
