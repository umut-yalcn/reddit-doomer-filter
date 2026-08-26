import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePost } from '../core/scorer.js';

const examples = [
  'Yazılım bitti diyenler saçmalıyor.',
  'Sektör ölmedi, yalnızca dönüşüyor.',
  'Yapay zekâ işimizi elimizden almayacak.',
  'Yapay zekâ ile kod yazmayı öğreniyorum.',
  'Yapay zekâ kod yazıyor ama mühendisin yerini almıyor.',
  'Junior alımları durmadı, bu ay üç kişi başladık.',
  'İş bulmak zor değil, doğru hazırlanmak gerekiyor.',
  'Piyasa kötü değil, geçen aya göre hareketlendi.',
  'Tıp oku demiyorum; sevdiğin bölümü seç.',
  'CENG boş iş diyenlere katılmıyorum.',
  'Bilgisayar mühendisliğinin geleceği var.',
  'İşsiz kalmamak için portföyümü geliştiriyorum.',
  'Yazılım dünyadaki tek iş değil.',
  'Sektörün bittiği iddiası doğru değil.',
  'Yeni mezunlara ihtiyaç kalmadığı söylemi abartı.',
];

for (const example of examples) {
  test(`normal/karşıt örneği gösterir: ${example}`, () => {
    const result = scorePost({ title: example, body: '' });
    assert.equal(result.hidden, false, JSON.stringify(result, null, 2));
  });
}
