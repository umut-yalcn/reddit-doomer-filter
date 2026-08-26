import { splitClauses } from './clauses.js';
import { isQuestion, isQuestionParticle, normalizeTurkish, tokenize } from './normalize.js';

export const DEFAULT_THRESHOLD = 4;

const ADVERBS = new Set([
  'gercekten',
  'cidden',
  'artik',
  'iyice',
  'tamamen',
  'resmen',
  'neredeyse',
  'kesinlikle',
]);

function isDomainToken(token) {
  return /^(?:yazilim\w*|ceng\w*|bilgisayar\w*|muhendis\w*|sektor\w*|developer\w*|coder\w*|junior\w*|mid\w*|senior\w*|programlama\w*|bilisim\w*|bolum\w*)$/.test(token);
}

function isTerminalToken(token) {
  return /^(?:bitti\w*|bitmis\w*|bitiyor\w*|oldu|olmus\w*|oludur|batti\w*|finito|over)$/.test(token);
}

function allowedGap(tokens) {
  let questions = 0;
  let adverbs = 0;

  for (const token of tokens) {
    if (isQuestionParticle(token)) questions += 1;
    else if (ADVERBS.has(token)) adverbs += 1;
    else if (isDomainToken(token)) continue;
    else return false;
  }

  return questions <= 1 && adverbs <= 1;
}

function hasNearPair(tokens, left, right, maxDistance = 3) {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!left(tokens[i])) continue;
    for (let j = Math.max(0, i - maxDistance); j <= Math.min(tokens.length - 1, i + maxDistance); j += 1) {
      if (i === j || !right(tokens[j])) continue;
      const between = tokens.slice(Math.min(i, j) + 1, Math.max(i, j));
      if (allowedGap(between)) return true;
    }
  }
  return false;
}

function addSignal(signals, category, score, reason) {
  const previous = signals.get(category);
  if (!previous || previous.score < score) signals.set(category, { category, score, reason });
}

function hasDomain(text) {
  return tokenize(text).some(isDomainToken);
}

