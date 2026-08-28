import { realpath } from 'node:fs/promises';
import path from 'node:path';

export function isPathWithinRoot(root, candidate, pathApi = path) {
  const relation = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate));
  return relation === '' || (!relation.startsWith('..') && !pathApi.isAbsolute(relation));
}

export async function resolvePathWithinRoot(root, requestedPath) {
  const resolvedRoot = await realpath(path.resolve(root));
  const lexicalCandidate = path.resolve(path.join(resolvedRoot, requestedPath));
  if (!isPathWithinRoot(resolvedRoot, lexicalCandidate)) {
    throw new Error('Geçersiz yol');
  }

  const resolvedCandidate = await realpath(lexicalCandidate);
  if (!isPathWithinRoot(resolvedRoot, resolvedCandidate)) {
    throw new Error('Geçersiz gerçek yol');
  }
  return resolvedCandidate;
}
