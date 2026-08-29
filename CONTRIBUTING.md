# Katkıda bulunma

Katkılar küçük, test edilebilir ve mevcut gizlilik sınırını koruyacak şekilde hazırlanmalıdır.

1. Ayrı bir dal oluşturun.
2. Davranış değişikliği için regresyon testi ekleyin.
3. `npm ci`, `npm run check:comments-dev` ve `npm run evaluate` komutlarını çalıştırın.
4. Pull request içinde değişikliğin amacı ve test sonucunu açıklayın.

Harici ağ isteği, telemetri, çerez erişimi, sayfa JavaScript dünyasına enjeksiyon veya
otomatik Reddit hesap eylemi ekleyen değişiklikler kabul edilmez. Test fixture'larına
kullanıcı adı, e-posta, oturum bilgisi, yerel bilgisayar yolu ya da başka kişisel veri
eklemeyin. Yeni dil örnekleri mümkün olduğunca sentetik ve kısa olmalıdır.

Kararlı dağıtım dosyası elle düzenlenmez; `npm run build` ile üretilir. `stable` dalı
yalnız testleri geçmiş kararlı sürüm yayınlanırken ilerletilir.