function scoreClausePositive(originalClause) {
  const text = normalizeTurkish(originalClause);
  const tokens = text ? text.split(' ') : [];
  const signals = new Map();
  const domain = tokens.some(isDomainToken);

  if (domain && hasNearPair(tokens, isDomainToken, isTerminalToken)) {
    addSignal(signals, 'terminal', 5, 'sektör/meslek için bitiş hükmü');
  }

  if (
    domain &&
    (/(?:geleceg\w*\s+(?:yok|kalmadi))\b/.test(text) ||
      /\byok\s+ol(?:du|mus|acak)\b/.test(text) ||
      /\bonu\s+tren\w*\s+coktan\s+kalkti\b/.test(text))
  ) {
    addSignal(signals, 'terminal', 5, 'geleceksizlik/yok oluş hükmü');
  }

  if (/\b(?:bitti\s+iste|it\s+s\s+over|its\s+over|isler\s+bitti|yazilim\s+alani\s+batti)\b/.test(text)) {
    addSignal(signals, 'terminal', 5, 'kesin bitiş/yok oluş ifadesi');
  }

  if (domain && /\b(?:olu\s+durumda|oludur|devri\s+bitti|itibari\s+bitiyor|cogu\s+bitti)\b/.test(text)) {
    addSignal(signals, 'terminal', 5, 'sektör/meslek için bitiş hükmü');
  }

  if (domain && /\b(?:bos\s+is|bir\s+ise\s+yaramiyor|kimseye\s+tavsiye\s+etmem)\b/.test(text)) {
    addSignal(signals, 'terminal', 5, 'mesleğin değersiz olduğu hükmü');
  }

  if (
    /\b(?:tip\s+(?:oku|okuyun|okumalisin)|gec\w*\s+tipa|tipa\s+(?:gec\w*|yatay\s+gecis\w*)|saglik\w*(?:\s+alan\w*)?\s+(?:gec\w*|yonel\w*|gir\w*)|bolum\w*\s+degistir\w*|sektor\w*\s+degistir\w*|(?:baska|farkli)\s+(?:bir\s+)?(?:alan|yon|sektor|meslek)\w*\s+(?:yonel\w*|gec\w*|kay\w*|yol\s+al\w*)|mavi\s+yaka\w*(?:\s+bir)?\s+ise\s+gir\w*|mavi\s+yaka\w*\s+(?:gir\w*|gec\w*)|tostcu\s+ac\w*|pastaci\s+ol\w*)\b/.test(text)
  ) {
    addSignal(signals, 'redirect', 5, 'başka bölüm/mesleğe yönlendirme');
  }


  if (
    (domain && /\b(?:okumayin|uzak\s+dur|kacsin|devam\s+etmek\s+zorunda\s+degil)\b/.test(text)) ||
    /\b(?:bolum|meslek|yazilim|muhendislik|okul)\w*\s+birak\w*\b/.test(text)
  ) {
    addSignal(signals, 'redirect', 5, 'meslekten/bölümden uzaklaşma tavsiyesi');
  }

  if (/\b(?:universiteyi\s+birakayim|sektoru\s+birak\w*|yazilimi\s+birak\w*|kpss\w*\s+gir\w*)\b/.test(text)) {
    addSignal(signals, 'redirect', 5, 'eğitim/meslek bırakma yönelimi');
  }

  if (domain && /\baklindan\s+suphe\s+ederim\b/.test(text)) {
    addSignal(signals, 'redirect', 5, 'bölüm seçimini ağır biçimde caydırma');
  }

  if (/\b(?:bu\s+tip\s+)?meslek\w*\s+kac\w*\b/.test(text)) {
    addSignal(signals, 'redirect', 5, 'meslekten kaçma tavsiyesi');
  }

  const hasAi = /\b(?:ai|yz|yapay\s+zeka\w*)\b/.test(text);
  const aiPossessiveObject = '(?:elim\\w*|elind\\w*|ellerin\\w*)';
  const aiDisplacementNegated = new RegExp(
    `\\b(?:is\\w*\\s+)?${aiPossessiveObject}\\s+(?:alm(?:iyor|ayacak|adi|az)|alam(?:iyor|ayacak|adi|az))|\\byerin\\w*\\s+(?:alm(?:iyor|ayacak|adi|az)|alam(?:iyor|ayacak|adi|az))\\b`,
  ).test(text);
  if (
    hasAi && !aiDisplacementNegated &&
    (new RegExp(`(?:is\\w*\\s+)?${aiPossessiveObject}\\s+al\\w*`).test(text) ||
      /\byerin\w*\s+al\w*/.test(text) ||
      /\bihtiyac\w*\s+kalm\w*/.test(text) ||
      /\bkod\w*\s+kendi\w*\s+yaz\w*/.test(text) ||
      /\b(?:calisan|muhendis|yazilimci)\w*\s+(?:sayisi\s+)?azal\w*/.test(text))
  ) {
    addSignal(signals, 'ai-displacement', 4, 'AI/YZ kaynaklı iş kaybı');
  }

  if (hasAi && /\b(?:vurmasi|tehdit\w*|devral\w*|daralt\w*|kucult\w*|daha\s+az\s+kisi|tek\s+kisi)\b/.test(text)) {
    addSignal(signals, 'ai-displacement', 4, 'AI/YZ kaynaklı iş gücü daralması');
  }

  if (
    /\b(?:junior\w*|senior\w*|mid\w*|calisan\w*|muhendis\w*)\b/.test(text) &&
    /\b(?:almadi\w*|alim\w*(?:\s+da)?\s+durdu|ihtiyac\w*\s+yok|cikarildi\w*|kovuldu\w*|yarisi\s+cikarildi|ekip\w*\s+(?:kuculdu|azaldi))\b/.test(text)
  ) {
    addSignal(signals, 'employment-collapse', 4, 'alım durması veya işten çıkarma');
  }


  if (/\bekip\s+\d+\s+kisi\w*\s+simdi\s+\d+\w*\s+(?:dustu|dusur\w*)\b/.test(text)) {
    addSignal(signals, 'employment-collapse', 4, 'sayısal ekip küçülmesi');
  }

  if (/\bekip\w*.{0,20}\b\d+\s+kisi\w*.{0,30}\bsimdi\s+\d+\w*.{0,12}\b(?:dustu|dusur\w*)\b/.test(text)) {
    addSignal(signals, 'employment-collapse', 4, 'sayısal ekip küçülmesi');
  }

  if (domain && /\b(?:personele|yazilimciya|calisana)\s+ihtiyac\w*\s+(?:yok|azal\w*)\b/.test(text)) {
    addSignal(signals, 'employment-collapse', 4, 'çalışan ihtiyacının azalması');
  }

  if (/\bihtiyac\s+duydug\w*\s+calisan\s+sayisi\s+azal\w*\b/.test(text)) {
    addSignal(signals, 'employment-collapse', 4, 'çalışan ihtiyacının azalması');
  }

  if (domain && /\btek\s+kisi\s+yapabiliyor\b/.test(text)) {
    addSignal(signals, 'employment-collapse', 4, 'işin tek kişiye düşmesi');
  }

  if (/\b(?:is\s+bulam(?:iyorum|adim|adik|adi|ayacagim)|is\s+yok|donus\s+(?:alamiyorum|yok)|is\s+bulmak\s+(?:cok\s+)?(?:zor|imkansiz(?:a\s+yakin)?|gercekci\s+degil)|is\s+bulmakta\s+zorlan\w*|is\s+bulabileceg\w*\s+sanmiyorum|baska\s+is\s+bulamam|is\s+bulunmuyor|torpil\w*\s+olmadan\s+is\s+bulmak\s+imkansiz)\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'iş bulamama/iş yokluğu');
  }

  if (/\b(?:basvuru\w*\s+donus\s+alamiyorum|is\s+aray\w*\s+sonuc\w*\s+yok|is\w*\s+garantisi\s+(?:bile\s+)?yok)\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'başvuru/istihdam sonucu alamama');
  }

  if (/\bis\s+bulmak\b.{0,45}\bimkansiza\s+yakin\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'iş bulmanın imkânsıza yakın olduğu hükmü');
  }

  if (/\b\d+\s+(?:aydir|yildir)\s+is\s+arayis\w*\s+devam\w*/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'uzun süren iş arayışı');
  }

  if (/\b(?:\d+|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz)\s+(?:aydir|yildir)\s+(?:aktif\s+sekilde\s+)?is\s+ariyorum.{0,30}\b(?:hala\s+)?sonuc\s+yok\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'uzun ve sonuçsuz iş arayışı');
  }

  if (/\b(?:\d+|alti|yedi|sekiz|dokuz)\s+(?:aydir|yildir)\s+(?:aktif\s+sekilde\s+)?is\s+ariyorum\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'uzun süren aktif iş arayışı');
  }

  if (/\bis\s+olanak\w*.{0,24}\bkisitli\b/.test(text)) {
    addSignal(signals, 'market', 4, 'iş olanaklarının kısıtlılığı');
  }

  if (domain && /\b(?:degersizlestiril\w*|degersizlig\w*|ayaklar\s+altina\s+alin\w*)\b/.test(text)) {
    addSignal(signals, 'market', 4, 'meslek/mühendisliğin değersizleştirilmesi');
  }

  if (/\bis\s+bulmanin\s+kolay\s+oldugunu\s+soyleyen\w*\s+yaniliyor\w*\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'iş bulmanın kolay olduğu görüşünü reddetme');
  }

  const personalJobAnxiety = /\bissiz\s+(?:mi\s+)?kal\w*/.test(text);
  if (personalJobAnxiety) {
    addSignal(signals, 'joblessness', 2, 'işsiz kalma kaygısı');
  } else if (/\bissiz(?:im|likten|\w*)\b/.test(text)) {
    addSignal(signals, 'joblessness', 3, 'işsizlik ifadesi');
  }


  if (/\bissizlikten\s+kiril\w*\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'ağır işsizlik deneyimi');
  }

  if (/\byeni\s+issizimiz\s+hayirli\s+olsun\b/.test(text)) {
    addSignal(signals, 'joblessness', 5, 'alaycı işsizlik hükmü');
  }

  if (/\bmezun\w*\s+olanlar\s+bile\s+issiz\s+(?:kaliyor|kalmis\w*)\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'mezunlar hakkında genelleyici işsizlik hükmü');
  }

  if (/\b(?:milyon\w*\s+(?:tane\s+)?insan|cogu\s+(?:mezun|insan)|mezunlar\w*)\b.{0,35}\bissiz\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'genelleyici kitlesel işsizlik hükmü');
  }

  if (/\bis\s+bulamayan\w*\s+milyon\w*(?:\s+tane)?\s+insan\b/.test(text)) {
    addSignal(signals, 'joblessness', 4, 'kitlesel iş bulamama hükmü');
  }

  if (/\byanlis\s+meslek\s+(?:sectim|sectik|secmis\w*)\b/.test(text)) {
    addSignal(signals, 'despair', 4, 'yanlış meslek seçimi pişmanlığı');
  }

  if (/\b(?:mesleg\w*\s+karsi\s+sogudum|cok\s+pisman\s+olacaksin|hayat\w*\s+hatasi\w*|her\s+sey\s+boka\s+sardi|iyice\s+cekilmez\s+oldu)\b/.test(text)) {
    addSignal(signals, 'despair', 4, 'ağır mesleki umutsuzluk/pişmanlık');
  }

  if (
    /\b(?:hayattan\s+biktim|biktim|pismanim|mahvetti|nefret\s+ediyorum|sogu\w*|tiksin\w*|tatmin\s+olmuyorum|umidi\s+kestim|hayat\s+karartan|hayatinin\s+hatasi|cekilmez\s+oldu)\b/.test(text) &&
    (domain || /\b(?:bu\s+bolum|meslek\w*|is\s+bulamiyorum|hayatimi|hayattan|biktim)\b/.test(text))
  ) {
    addSignal(signals, 'despair', 4, 'mesleki pişmanlık/tükenme');
  }

  if (/\by\s+zilim\w*\b/.test(text) && /\bnefret\s+ediyorum\b/.test(text)) {
    addSignal(signals, 'despair', 4, 'meslekten nefret');
  }

  if (
    /\b(?:piyasa|sektor)\w*\b/.test(text) &&
    /\b(?:cop|kotu|daral\w*|darbogaz\w*|cokus\w*|kiyim|doyum\w*|riskli)\b/.test(text)
  ) {
    addSignal(signals, 'market', 4, 'piyasa daralması/kötüleşmesi');
  }

  if (/\b(?:is|isci|eleman)\w*\s+talebi\s+(?:yok|az\w*)\b/.test(text)) {
    addSignal(signals, 'market', 4, 'iş gücü talebi yokluğu');
  }

  if (/\bucretsiz\s+staj\w*.{0,25}\byer\s+bulunmuyor\b/.test(text)) {
    addSignal(signals, 'market', 4, 'ücretsiz staj yeri dahi bulunamaması');
  }

  if (/\bgelecek\w*\s+(?:cok\s+)?belirsiz\b/.test(text)) {
    addSignal(signals, 'uncertainty', 2, 'gelecek belirsizliği');
  }

  if (domain && /\bgeleceg\w*\s+belirsiz\b/.test(text)) {
    addSignal(signals, 'uncertainty', 4, 'sektör geleceğinin belirsizliği');
  }

  if (/\bpiyasa\w*\s+(?:bazen\s+)?zor\b/.test(text)) {
    addSignal(signals, 'market', 2, 'zayıf piyasa kaygısı');
  }

  const reasons = [...signals.values()];
  return {
    original: originalClause,
    normalized: text,
    score: reasons.reduce((sum, signal) => sum + signal.score, 0),
    reasons,
  };
}

