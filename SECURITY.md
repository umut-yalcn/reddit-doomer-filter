# Güvenlik politikası

## Desteklenen sürüm

Yalnız en güncel kararlı sürüm güvenlik düzeltmeleri alır.

## Güvenlik bildirimi

Bir güvenlik açığı bulursanız hassas ayrıntıları public Issue içine yazmayın. GitHub
reposundaki **Security → Report a vulnerability** kanalını kullanın. Bu seçenek henüz
görünmüyorsa ayrıntı vermeden bir Issue açıp güvenli iletişim kanalı isteyin.

Bildirimde mümkünse etkilenen sürümü, tekrar üretme koşullarını ve beklenen etkiyi
belirtin. Reddit çerezi, oturum bilgisi, kullanıcı adı, karar günlüğü veya başka kişisel
veri eklemeyin.

## Güvenlik sınırı

Userscript yalnız tarayıcının yüklediği Reddit DOM'unu yerel olarak değerlendirir.
Reddit API'sine veya üçüncü taraf sunucuya içerik göndermez ve hesap eylemi yapmaz.
Kararlı paket yalnız `stable` dalından güncellenir; geliştirme paketi otomatik
güncelleme adresi taşımaz.
