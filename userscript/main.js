import { DEFAULT_SETTINGS, PostFilter } from '../core/filter.js';
import { DecisionJournal } from '../core/journal.js';

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

const journal = new DecisionJournal({ read: readJournal, write: writeJournal, maxEntries: 500 });
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