function isInlineRebuttal(clause) {
  const text = normalizeTurkish(clause);
  return (
    /\b(?:demek|iddia\w*)\b.{0,45}\b(?:yanlis|sacmalik|abarti|gercekci\s+degil|dogru\s+degil)\b/.test(text) ||
    /\bdiyen\w*\b.{0,30}\b(?:yaniliyor\w*|abartiyor\w*|sacmaliyor\w*)\b/.test(text) ||
    /\b(?:diyen|soyleyen)\w*\b.{0,30}\bkatilmiyorum\b/.test(text) ||
    /\b(?:soylem|iddia|gorus)\w*\b.{0,25}\bkatilmiyorum\b/.test(text) ||
    /\b(?:buna|suna)\s+katilmiyorum\b/.test(text) ||
    /\b(?:is\s+bulmak\s+zor|piyasa\s+kotu|piyasa\s+cop)\s+degil\b/.test(text) ||
    /\b(?:tip\s+oku|tipa\s+gec|bolum\w*\s+degistir)\b.{0,18}\b(?:demiyorum|onermiyorum)\b/.test(text) ||
    /\b(?:yorum|laf|soylem)\w*\s+(?:yapmayin|atmayin|etmeyin)\b/.test(text) ||
    /\bkonu\s+(?:bu|o)\s+degil\b/.test(text)
  );
}

