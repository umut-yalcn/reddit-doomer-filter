import { normalizeTurkish } from './normalize.js';

export const MAX_PERSONAL_RULES = 100;
export const PERSONAL_RULE_SCHEMA_VERSION = 2;
const MAX_PHRASE_LENGTH = 500;
const VALID_ACTIONS = new Set(['show', 'hide']);
const VALID_SCOPES = new Set(['post', 'comment']);

function hashRuleText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeScope(value) {
  return VALID_SCOPES.has(value) ? value : 'post';
}

function normalizeStoredRule(rule) {
  if (!rule || typeof rule !== 'object' || !VALID_ACTIONS.has(rule.action) || typeof rule.phrase !== 'string') {
    return null;
  }
  const phrase = String(rule.phrase).trim().slice(0, MAX_PHRASE_LENGTH);
  const normalizedPhrase = normalizeTurkish(phrase);
  if (normalizedPhrase.length < 4) return null;
  if (rule.scope !== undefined && !VALID_SCOPES.has(rule.scope)) return null;
  const scope = rule.scope ?? 'post';
  return {
    id: String(rule.id || `personal-${hashRuleText(`${rule.action}|${scope}|${phrase}`)}`).slice(0, 160),
    action: rule.action,
    scope,
    phrase,
    normalizedPhrase,
    createdAt: typeof rule.createdAt === 'string' ? rule.createdAt : new Date(0).toISOString(),
  };
}

function parseRules(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredRule).filter(Boolean);
  } catch {
    return [];
  }
}

function fieldContains(normalizedField, normalizedPhrase) {
  if (!normalizedField || !normalizedPhrase) return false;
  return ` ${normalizedField} `.includes(` ${normalizedPhrase} `);
}

function ruleKey(rule) {
  return `${rule.scope}|${rule.normalizedPhrase}`;
}

export function validatePersonalRulePhrase(phrase) {
  const cleanPhrase = String(phrase ?? '').trim();
  const normalizedPhrase = normalizeTurkish(cleanPhrase);
  if (normalizedPhrase.length < 4) {
    return { valid: false, reason: 'İfade en az 4 karakter olmalı.' };
  }
  if (cleanPhrase.length > MAX_PHRASE_LENGTH) {
    return { valid: false, reason: `İfade en fazla ${MAX_PHRASE_LENGTH} karakter olmalı.` };
  }
  return { valid: true, normalizedPhrase };
}

/** Başlık ve gövdeyi ayrı tutar; yalnız aynı içerik kapsamındaki en özel kuralı döndürür. */
export function matchPersonalRule(content, rules) {
  const scope = normalizeScope(content?.kind);
  const title = normalizeTurkish(content?.title);
  const body = normalizeTurkish(content?.body);
  let winner = null;

  for (let index = 0; index < (Array.isArray(rules) ? rules.length : 0); index += 1) {
    const rule = rules[index];
    if (!rule || !VALID_ACTIONS.has(rule.action) || normalizeScope(rule.scope) !== scope) continue;
    const normalizedPhrase = typeof rule.normalizedPhrase === 'string' && rule.normalizedPhrase
      ? rule.normalizedPhrase
      : normalizeTurkish(rule.phrase);
    if (!fieldContains(title, normalizedPhrase) && !fieldContains(body, normalizedPhrase)) continue;

    const specificity = normalizedPhrase.length;
    if (!winner || specificity > winner.specificity || (specificity === winner.specificity && index > winner.index)) {
      winner = { rule, specificity, index, normalizedPhrase };
    }
  }

  if (!winner) return null;
  return { ...winner.rule, scope, normalizedPhrase: winner.normalizedPhrase };
}

/** Boyutu sınırlı, yalnız tarayıcıda tutulan post/yorum göster-gizle kuralları. */
export class PersonalRuleStore {
  constructor({
    read = () => [],
    write = () => {},
    now = () => new Date(),
    maxRules = MAX_PERSONAL_RULES,
    onError = () => {},
  } = {}) {
    this.read = read;
    this.write = write;
    this.now = now;
    this.maxRules = Math.max(1, Number(maxRules) || MAX_PERSONAL_RULES);
    this.onError = typeof onError === 'function' ? onError : () => {};
    this.rules = null;
  }

