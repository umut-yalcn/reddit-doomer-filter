import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePost } from '../core/scorer.js';

const hidden = (title, body = '', options = {}) =>
  scorePost({ title, body }, options).hidden;

test('kesin karamsar soru başlıklarını varsayılan olarak gizler', () => {
  assert.equal(hidden('Yazılım bitti mi?'), true);
  assert.equal(hidden('Bilgisayar mühendisliği gerçekten bitmiş mi?'), true);
  assert.equal(hidden('Sektör öldü mü, yurt dışı imkânları bitti mi?'), true);
});

test('soru eki kalıbı kırmaz ancak tek kişisel kaygı eşik altında kalabilir', () => {
  const result = scorePost({ title: 'Mezun olunca işsiz mi kalacağım?', body: '' });
  assert.equal(result.hidden, false);
  assert.ok(result.score > 0);
});

test('aynı alandaki açık çürütme karamsar iddiayı etkisizleştirir', () => {
  assert.equal(hidden('Yazılım bitti mi? Bence bu söylem saçmalık.'), false);
  assert.equal(hidden('Yazılım bitti', 'Bence bu söylem saçmalık, sektör gayet iyi.'), false);
  assert.equal(hidden('Sektör bitti demek gerçekçi değil.'), false);
  assert.equal(hidden('Yazılım bitti diyenler yanılıyor.'), false);
});

test('karşıt sözcük yönü yanlışsa karamsarlığı iptal etmez', () => {
  assert.equal(hidden('Bu sektörde iş bulmak gerçekçi değil.'), true);
  assert.equal(hidden('İş bulmanın kolay olduğunu söyleyenler yanılıyor.'), true);
});

test('başlıktaki soru gövdedeki karamsarlığı indirmez', () => {
  assert.equal(
    hidden('Ne yapmalıyım?', 'Sektör bitti. Aylardır işsizim. CENG\'in geleceği yok.'),
    true,
  );
});

test('soru koruması yalnız başlık puanına uygulanır', () => {
  assert.equal(hidden('Yazılım bitti mi?', '', { protectQuestions: true }), false);
  assert.equal(hidden('Sektör öldü mü acaba', '', { protectQuestions: true }), false);
  assert.equal(
    hidden('Ne yapmalıyım?', 'Sektör bitti.', { protectQuestions: true }),
    true,
  );
});

test('yönlendirme, AI iş kaybı ve junior kıyımı güçlü sinyaldir', () => {
  assert.equal(hidden('Tıp oku dostum, CENG boş iş.'), true);
  assert.equal(hidden('AI işimizi elimizden aldı.'), true);
  assert.equal(hidden('Şirket iki yıldır bir tane junior almadı, yarısı çıkarıldı.'), true);
  assert.equal(hidden('Yapay zeka analiz mühendislerinin işini ellerinden alır mı?'), true);
  assert.equal(hidden('Analiz işlerini yapay zekanın devralması mümkün olur mu?'), true);
});

test('AI iş kaybını açıkça reddeden yeterlilik olumsuzlarını gösterir', () => {
  assert.equal(hidden('AI işimizi elimizden alamaz.'), false);
  assert.equal(hidden('Yapay zekâ mühendisin yerini alamaz.'), false);
});

test('başlıktaki iddiayı gövdenin ilk anlamlı cümleciğinde reddetmeyi tanır', () => {
  assert.equal(
    hidden('Yazılım bitti', 'Merhaba. Bence bu söylem saçmalık, sektör gayet iyi.'),
    false,
  );
  assert.equal(hidden('Yazılım bitti', 'Bu söyleme katılmıyorum.'), false);
  assert.equal(hidden('Yazılım bitti. Buna katılmıyorum.'), false);
});

test('alakasız hedefe yönelen katılmıyorum ifadesi karamsarlığı silmez', () => {
  assert.equal(hidden('Yazılım bitti, maaşların iyi olduğuna katılmıyorum.'), true);
  assert.equal(hidden('Yazılım bitti. Maaşların iyi olduğuna katılmıyorum.'), true);
});

test('kişisel ağır tükenme ve pişmanlığı yakalar', () => {
  assert.equal(hidden('İş bulamıyorum, hayattan bıktım.'), true);
  assert.equal(hidden('Pişmanım CENG seçtiğim için.'), true);
  assert.equal(hidden('Mahvetti hayatımı bu bölüm.'), true);
  assert.equal(hidden('Sanırım yanlış meslek seçmişim.'), true);
  assert.equal(hidden('Yanlış meslek seçmemişim; işimi seviyorum.'), false);
});

