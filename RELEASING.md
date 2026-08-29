# Kararlı sürüm yayınlama

Bu belge `main`, `stable`, Git etiketi ve GitHub release varlığının aynı doğrulanmış
çıktıyı göstermesi için izlenecek süreci tanımlar. Yayınlanmış bir sürüm yerinde
değiştirilmez; düzeltme gerekiyorsa yeni bir yama sürümü hazırlanır.

## 1. Yerel ön kontrol

1. Çalışma ağacının temiz olduğunu doğrulayın: `git status --short`.
2. `package.json` sürümünü ve `CHANGELOG.md` kaydını güncelleyin.
3. `npm ci` çalıştırın.
4. `npm run check:comments-dev`, `npm run evaluate`, `npm run benchmark:ci` ve
   `npm audit --audit-level=high` komutlarını çalıştırın.
5. `dist/reddit-doom-filter.user.js` içindeki `@version` değerinin paket sürümüyle
   aynı olduğunu doğrulayın.
6. Production dosyasının SHA-256 değerini kaydedin.

## 2. Main doğrulaması

1. Değişiklikleri `main` dalına gönderin.
2. Desteklenen iki Node sürümündeki CI işlerinin aynı commit için geçtiğini
   doğrulayın.
3. CI tamamlanmadan `stable` dalını ilerletmeyin.

## 3. Stable ve etiket

1. `stable` dalını yalnız testleri geçen release commitine fast-forward edin.
2. `stable`, `main` release commiti ve yeni sürüm etiketinin aynı commit kimliğine
   çözüldüğünü kontrol edin.
3. `stable` CI sonucunun başarılı olmasını bekleyin.
4. Etiketi yeniden kullanmayın veya force-push ile taşımayın.

## 4. GitHub release

1. Production `dist/reddit-doom-filter.user.js` dosyasını release asset'i olarak
   yükleyin; DEV paketini yüklemeyin.
2. GitHub'ın asset için bildirdiği SHA-256 özetiyle yerel özeti karşılaştırın.
3. Release'in taslak veya prerelease olmadığını doğrulayın.
4. `stable` üzerinden alınan dosyanın SHA-256 değerini aynı asset ile yeniden
   karşılaştırın.

## 5. Eski sürüm geçişi

`0.5.0` ve önceki sürümlerde kararlı `@updateURL` bulunmadığı için release notunda
bu kullanıcıların yeni kararlı betiği bir kez elle kurması gerektiğini açıkça
belirtin. Yeni kurulumun metadata bloğunda hem `@updateURL` hem `@downloadURL`
kontrol edilmelidir.

## 6. Yayın sonrası değişiklik ilkesi

Yayın asset'i, etiketi veya release metni davranış değiştirecek biçimde sessizce
yenilenmez. Hata bulunursa sürüm numarası artırılmış yeni bir release hazırlanır;
önceki release geçmiş kayıt olarak korunur.
