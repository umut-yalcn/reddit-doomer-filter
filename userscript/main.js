import { DEFAULT_SETTINGS, PostFilter } from '../core/filter.js';
import { DecisionJournal } from '../core/journal.js';
import { PersonalRuleStore } from '../core/overrides.js';
import { detectCurrentUsername, normalizeRedditUsername } from '../core/content-dom.js';

const SETTINGS_KEY = 'rdf_settings_v1';
const JOURNAL_KEY = 'rdf_journal_v1';
const PERSONAL_RULES_KEY = 'rdf_personal_rules_v1';
const SETTINGS_SCHEMA_VERSION = 5;
const V4_SUBREDDITS = [
  'universitytr',
  'teknoloji',
  'kariyer',
  'acikkaynak',
  'androidturkiye',
  'linuxturkey',
  'erpturkiye',
  'appdevtr',
];
const fallbackStorage = new Map();
let settingsMigrated = false;

function readStoredValue(key, fallback) {
  return typeof GM_getValue === 'function'
    ? GM_getValue(key, fallback)
    : fallbackStorage.get(key) ?? fallback;
}

function writeStoredValue(key, value) {
  if (typeof GM_setValue === 'function') GM_setValue(key, value);
  else fallbackStorage.set(key, value);
}

function loadSettings() {
  try {
    const raw = readStoredValue(SETTINGS_KEY, null);
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    const storedSchemaVersion = Number(parsed.settingsSchemaVersion) || 1;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    merged.threshold = Number.isFinite(Number(merged.threshold))
      ? Math.max(1, Math.min(20, Number(merged.threshold)))
      : DEFAULT_SETTINGS.threshold;
    merged.subreddits = Array.isArray(merged.subreddits)
      ? [...new Set(merged.subreddits.map((item) => String(item).trim().toLowerCase()).filter(Boolean))]
      : [...DEFAULT_SETTINGS.subreddits];
    if (storedSchemaVersion < 2 && !merged.subreddits.includes('trgamedeveloper')) {
      merged.subreddits.push('trgamedeveloper');
    }
    if (storedSchemaVersion < 4) {
      for (const subreddit of V4_SUBREDDITS) {
        if (!merged.subreddits.includes(subreddit)) merged.subreddits.push(subreddit);
      }
    }
    merged.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
    merged.filterComments = merged.filterComments !== false;
    merged.personalOverridesEnabled = merged.personalOverridesEnabled !== false;
    merged.ownUsername = normalizeRedditUsername(merged.ownUsername);
    settingsMigrated = storedSchemaVersion < SETTINGS_SCHEMA_VERSION;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  const raw = JSON.stringify(settings);
  writeStoredValue(SETTINGS_KEY, raw);
}

const settings = loadSettings();
if (settingsMigrated) {
  try {
    saveSettings(settings);
  } catch (error) {
    console.warn('[Reddit Karamsarlık Filtresi] Ayar geçişi kaydedilemedi:', error);
  }
}

function readPersonalRules() {
  return readStoredValue(PERSONAL_RULES_KEY, '[]');
}

function writePersonalRules(rules) {
  const raw = JSON.stringify(rules);
  writeStoredValue(PERSONAL_RULES_KEY, raw);
}

const personalRules = new PersonalRuleStore({
  read: readPersonalRules,
  write: writePersonalRules,
  maxRules: 100,
  onError: (error) => console.warn('[Reddit Karamsarlık Filtresi] Kişisel kural depolama hatası:', error),
});

function readJournal() {
  return readStoredValue(JOURNAL_KEY, '[]');
}

function writeJournal(entries) {
  const raw = JSON.stringify(entries);
  writeStoredValue(JOURNAL_KEY, raw);
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
new PostFilter({
  settings,
  getCurrentUsername: () => settings.ownUsername || detectCurrentUsername(document),
  onDecision: (post, result) => journal.record(post, result),
  onFeedback: (decisionId, feedback) => journal.mark(decisionId, feedback),
  matchPersonalRule: settings.personalOverridesEnabled
    ? (content) => personalRules.match(content)
    : null,
  onCreatePersonalRule: settings.personalOverridesEnabled
    ? ({ action, scope, suggestedPhrase }) => {
        const contentLabel = scope === 'comment' ? 'yorumları' : 'postları';
        const instruction = action === 'show'
          ? `Bu ifadeyi içeren ${contentLabel} daima göster:`
          : `Bu ifadeyi içeren ${contentLabel} daima gizle:`;
        const phrase = globalThis.prompt?.(
          `${instruction}\n\nİfadeyi daraltabilir veya düzeltebilirsin. Çok genel ifadeler daha fazla içeriği etkiler.`,
          suggestedPhrase,
        );
        if (phrase === null || phrase === undefined) return false;
        try {
          personalRules.add(action, phrase, scope);
          globalThis.alert?.(`Kişisel ${scope === 'comment' ? 'yorum' : 'post'} kuralı yalnız bu tarayıcıya kaydedildi.`);
          return true;
        } catch (error) {
          globalThis.alert?.(`Kural kaydedilemedi: ${error.message}`);
          return false;
        }
      }
    : null,
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

registerMenu(settings.filterComments ? 'Yorum filtresini kapat' : 'Yorum filtresini aç', () => {
  settings.filterComments = !settings.filterComments;
  saveSettings(settings);
  location.reload();
});

registerMenu(
  settings.ownUsername ? 'Kendi Reddit kullanıcı adını değiştir' : 'Kendi Reddit kullanıcı adını ayarla',
  () => {
    const detected = detectCurrentUsername(document);
    const entered = globalThis.prompt?.(
      'Kendi post ve yorumlarının filtrelenmemesi için Reddit kullanıcı adını yaz. '
      + 'Otomatik algılamaya dönmek için alanı boş bırak.',
      settings.ownUsername || detected,
    );
    if (entered === null || entered === undefined) return;
    const normalized = normalizeRedditUsername(entered);
    if (entered.trim() && !/^[a-z0-9_-]{3,20}$/i.test(normalized)) {
      globalThis.alert?.('Geçerli bir Reddit kullanıcı adı girilmedi.');
      return;
    }
    settings.ownUsername = normalized;
    saveSettings(settings);
    location.reload();
  },
);

registerMenu(
  settings.personalOverridesEnabled ? 'Kişisel kuralları kapat' : 'Kişisel kuralları aç',
  () => {
    settings.personalOverridesEnabled = !settings.personalOverridesEnabled;
    saveSettings(settings);
    location.reload();
  },
);

registerMenu(`Kişisel kuralları yönet (${personalRules.list().length})`, () => {
  const rules = personalRules.list();
  if (rules.length === 0) {
    globalThis.alert?.('Henüz kişisel göster/gizle kuralı yok.');
    return;
  }
  const lines = rules.map((rule, index) => {
    const action = rule.action === 'show' ? 'GÖSTER' : 'GİZLE';
    const scope = rule.scope === 'comment' ? 'YORUM' : 'POST';
    const phrase = rule.phrase.length > 80 ? `${rule.phrase.slice(0, 77)}...` : rule.phrase;
    return `${index + 1}. [${scope}/${action}] ${phrase}`;
  });
  const choice = globalThis.prompt?.(
    `Kişisel kurallar:\n\n${lines.join('\n')}\n\nSilmek istediğin kuralın numarasını yaz. İptal için boş bırak.`,
    '',
  );
  if (!choice?.trim()) return;
  const index = Number(choice.trim()) - 1;
  if (!Number.isInteger(index) || !rules[index]) {
    globalThis.alert?.('Geçerli bir kural numarası girilmedi.');
    return;
  }
  if (!globalThis.confirm?.(`“${rules[index].phrase}” kuralı silinsin mi?`)) return;
  try {
    personalRules.remove(rules[index].id);
    location.reload();
  } catch (error) {
    globalThis.alert?.(`Kural silinemedi: ${error.message}`);
  }
});

registerMenu(`Kişisel kuralları indir (${personalRules.list().length})`, () => {
  const raw = JSON.stringify(personalRules.exportPayload(), null, 2);
  const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `reddit-karamsarlik-kisisel-kurallar-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

registerMenu('Kişisel kuralları içe aktar', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 256 * 1024) {
      globalThis.alert?.('Kural dosyası 256 KB sınırını aşıyor.');
      return;
    }
    try {
      const result = personalRules.importPayload(await file.text());
      globalThis.alert?.(`${result.imported} kural içe aktarıldı. Toplam ${result.total} kural var.`);
      location.reload();
    } catch (error) {
      globalThis.alert?.(`Kurallar içe aktarılamadı: ${error.message}`);
    }
  }, { once: true });
  input.click();
});

registerMenu('Kişisel kuralları sıfırla', () => {
  const count = personalRules.list().length;
  if (count === 0) {
    globalThis.alert?.('Silinecek kişisel kural yok.');
    return;
  }
  if (!globalThis.confirm?.(`${count} kişisel kuralın tamamı silinsin mi?`)) return;
  try {
    personalRules.clear();
    location.reload();
  } catch (error) {
    globalThis.alert?.(`Kurallar silinemedi: ${error.message}`);
  }
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

registerMenu('Karar günlüğünü sıfırla', () => {
  const count = journal.list().length;
  if (count === 0) {
    globalThis.alert?.('Silinecek karar kaydı yok.');
    return;
  }
  if (!globalThis.confirm?.(`${count} yerel karar kaydının tamamı silinsin mi?`)) return;
  try {
    journal.clear();
    journal.flush();
    globalThis.alert?.('Yerel karar günlüğü silindi.');
  } catch (error) {
    globalThis.alert?.(`Karar günlüğü silinemedi: ${error.message}`);
  }
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
