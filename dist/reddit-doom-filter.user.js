// ==UserScript==
// @name         Reddit Karamsarlık Filtresi
// @namespace    https://github.com/umut-yalcn/reddit-filter
// @version      0.2.0
// @description  Seçili Türk subredditlerinde karamsar kariyer postlarını yerel olarak gizler.
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // ---- core/normalize.js ----
  const CHAR_MAP = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
  };

  /** Eşleştirme için Türkçe metni ASCII tabanlı, kararlı bir biçime getirir. */
  function normalizeTurkish(input) {
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
  function isQuestionParticle(token) {
    return /^(?:mi|mu)(?:y(?:im|um|iz|uz|di\w*|du\w*|mis\w*|mus\w*)|s(?:in|un|iniz|unuz)|l(?:er|ar))?$/.test(String(token ?? ''));
  }

  function isQuestion(input) {
    const original = String(input ?? '');
    if (original.includes('?')) return true;

    const normalized = normalizeTurkish(original);
    return normalized.split(' ').some(isQuestionParticle);
  }

  function tokenize(input) {
    const normalized = normalizeTurkish(input);
    return normalized ? normalized.split(' ') : [];
  }


  // ---- core/journal.js ----

  const DEFAULT_MAX_ENTRIES = 500;
  const VALID_FEEDBACK = new Set(['false-positive', 'false-negative']);

  function limit(value, max) {
    return String(value ?? '').slice(0, max);
  }

  function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function parseEntries(raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
    } catch {
      return [];
    }
  }

  function retainEntries(entries, maxEntries) {
    if (entries.length <= maxEntries) return entries;

    const labeled = entries.filter((entry) => VALID_FEEDBACK.has(entry.feedback));
    const keep = new Set(labeled.slice(-maxEntries));
    const remaining = maxEntries - keep.size;
    if (remaining > 0) {
      const unlabeled = entries.filter((entry) => !VALID_FEEDBACK.has(entry.feedback));
      for (const entry of unlabeled.slice(-remaining)) keep.add(entry);
    }
    return entries.filter((entry) => keep.has(entry));
  }

  function makeDecisionFingerprint(title, body, result) {
    const reasons = Array.isArray(result?.reasons)
      ? result.reasons.slice(0, 8).map((reason) => [reason?.category, Number(reason?.score) || 0])
      : [];
    const normalized = normalizeTurkish(JSON.stringify([
      title,
      body,
      result?.hidden === true,
      Number(result?.score) || 0,
      Number(result?.threshold) || 0,
      result?.source ?? null,
      result?.clause ?? '',
      result?.question === true,
      reasons,
    ]));
    return `${hashText(normalized)}-${normalized.length}`;
  }

  /** Tarayıcıda tutulan, boyutu sınırlı ve aynı postu tekilleştiren karar günlüğü. */
  class DecisionJournal {
    constructor({
      read = () => [],
      write = () => {},
      now = () => new Date(),
      maxEntries = DEFAULT_MAX_ENTRIES,
      deferWrite = null,
      onError = () => {},
    } = {}) {
      this.read = read;
      this.write = write;
      this.now = now;
      this.maxEntries = Math.max(1, Number(maxEntries) || DEFAULT_MAX_ENTRIES);
      this.deferWrite = typeof deferWrite === 'function' ? deferWrite : null;
      this.onError = typeof onError === 'function' ? onError : () => {};
      this.entries = null;
      this.dirty = false;
      this.writeScheduled = false;
    }

    load() {
      if (this.entries) return this.entries;
      try {
        this.entries = parseEntries(this.read());
      } catch (error) {
        this.entries = [];
        this.onError(error);
      }
      return this.entries;
    }

    list() {
      return [...this.load()];
    }

    commit(entries) {
      this.entries = entries;
      this.dirty = true;
      if (!this.deferWrite) {
        this.flush();
        return;
      }
      if (this.writeScheduled) return;
      this.writeScheduled = true;
      this.deferWrite(() => {
        this.writeScheduled = false;
        try {
          this.flush();
        } catch (error) {
          this.onError(error);
        }
      });
    }

    flush() {
      if (!this.dirty) return false;
      this.write(this.load());
      this.dirty = false;
      return true;
    }

    record(post, result) {
      const subreddit = limit(post?.subreddit, 80).toLowerCase();
      const redditId = limit(post?.id, 160);
      const rawTitle = String(post?.title ?? '');
      const rawBody = String(post?.body ?? '');
      const title = limit(rawTitle, 500);
      const body = limit(rawBody, 5000);
      const identity = redditId
        ? `${subreddit}|id:${redditId}`
        : `${subreddit}|text:${rawTitle}|${rawBody}`;
      const normalizedIdentity = normalizeTurkish(identity);
      const fingerprint = `${hashText(normalizedIdentity)}-${normalizedIdentity.length}`;
      const timestamp = this.now().toISOString();
      const entries = [...this.load()];
      const existingIndex = entries.findIndex((entry) => entry.id === fingerprint);
      const previous = existingIndex >= 0 ? entries.splice(existingIndex, 1)[0] : null;
      const decisionFingerprint = makeDecisionFingerprint(title, body, result);
      const previousDecisionFingerprint = previous?.decisionFingerprint
        ?? (previous ? makeDecisionFingerprint(previous.title, previous.body, previous) : null);
      const sameDecision = previousDecisionFingerprint === decisionFingerprint;

      const entry = {
        id: fingerprint,
        redditId: redditId || null,
        subreddit,
        title,
        body,
        hidden: result?.hidden === true,
        score: Number(result?.score) || 0,
        threshold: Number(result?.threshold) || 0,
        source: limit(result?.source, 20) || null,
        clause: limit(result?.clause, 1000),
        reasons: Array.isArray(result?.reasons)
          ? result.reasons.slice(0, 8).map((reason) => ({
              category: limit(reason?.category, 80),
              score: Number(reason?.score) || 0,
              reason: limit(reason?.reason, 240),
            }))
          : [],
        question: result?.question === true,
        decisionFingerprint,
        feedback: sameDecision ? previous?.feedback ?? null : null,
        ...(sameDecision && previous?.feedbackAt ? { feedbackAt: previous.feedbackAt } : {}),
        firstSeenAt: previous?.firstSeenAt ?? timestamp,
        lastSeenAt: timestamp,
        occurrences: (Number(previous?.occurrences) || 0) + 1,
      };

      entries.push(entry);
      this.commit(retainEntries(entries, this.maxEntries));
      return entry.id;
    }

    mark(id, feedback) {
      if (!VALID_FEEDBACK.has(feedback)) return false;
      const entries = [...this.load()];
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) return false;
      entry.feedback = feedback;
      entry.feedbackAt = this.now().toISOString();
      this.commit(entries);
      return true;
    }

    exportPayload() {
      const entries = this.list();
      return {
        schemaVersion: 2,
        exportedAt: this.now().toISOString(),
        entryCount: entries.length,
        entries,
      };
    }
  }

  const journalTesting = { hashText, makeDecisionFingerprint, parseEntries, retainEntries };


  // ---- core/clauses.js ----
  /**
   * Metni karar birimine dönüştürür. Virgül bilinçli olarak sınır değildir;
   * kısa Türkçe ifadelerde özne/yüklemi gereksiz yere koparabilir.
   */
  function splitClauses(input) {
    const protectedText = String(input ?? '')
      .replace(/(?<=\d)\.(?=\d)/gu, '\uE000')
      .replace(/\b(\d+)\.(?=\s*(?:yıl|yil|ay|sene|hafta|gün|gun|kez|defa|sınıf|sinif)\p{L}*)/giu, '$1\uE000');

    return protectedText
      .split(/(?:[.!?;\n]+|\b(?:ama|fakat|ancak|lakin)\b)/giu)
      .map((part) => part.replaceAll('\uE000', '.').trim().replace(/^[,–—:\s]+|[,–—:\s]+$/g, ''))
      .filter(Boolean);
  }


  // ---- core/scorer.js ----

  const DEFAULT_THRESHOLD = 4;

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
  function scorePost(post, options = {}) {
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

  const __testing = {
    ADVERBS,
    hasDomain,
    isInlineRebuttal,
    isReferentialRebuttal,
    isOpeningFiller,
    scoreClausePositive,
  };


  // ---- core/content-dom.js ----
  const NEW_POST_SELECTOR = 'shreddit-post';
  const OLD_POST_SELECTOR = '#siteTable > .thing.link, .sitetable > .thing.link';
  const POST_SELECTOR = `${NEW_POST_SELECTOR}, ${OLD_POST_SELECTOR}`;

  function includeSelfAndDescendants(root, selector) {
    const found = [];
    if (root?.nodeType === 1 && root.matches?.(selector)) found.push(root);
    found.push(...(root?.querySelectorAll?.(selector) ?? []));
    return found;
  }

  function findPostElements(root = document) {
    return [
      ...includeSelfAndDescendants(root, NEW_POST_SELECTOR),
      ...includeSelfAndDescendants(root, OLD_POST_SELECTOR),
    ];
  }

  function findContainingPostElement(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest?.(POST_SELECTOR) ?? null;
  }

  function firstText(el, selectors) {
    for (const selector of selectors) {
      const node = el.querySelector?.(selector);
      const text = node?.textContent?.trim();
      if (text) return text;
    }
    return '';
  }

  function normalizeSubreddit(value) {
    return String(value ?? '').trim().replace(/^\/?r\//i, '').toLowerCase();
  }

  function extractPost(element) {
    const isNew = element.matches?.(NEW_POST_SELECTOR);

    const title = isNew
      ? element.getAttribute('post-title') || firstText(element, ['[slot="title"]', 'h1', 'h2', 'a[slot="title"]'])
      : firstText(element, ['p.title a.title', 'a.title']);

    const body = isNew
      ? firstText(element, [
          '[slot="text-body"]',
          '[data-post-click-location="text-body"]',
          'div[id$="-post-rtjson-content"]',
        ])
      : firstText(element, ['.expando .md', '.usertext-body .md']);

    const subreddit = normalizeSubreddit(
      isNew
        ? element.getAttribute('subreddit-prefixed-name') || element.getAttribute('subreddit-name')
        : element.getAttribute('data-subreddit'),
    );

    return {
      id: isNew
        ? element.getAttribute('post-id') || element.getAttribute('id') || ''
        : element.getAttribute('data-fullname') || element.getAttribute('id') || '',
      subreddit,
      title: title.trim(),
      body: body.trim(),
      element,
    };
  }


  // ---- core/filter.js ----

  const STYLE_ID = 'rdf-style';
  const STATE_ATTR = 'data-rdf-state';

  const DEFAULT_SETTINGS = {
    enabled: true,
    threshold: 4,
    protectQuestions: false,
    debug: false,
    calibrationMode: false,
    subreddits: ['codingtr', 'turkdev', 'engineeringtr'],
  };

  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .rdf-bar {
        display: flex;
        align-items: center;
        gap: .6rem;
        margin: .35rem 0;
        padding: .55rem .75rem;
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
        border-radius: 8px;
        font: 500 12px/1.4 system-ui, sans-serif;
        opacity: .72;
      }
      .rdf-bar__reason { flex: 1; }
      .rdf-bar button {
        border: 1px solid currentColor;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        padding: .2rem .55rem;
        cursor: pointer;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function signature(post) {
    return normalizeTurkish(`${post.subreddit}|${post.title}|${post.body}`);
  }

  class PostFilter {
    constructor({ doc = document, settings = {}, onDecision = null, onFeedback = null } = {}) {
      this.doc = doc;
      this.settings = { ...DEFAULT_SETTINGS, ...settings };
      this.settings.subreddits = [...(settings.subreddits ?? DEFAULT_SETTINGS.subreddits)].map((s) => s.toLowerCase());
      this.observer = null;
      this.pending = new Set();
      this.scheduled = false;
      this.signatures = new WeakMap();
      this.presentations = new WeakMap();
      this.onDecision = typeof onDecision === 'function' ? onDecision : null;
      this.onFeedback = typeof onFeedback === 'function' ? onFeedback : null;
    }

    start() {
      injectStyle(this.doc);
      this.processTree(this.doc);

      const Observer = this.doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
      if (!Observer) return this;

      this.observer = new Observer((records) => {
        for (const record of records) {
          if (record.type === 'childList') {
            this.enqueueNode(record.target);
            for (const node of record.addedNodes) this.enqueueNode(node);
          } else {
            this.enqueueNode(record.target);
          }
        }
        if (this.pending.size > 0) this.schedule();
      });
      this.observer.observe(this.doc.body || this.doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'post-title',
          'post-id',
          'subreddit-prefixed-name',
          'subreddit-name',
          'data-subreddit',
          'data-fullname',
          'slot',
          'data-post-click-location',
          'id',
        ],
      });
      return this;
    }

    stop() {
      this.observer?.disconnect();
      this.observer = null;
    }

    enqueueNode(node) {
      const post = findContainingPostElement(node);
      if (post) {
        this.pending.add(post);
        return;
      }

      const element = node?.nodeType === 1 ? node : node?.parentElement;
      if (element && findPostElements(element).length > 0) this.pending.add(element);
    }

    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      const win = this.doc.defaultView;
      const run = () => {
        this.scheduled = false;
        const roots = [...this.pending];
        this.pending.clear();
        for (const root of roots) {
          if (root.isConnected) this.processTree(root);
        }
      };
      if (typeof win?.requestIdleCallback === 'function') win.requestIdleCallback(run, { timeout: 250 });
      else (win?.setTimeout ?? setTimeout)(run, 40);
    }

    processTree(root) {
      if (!this.settings.enabled) return;
      injectStyle(this.doc);
      for (const element of findPostElements(root)) this.processPost(element);
    }

    processPost(element) {
      try {
        const post = extractPost(element);
        if (!post.subreddit || !this.settings.subreddits.includes(post.subreddit)) return;

        const currentSignature = signature(post);
        if (this.signatures.get(element) === currentSignature) return;
        this.signatures.set(element, currentSignature);
        this.clearPresentation(element);

        const result = scorePost(post, this.settings);
        const decisionId = this.emitDecision(post, result);
        element.setAttribute(STATE_ATTR, result.hidden ? 'hidden' : 'shown');
        if (result.hidden) this.hidePost(post, result, decisionId);
        else if (this.settings.calibrationMode) this.addShownFeedback(post, decisionId);
      } catch (error) {
        // Fail-open: filtre hatası hiçbir içeriği görünmez yapmamalı.
        element.setAttribute(STATE_ATTR, 'error');
        console.warn('[Reddit Karamsarlık Filtresi] Post değerlendirilemedi:', error);
      }
    }

    emitDecision(post, result) {
      if (!this.onDecision) return null;
      try {
        return this.onDecision({
          id: post.id,
          subreddit: post.subreddit,
          title: post.title,
          body: post.body,
        }, result) ?? null;
      } catch (error) {
        console.warn('[Reddit Karamsarlık Filtresi] Karar günlüğe yazılamadı:', error);
        return null;
      }
    }

    emitFeedback(decisionId, feedback) {
      if (!decisionId || !this.onFeedback) return false;
      try {
        return this.onFeedback(decisionId, feedback) !== false;
      } catch (error) {
        console.warn('[Reddit Karamsarlık Filtresi] Geri bildirim kaydedilemedi:', error);
        return false;
      }
    }

    clearPresentation(element) {
      const presentation = this.presentations.get(element);
      if (!presentation) return;
      if (presentation.kind === 'hidden') element.style.display = presentation.previousDisplay;
      presentation.bar.remove();
      this.presentations.delete(element);
    }

    hidePost(post, result, decisionId) {
      const { element } = post;
      const previousDisplay = element.style.display;
      element.style.display = 'none';

      const bar = this.doc.createElement('div');
      bar.className = 'rdf-bar';
      bar.setAttribute('data-rdf-for', post.id || 'unknown');

      const reason = this.doc.createElement('span');
      reason.className = 'rdf-bar__reason';
      const primaryReason = result.reasons[0]?.reason ?? 'eşik üstü içerik';
      reason.textContent = this.settings.debug
        ? `Karamsar içerik gizlendi · ${result.score} puan · ${primaryReason} · “${result.clause}”`
        : `Karamsar içerik gizlendi · ${primaryReason}`;

      const show = this.doc.createElement('button');
      show.type = 'button';
      show.textContent = 'Göster';
      show.addEventListener('click', () => {
        element.style.display = previousDisplay;
        element.setAttribute(STATE_ATTR, 'overridden');
        bar.remove();
      }, { once: true });

      bar.append(reason, show);
      if (decisionId && this.onFeedback) {
        const incorrect = this.doc.createElement('button');
        incorrect.type = 'button';
        incorrect.textContent = 'Yanlış gizlendi';
        incorrect.addEventListener('click', () => {
          if (!this.emitFeedback(decisionId, 'false-positive')) return;
          element.style.display = previousDisplay;
          element.setAttribute(STATE_ATTR, 'overridden');
          bar.remove();
        }, { once: true });
        bar.append(incorrect);
      }
      element.parentNode?.insertBefore(bar, element);
      this.presentations.set(element, { kind: 'hidden', bar, previousDisplay });
    }

    addShownFeedback(post, decisionId) {
      if (!decisionId || !post.element.parentNode) return;
      const review = this.doc.createElement('div');
      review.className = 'rdf-bar rdf-bar--review';
      review.setAttribute('data-rdf-review-for', post.id || decisionId);

      const label = this.doc.createElement('span');
      label.className = 'rdf-bar__reason';
      label.textContent = 'Kalibrasyon: Bu post görünür bırakıldı.';

      const missed = this.doc.createElement('button');
      missed.type = 'button';
      missed.textContent = 'Gizlenmeliydi';
      missed.addEventListener('click', () => {
        if (!this.emitFeedback(decisionId, 'false-negative')) return;
        missed.disabled = true;
        missed.textContent = 'Kaydedildi';
      }, { once: true });

      review.append(label, missed);
      post.element.parentNode.insertBefore(review, post.element.nextSibling);
      this.presentations.set(post.element, { kind: 'review', bar: review, previousDisplay: post.element.style.display });
    }
  }


  // ---- userscript/main.js ----

  const SETTINGS_KEY = 'rdf_settings_v1';
  const JOURNAL_KEY = 'rdf_journal_v1';

  function loadSettings() {
    try {
      const raw = typeof GM_getValue === 'function'
        ? GM_getValue(SETTINGS_KEY, null)
        : localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      merged.threshold = Number.isFinite(Number(merged.threshold))
        ? Math.max(1, Math.min(20, Number(merged.threshold)))
        : DEFAULT_SETTINGS.threshold;
      merged.subreddits = Array.isArray(merged.subreddits)
        ? [...new Set(merged.subreddits.map((item) => String(item).trim().toLowerCase()).filter(Boolean))]
        : [...DEFAULT_SETTINGS.subreddits];
      return merged;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    const raw = JSON.stringify(settings);
    if (typeof GM_setValue === 'function') GM_setValue(SETTINGS_KEY, raw);
    else localStorage.setItem(SETTINGS_KEY, raw);
  }

  const settings = loadSettings();

  function readJournal() {
    return typeof GM_getValue === 'function'
      ? GM_getValue(JOURNAL_KEY, '[]')
      : localStorage.getItem(JOURNAL_KEY) || '[]';
  }

  function writeJournal(entries) {
    const raw = JSON.stringify(entries);
    if (typeof GM_setValue === 'function') GM_setValue(JOURNAL_KEY, raw);
    else localStorage.setItem(JOURNAL_KEY, raw);
  }

  const journal = new DecisionJournal({
    read: readJournal,
    write: writeJournal,
    maxEntries: 500,
    deferWrite: (callback) => setTimeout(callback, 120),
    onError: (error) => console.warn('[Reddit Karamsarlık Filtresi] Günlük depolama hatası:', error),
  });
  globalThis.addEventListener?.('pagehide', () => {
    try {
      journal.flush();
    } catch (error) {
      console.warn('[Reddit Karamsarlık Filtresi] Bekleyen günlük yazılamadı:', error);
    }
  });
  const filter = new PostFilter({
    settings,
    onDecision: (post, result) => journal.record(post, result),
    onFeedback: (decisionId, feedback) => journal.mark(decisionId, feedback),
  }).start();

  function registerMenu(label, action) {
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(label, action);
  }

  registerMenu(settings.enabled ? 'Filtreyi kapat' : 'Filtreyi aç', () => {
    settings.enabled = !settings.enabled;
    saveSettings(settings);
    location.reload();
  });

  registerMenu(settings.protectQuestions ? 'Soru başlıklarını normal puanla' : 'Soru başlıklarını koru', () => {
    settings.protectQuestions = !settings.protectQuestions;
    saveSettings(settings);
    location.reload();
  });

  registerMenu(settings.debug ? 'Debug açıklamasını kapat' : 'Debug açıklamasını aç', () => {
    settings.debug = !settings.debug;
    saveSettings(settings);
    location.reload();
  });

  registerMenu(settings.calibrationMode ? 'Kalibrasyon düğmelerini kapat' : 'Kalibrasyon düğmelerini aç', () => {
    settings.calibrationMode = !settings.calibrationMode;
    saveSettings(settings);
    location.reload();
  });

  registerMenu(`Karar günlüğünü indir (${journal.list().length})`, () => {
    const raw = JSON.stringify(journal.exportPayload(), null, 2);
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reddit-karamsarlik-kararlari-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  for (const subreddit of DEFAULT_SETTINGS.subreddits) {
    const active = settings.subreddits.includes(subreddit);
    registerMenu(`${active ? '✓' : '○'} r/${subreddit} filtresi`, () => {
      settings.subreddits = active
        ? settings.subreddits.filter((item) => item !== subreddit)
        : [...settings.subreddits, subreddit];
      saveSettings(settings);
      location.reload();
    });
  }

  globalThis.__redditDoomFilter = filter;

})();