function isReferentialRebuttal(clause) {
  const text = normalizeTurkish(clause);
  return (
    /\b(?:bu|su|boyle\s+bir)\s+(?:soylem\w*|iddia\w*|gorus\w*)\b.{0,35}\b(?:yanlis|sacmalik|abarti|gercekci\s+degil|dogru\s+degil|katilmiyorum)\b/.test(text) ||
    /^(?:bence\s+)?(?:buna|suna)\s+katilmiyorum\b/.test(text) ||
    /^(?:bence\s+)?(?:hayir|katilmiyorum|aksine|tam\s+tersine)\b/.test(text)
  );
}

function isOpeningFiller(clause) {
  const text = normalizeTurkish(clause);
  return /^(?:merhaba|selam|selamlar|arkadaslar|dostlar|herkese\s+merhaba|oncelikle)(?:\s+\w+){0,4}$/.test(text);
}

function scoreField(text, source) {
  const clauses = splitClauses(text);
  const results = clauses.map((clause) => ({ ...scoreClausePositive(clause), source, neutralized: false }));

  for (let i = 0; i < results.length; i += 1) {
    if (results[i].score <= 0) continue;
    if (isInlineRebuttal(results[i].original)) {
      results[i].neutralized = true;
      continue;
    }
    if (results[i + 1] && isReferentialRebuttal(results[i + 1].original)) {
      results[i].neutralized = true;
    }
  }

  return results;
}