  load() {
    if (this.rules) return this.rules;
    try {
      this.rules = parseRules(this.read()).slice(-this.maxRules);
    } catch (error) {
      this.rules = [];
      this.onError(error);
    }
    return this.rules;
  }

  list() {
    return this.load().map((rule) => ({ ...rule }));
  }

  commit(rules) {
    const previous = this.rules;
    const next = rules.slice(-this.maxRules);
    try {
      this.write(next);
      this.rules = next;
    } catch (error) {
      this.rules = previous;
      this.onError(error);
      throw error;
    }
  }

  add(action, phrase, scope = 'post') {
    if (!VALID_ACTIONS.has(action)) throw new TypeError('Kural eylemi show veya hide olmalı.');
    if (!VALID_SCOPES.has(scope)) throw new TypeError('Kural kapsamı post veya comment olmalı.');
    const validation = validatePersonalRulePhrase(phrase);
    if (!validation.valid) throw new RangeError(validation.reason);

    const cleanPhrase = String(phrase).trim();
    const createdAt = this.now().toISOString();
    const key = `${scope}|${validation.normalizedPhrase}`;
    const rules = this.load().filter((rule) => ruleKey(rule) !== key);
    const rule = {
      id: `personal-${hashRuleText(`${action}|${scope}|${validation.normalizedPhrase}|${createdAt}`)}`,
      action,
      scope,
      phrase: cleanPhrase,
      normalizedPhrase: validation.normalizedPhrase,
      createdAt,
    };
    rules.push(rule);
    this.commit(rules);
    return { ...rule };
  }

  remove(id) {
    const rules = this.load();
    const next = rules.filter((rule) => rule.id !== id);
    if (next.length === rules.length) return false;
    this.commit(next);
    return true;
  }

  clear() {
    const count = this.load().length;
    if (count > 0) this.commit([]);
    return count;
  }

  match(content) {
    return matchPersonalRule(content, this.load());
  }

  importPayload(raw) {
    let payload;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      throw new TypeError('İçe aktarma JSON olarak okunamadı.');
    }
    const schemaVersion = Array.isArray(payload) ? 1 : Number(payload?.schemaVersion ?? 1);
    const sourceRules = Array.isArray(payload) ? payload : payload?.rules;
    if (!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > PERSONAL_RULE_SCHEMA_VERSION) {
      throw new RangeError('Desteklenmeyen kişisel kural şeması.');
    }
    if (!Array.isArray(sourceRules)) throw new TypeError('İçe aktarma içinde geçerli bir rules dizisi yok.');
    if (sourceRules.length > this.maxRules * 10) throw new RangeError('İçe aktarma dosyasında aşırı sayıda kural var.');

    const imported = sourceRules.map((source, index) => {
      if (!source || typeof source !== 'object' || !VALID_ACTIONS.has(source.action)) {
        throw new TypeError(`${index + 1}. kişisel kural geçersiz.`);
      }
      const scope = source.scope === undefined ? 'post' : source.scope;
      if (!VALID_SCOPES.has(scope)) throw new TypeError(`${index + 1}. kişisel kural kapsamı geçersiz.`);
      const validation = validatePersonalRulePhrase(source.phrase);
      if (!validation.valid) throw new RangeError(`${index + 1}. kişisel kural geçersiz: ${validation.reason}`);
      const phrase = String(source.phrase).trim();
      const createdAt = typeof source.createdAt === 'string' ? source.createdAt : this.now().toISOString();
      return {
        id: `personal-${hashRuleText(`${source.action}|${scope}|${validation.normalizedPhrase}|${createdAt}|${index}`)}`,
        action: source.action,
        scope,
        phrase,
        normalizedPhrase: validation.normalizedPhrase,
        createdAt,
      };
    });

    const importedKeys = new Set(imported.map(ruleKey));
    const merged = this.load().filter((rule) => !importedKeys.has(ruleKey(rule)));
    merged.push(...imported);
    this.commit(merged);
    return { imported: imported.length, total: this.list().length };
  }

  exportPayload() {
    const rules = this.list();
    return {
      schemaVersion: PERSONAL_RULE_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      ruleCount: rules.length,
      rules,
    };
  }
}

export const overridesTesting = { fieldContains, hashRuleText, normalizeStoredRule, parseRules, ruleKey };
