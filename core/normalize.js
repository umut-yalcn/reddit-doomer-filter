const CHAR_MAP = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

/** Eşleştirme için Türkçe metni ASCII tabanlı, kararlı bir biçime getirir. */
export function normalizeTurkish(input) {
  let text = String(input ?? '').toLocaleLowerCase('tr-TR');

  for (const [from, to] of Object.entries(CHAR_MAP)) {
    text = text.replaceAll(from, to);
  }

  text = text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    // Kullanıcı örneklerinde görülen sansürlü/bozulmuş "yazılım" biçimleri.
    .replace(/\by\s*[*@#]+\s*zilim(?=[a-z]|\b)/g, 'yazilim')
    // Üç veya daha fazla harf uzatmasını teke indir; doğal çift harf kalır.
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

/** Yalnız başlık üzerinde kullanılmak üzere soru biçimini tespit eder. */
export function isQuestionParticle(token) {
  return /^(?:mi|mu)(?:y(?:im|um|iz|uz|di\w*|du\w*|mis\w*|mus\w*)|s(?:in|un|iniz|unuz)|l(?:er|ar))?$/.test(String(token ?? ''));
}

export function isQuestion(input) {
  const original = String(input ?? '');
  if (original.includes('?')) return true;

  const normalized = normalizeTurkish(original);
  return normalized.split(' ').some(isQuestionParticle);
}

export function tokenize(input) {
  const normalized = normalizeTurkish(input);
  return normalized ? normalized.split(' ') : [];
}