/**
 * Post başlığı ve gövdesini cümlecik bazında değerlendirir.
 * Karar, ilgisiz cümlelerin toplamından değil en güçlü cümlecikten çıkar.
 */
export function scorePost(post, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : DEFAULT_THRESHOLD;
  const protectQuestions = options.protectQuestions === true;
  const title = String(post?.title ?? '');
  const body = String(post?.body ?? '');
  const titleQuestion = isQuestion(title);

  const titleResults = scoreField(title, 'title');
  const bodyResults = scoreField(body, 'body');

  const strongestTitle = titleResults
    .filter((item) => item.score > 0 && !item.neutralized)
    .sort((a, b) => b.score - a.score)[0];

  const openingBodyResults = bodyResults
    .filter((item) => !isOpeningFiller(item.original))
    .slice(0, 2);

  if (strongestTitle && openingBodyResults.some((item) => isReferentialRebuttal(item.original))) {
    strongestTitle.neutralized = true;
  }

  const candidates = [...titleResults, ...bodyResults]
    .filter((item) => item.score > 0 && !item.neutralized)
    .map((item) => ({
      ...item,
      adjustedScore:
        item.source === 'title' && protectQuestions && titleQuestion
          ? Math.round(item.score * 0.5)
          : item.score,
    }))
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  const strongest = candidates[0];
  const score = strongest?.adjustedScore ?? 0;

  return {
    hidden: score >= threshold,
    score,
    threshold,
    source: strongest?.source ?? null,
    clause: strongest?.original ?? '',
    reasons: strongest?.reasons ?? [],
    question: titleQuestion,
    details: { title: titleResults, body: bodyResults },
  };
}

export const __testing = {
  ADVERBS,
  hasDomain,
  isInlineRebuttal,
  isReferentialRebuttal,
  isOpeningFiller,
  scoreClausePositive,
};
