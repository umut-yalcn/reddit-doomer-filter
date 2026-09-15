# Reddit Doomer Filter

[![CI](https://github.com/umut-yalcn/reddit-doomer-filter/actions/workflows/ci.yml/badge.svg)](https://github.com/umut-yalcn/reddit-doomer-filter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Türkçe mühendislik subredditlerindeki doomer postlarını ve yorumlarını tarayıcıda gizleyen userscript.

Bu bağımsız topluluk projesi Reddit tarafından geliştirilmemiş, onaylanmamış veya desteklenmemiştir. Reddit ve subreddit adları ilgili sahiplerine aittir.

Hedef topluluklar:

- r/CodingTR
- r/TurkDev
- r/EngineeringTR
- r/TrGameDeveloper
- r/UniversityTR
- r/teknoloji
- r/Kariyer
- r/acikkaynak
- r/AndroidTurkiye
- r/LinuxTurkey
- r/ERPTurkiye
- r/AppDevTR

## Nasıl çalışır?

- Başlık ve gövde ayrı ayrı incelenir. Türkçe çekim ve yazım farklılıkları tanınır; karar, tüm metnin toplamından değil en güçlü cümleden verilir.
- Puanı eşik değerini aşan içerik silinmez, gizlenir. Gizleme nedeni ve **Göster** düğmesi görünür. Geçici olarak açılan içerik **Tekrar gizle** ile yeniden kapatılabilir.
- Filtre hata verirse içerik görünür bırakılır.

- Yorumlar bağımsız olarak filtrelenir. Gizlenen yorumun yalnızca kendi metni kapanır; alt yanıtları görünür kalır. Yorum filtresi menüden ayrı olarak açılıp kapatılabilir.

- Betiği kullanan Reddit hesabının kendi post ve yorumları otomatik olarak filtrelenmez ve karar günlüğüne yazılmaz. Hesap adı modern ve old Reddit’ten algılanır; gerekirse menüden elle girilebilir. Elle girilen kullanıcı adı yalnız tarayıcıda saklanır.

- Kişisel kurallar isteğe bağlıdır:
  - **Daima göster** ve **Benzer yorumları daima göster**, seçilen içeriği tekrar gizlememek için yerel kural oluşturur.
  - Kalibrasyon modunda **Daima gizle** seçenekleri kullanılabilir.
  - Post ve yorum kuralları birbirinden bağımsızdır. Birden fazla kural eşleşirse en uzun ifade, eşitlikte en son eklenen kural kullanılır.

- Varsayılan puan eşiği 4’tür. Soru başlıkları varsayılan olarak korunmaz; istenirse soru koruması açılabilir. Bu durumda yalnız başlık puanı yarıya indirilir, gövde puanı değişmez.

## Gizleme bildirimi ve geri alma seçenekleri

Filtrelenen postlarda gizleme nedeni ve üç seçenek gösterilir:

- **Göster:** İçeriği yalnızca o an için açar.
- **Daima göster:** Benzer içeriği tekrar gizlememek üzere yerel bir kişisel kural oluşturur.
- **Yanlış gizlendi:** Kararı yanlış pozitif olarak işaretler ve içeriği geri getirir.

Postlar; örneğin “mesleki pişmanlık/tükenmişlik” veya “iş bulamama/iş yokluğu” gibi gerekçelerle gizlenebilir.

![Post gizleme bildirimi - mesleki pişmanlık](docs/screenshots/hidden-post-career.png)

![Post gizleme bildirimi - iş bulamama](docs/screenshots/hidden-post-job-search.png)

Yorumlarda benzer bir arayüz bulunur. **Benzer yorumları daima göster** seçeneği, aynı türdeki yorumlar için yerel bir kişisel gösterme kuralı oluşturur.

![Yorum gizleme bildirimi - piyasa daralması](docs/screenshots/hidden-comment-market.png)

## Kurulum

Güncel kararlı sürüm `0.5.2`'dir.

1. Tampermonkey’yi kurun.
2. [Kararlı userscript dosyasını açın](https://raw.githubusercontent.com/umut-yalcn/reddit-doomer-filter/stable/dist/reddit-doom-filter.user.js).
3. İzinleri inceleyip kurulumu onaylayın.
4. Reddit sayfasını yenileyin.

Kararlı betik yalnızca `stable` dalından güncellenir. `main` dalındaki geliştirme
değişiklikleri otomatik olarak dağıtılmaz.

Eski `0.4.1-expanded-dev` sürümünü kullanıyorsanız, kişisel kurallarınızı önce
dışa aktarın. Kararlı sürümü kurduktan sonra kuralları içe aktarabilir ve DEV
sürümünü kapatabilirsiniz. Karar günlüğü analiz için indirilebilir ancak kararlı
sürüme içe aktarılmaz.

Geliştirme sürümü oluşturmak için:

```bash
npm run build:comments-dev
```

Oluşturulan dosya `dist/reddit-doom-filter.comments-dev.user.js` konumunda bulunur.
Bu dosyada otomatik güncelleme adresi yoktur ve dosya repoda takip edilmez.

Userscript menüsünden:

- Filtreyi açıp kapatabilirsiniz.
- Soru koruması, debug ve kalibrasyon modlarını değiştirebilirsiniz.
- Yorum filtresini bağımsız açıp kapatabilirsiniz.
- Reddit kullanıcı adınızı ayarlayabilirsiniz.
- Kişisel kuralları ve karar günlüğünü yönetebilirsiniz.
- Her subreddit filtresini ayrı ayrı açıp kapatabilirsiniz.

## Kalibrasyon ve geri bildirim

Filtre en fazla 500 post/yorum kararını yalnızca tarayıcıda saklar. Aynı içerik
tekrar işlendiğinde yeni kayıt yerine mevcut kayıt güncellenir.

Kişisel göster/gizle kuralları en fazla 100 kayıtla sınırlıdır ve yalnızca yerel
userscript deposunda tutulur.

Gizlenen içeriklerde:

- **Yanlış gizlendi** içeriği geri getirir ve geri bildirim kaydeder.
- Kalibrasyon modunda **Gizlenmeliydi** seçeneği kullanılabilir.
- **Karar günlüğünü indir** kararları yerel JSON dosyasına aktarır.

İndirilen günlük; Reddit metni, subreddit bilgisi, zaman damgası ve kullanıcı geri
bildirimi içerebilir. Paylaşmadan önce dosyayı kontrol edip kişisel veya üçüncü
taraf bilgilerini temizleyin.

Geri bildirim içeriğin ve kararın imzasına bağlıdır. İçerik veya karar değişirse
eski etiket yeni karara aktarılmaz. Kayıtlar kısa aralıklarla toplu yazılır.

## Geliştirme

Kaynak kodu test etmek için Node.js `22.22.2`, `24.15.0` veya `26+` gerekir.
Hazır userscript’i çalıştırmak için Node.js gerekmez.

```bash
npm install
npm test
npm run evaluate
npm run build
npm run check
npm run check:comments-dev
npm run benchmark:ci
```

- `core/`: normalizasyon, puanlama, DOM çıkarımı, filtreleme, kurallar ve günlük.
- `corpus/`: yüksek güvenli negatif örnekler.
- `userscript/main.js`: ayarlar ve userscript başlangıcı.
- `test/`: birim, DOM ve dinamik feed testleri.
- `dist/`: kurulabilir üretim userscript’i.

`npm run evaluate` örnek corpus’u ölçer. `npm run check` test, build, sözdizimi,
sürüm ve dist doğrulamalarını çalıştırır. `npm run benchmark:ci` performans
gerilemelerini kontrol eder.

`npm run check:comments-dev`, üretim betiğinden ayrı geliştirme paketini de
doğrular. Benchmark sonucu gerçek tarayıcı performansının yerine geçmez; yalnızca
belirgin yavaşlamaları yakalamaya yarar.

## Gizlilik ve kapsam

- Reddit API veya harici scraping servisi kullanılmaz.
- Reddit DOM’u tarayıcıda yerel olarak değerlendirilir.
- Yalnızca güncelleme denetimi için GitHub’daki `stable` dosyasına erişilir.
- Çalışma zamanı Reddit içeriği, kullanıcı bilgisi veya tarama geçmişi dışarı gönderilmez.
- Kullanıcı adı, karar günlüğü ve kişisel kurallar yalnızca yerel depoda tutulur.
- Depolama API’si kullanılamazsa veriler yalnızca o çalıştırma sırasında bellekte tutulur.
- Betik Reddit hesabında engelleme, silme veya moderasyon işlemi yapmaz.
- Bu sürüm yalnızca Türkçe içerik için tasarlanmıştır.

## Bilinen sınırlar

- Reddit DOM yapısı değişirse seçicilerin güncellenmesi gerekebilir.
- Türkçe doğal dil kuralları her bağlamı kesin olarak anlayamaz.
- Puan ağırlıkları daha geniş bir kontrol grubuyla yeniden kalibre edilebilir.
- Reddit veya userscript yöneticisi değişiklikleri kurulum akışını etkileyebilir.
