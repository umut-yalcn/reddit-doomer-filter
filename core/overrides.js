import { normalizeTurkish } from './normalize.js';

export const MAX_PERSONAL_RULES = 100;
const VALID_ACTIONS = new Set(['show', 'hide']);

function hashRuleText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function parseRules(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((rule) => (
      rule
      && typeof rule === 'object'
      && VALID_ACTIONS.has(rule.action)
      && typeof rule.phrase === 'string'
      && normalizeTurkish(rule.phrase).length >= 4
    )).map((rule) => ({
      id: String(rule.id || `personal-${hashRuleText(`${rule.action}|${rule.phrase}`)}`),
      action: rule.action,
      phrase: String(rule.phrase).trim(),
      normalizedPhrase: normalizeTurkish(rule.phrase),
      createdAt: typeof rule.createdAt === 'string' ? rule.createdAt : new Date(0).toISOString(),
    }));
  } catch {
    return [];
  }
}

function fieldContains(normalizedField, normalizedPhrase) {
  if (!normalizedField || !normalizedPhrase) return false;
  return ` ${normalizedField} `.includes(` ${normalizedPhrase} `);
}

export function validatePersonalRulePhrase(phrase) {
  const normalizedPhrase = normalizeTurkish(phrase);
  if (normalizedPhrase.length < 4) {
    return { valid: false, reason: 'İfade en az 4 karakter olmalı.' };
  }
  return { valid: true, normalizedPhrase };
}

/** Başlık ve gövdeyi ayrı tutar; en özel, eşitlikte en son tercih kazanır. */
export function matchPersonalRule(post, rules) {
  const title = normalizeTurkish(post?.title);
  const body = normalizeTurkish(post?.body);
  let winner = null;

  for (let index = 0; index < (Array.isArray(rules) ? rules.length : 0); index += 1) {
    const rule = rules[index];
    if (!rule || !VALID_ACTIONS.has(rule.action)) continue;
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
  return {
    ...winner.rule,
    normalizedPhrase: winner.normalizedPhrase,
  };
}

/** Boyutu sınırlı, yalnız tarayıcıda tutulan kişisel göster/gizle kuralları. */
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
    this.rules = rules.slice(-this.maxRules);
    try {
      this.write(this.rules);
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }

  add(action, phrase) {
    if (!VALID_ACTIONS.has(action)) throw new TypeError('Kural eylemi show veya hide olmalı.');
    const validation = validatePersonalRulePhrase(phrase);
    if (!validation.valid) throw new RangeError(validation.reason);

    const cleanPhrase = String(phrase).trim();
    const createdAt = this.now().toISOString();
    const rules = this.load().filter((rule) => rule.normalizedPhrase !== validation.normalizedPhrase);
    const rule = {
      id: `personal-${hashRuleText(`${action}|${validation.normalizedPhrase}|${createdAt}`)}`,
      action,
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

  match(post) {
    return matchPersonalRule(post, this.load());
  }

  exportPayload() {
    const rules = this.list();
    return {
      schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      ruleCount: rules.length,
      rules,
    };
  }
}

export const overridesTesting = { fieldContains, hashRuleText, parseRules };