test('normal teknoloji ve kariyer cümlelerini gösterir', () => {
  assert.equal(hidden('Yapay zekâ ile geliştirdiğim projeyi tanıtıyorum.'), false);
  assert.equal(hidden('Bilgisayar mühendisliği dersleri hakkında önerileriniz var mı?'), false);
  assert.equal(hidden('Junior geliştirici olarak ilk işime başladım.'), false);
  assert.equal(hidden('İş bulamayınca başladığım proje şimdi günde 3.500 kişi tarafından ziyaret ediliyor.'), false);
});

test('canlı örneklerdeki uzun işsizlik ve mühendislik değersizleştirmesini yakalar', () => {
  assert.equal(hidden('Normal başlık', '8 aydır iş arayışım devam etmektedir.'), true);
  assert.equal(hidden('Normal başlık', '1. yıldır iş arayışım devam etmektedir.'), true);
  assert.equal(hidden('Normal başlık', 'İş olanakları o kadar kısıtlı ki başka alana geçiyorum.'), true);
  assert.equal(hidden('Normal başlık', 'Her türlü mühendislik pozisyonu değersizleştirilmiş.'), true);
  assert.equal(hidden('Normal başlık', 'Top 10 üniversitelerden mezun olanlar bile işsiz kalıyor.'), true);
});

test('yüksek güvenli korpus kümelerini yakalar', () => {
  const examples = [
    'Aklı olan bu tip meslekten kaçsın.',
    'Mezunsanız başka sektöre geçiş yapın.',
    'Geç tıpa, düşünme bile.',
    'Önceden ekip 120 kişiymiş, şimdi 60\'a düşürmüşler.',
    'Şirketlerin ihtiyaç duyduğu çalışan sayısı azalıyor.',
    'İki yıl tecrübeyle iş bulmak şu anki piyasada imkânsıza yakın.',
    'Altı aydır aktif şekilde iş arıyorum ama hâlâ sonuç yok.',
    'İş bulamayan milyon tane insan var.',
    'İşçi talebi yok; çoğu işsiz kalır.',
    'Ücretsiz staj yapmak için bile yer bulunmuyor.',
    'Mesleğe karşı soğudum.',
    'Çok pişman olacaksın.',
    'Hayatının hatasını yapmış olursun.',
    'Her şey boka sardı.',
    'Son zamanlarda iyice çekilmez oldu.',
  ];

  for (const example of examples) assert.equal(hidden(example), true, example);
});

test('alıntılanıp reddedilen karamsarlık ile deyimsel bırak kullanımını gizlemez', () => {
  assert.equal(
    hidden('Maaş beklentim', 'Lütfen “piyasa çok kötü, ne verirlerse kabul et” gibi yorumlar atmayın; konu o değil.'),
    false,
  );
  assert.equal(
    hidden('Hiçbir şey için geç değil', 'İstediğim okulda okumayı bırak, bir lisans bölümüne bile yerleşemedim. Ama her şey geçici; hiçbir şey için geç değil.'),
    false,
  );
  assert.equal(hidden('Bilgisayar mühendisliğini bırak, tıp oku.'), true);
});

test('ilgisiz zayıf cümlelerin puanlarını körlemesine toplamaz', () => {
  assert.equal(
    hidden('Kariyer üzerine birkaç soru', 'Piyasa bazen zor. Gelecek belirsiz. Yine de çalışmaya devam ediyorum.'),
    false,
  );
});

test('debug sonucu en güçlü cümle ve gerekçeleri döndürür', () => {
  const result = scorePost({ title: 'Normal başlık', body: 'Yazılım sektörü bitti. Başka bir şey.' });
  assert.equal(result.hidden, true);
  assert.equal(result.source, 'body');
  assert.match(result.clause, /Yazılım sektörü bitti/);
  assert.ok(result.reasons.length > 0);
});

test('yorumlarda görülen kodlama ve AI-kod devri bitiş hükümlerini yakalar', () => {
  const samples = [
    'Kodlama bitti, artık dilden bağımsızız.',
    'AI ile beraber kod yazma da bitti zaten.',
    'AI’ın çıkmasıyla kod yazma devri bitti anlamında.',
  ];
  for (const body of samples) {
    assert.equal(scorePost({ title: '', body }).hidden, true, body);
  }
});

test('kod yazma devri bitti ifadesini anlamaya çalışan açıklama sorusunu gizlemez', () => {
  const result = scorePost({ title: '', body: 'AI kod yazma devri bitti derken anlamadım ben.' });
  assert.equal(result.hidden, false);
});
