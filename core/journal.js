import { normalizeTurkish } from './normalize.js';

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

/** Tarayıcıda tutulan, boyutu sınırlı ve aynı postu tekilleştiren karar günlüğü. */
export class DecisionJournal {
  constructor({ read = () => [], write = () => {}, now = () => new Date(), maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    this.read = read;
    this.write = write;
    this.now = now;
    this.maxEntries = Math.max(1, Number(maxEntries) || DEFAULT_MAX_ENTRIES);
  }

  list() {
    return parseEntries(this.read());
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
    const entries = this.list();
    const existingIndex = entries.findIndex((entry) => entry.id === fingerprint);
    const previous = existingIndex >= 0 ? entries.splice(existingIndex, 1)[0] : null;

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
      feedback: previous?.feedback ?? null,
      firstSeenAt: previous?.firstSeenAt ?? timestamp,
      lastSeenAt: timestamp,
      occurrences: (Number(previous?.occurrences) || 0) + 1,
    };

    entries.push(entry);
    this.write(entries.slice(-this.maxEntries));
    return entry.id;
  }

  mark(id, feedback) {
    if (!VALID_FEEDBACK.has(feedback)) return false;
    const entries = this.list();
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return false;
    entry.feedback = feedback;
    entry.feedbackAt = this.now().toISOString();
    this.write(entries);
    return true;
  }

  exportPayload() {
    const entries = this.list();
    return {
      schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      entryCount: entries.length,
      entries,
    };
  }
}

export const journalTesting = { hashText, parseEntries };
