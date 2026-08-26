/**
 * Metni karar birimine dönüştürür. Virgül bilinçli olarak sınır değildir;
 * kısa Türkçe ifadelerde özne/yüklemi gereksiz yere koparabilir.
 */
export function splitClauses(input) {
  const protectedText = String(input ?? '')
    .replace(/(?<=\d)\.(?=\d)/gu, '\uE000')
    .replace(/\b(\d+)\.(?=\s*(?:yıl|yil|ay|sene|hafta|gün|gun|kez|defa|sınıf|sinif)\p{L}*)/giu, '$1\uE000');

  return protectedText
    .split(/(?:[.!?;\n]+|\b(?:ama|fakat|ancak|lakin)\b)/giu)
    .map((part) => part.replaceAll('\uE000', '.').trim().replace(/^[,–—:\s]+|[,–—:\s]+$/g, ''))
    .filter(Boolean);
}
