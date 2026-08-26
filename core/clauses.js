/**
 * Metni karar birimine dönüştürür. Virgül bilinçli olarak sınır değildir;
 * kısa Türkçe ifadelerde özne/yüklemi gereksiz yere koparabilir.
 */
export function splitClauses(input) {
  return String(input ?? '')
    .split(/(?:[.!?;\n]+|\b(?:ama|fakat|ancak|lakin)\b)/giu)
    .map((part) => part.trim().replace(/^[,–—:\s]+|[,–—:\s]+$/g, ''))
    .filter(Boolean);
}
