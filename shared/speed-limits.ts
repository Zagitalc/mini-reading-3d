export const STANDARD_LIMITS = ['20', '30', '40', '50', '60', '70', 'NSL'] as const;
export function speedLimit(value: unknown): string | undefined {
 const s = String(value ?? '').trim();
 if (['national', 'GB:nsl_single', 'GB:nsl_dual', 'GB:nsl_motorway'].includes(s)) return 'NSL';
 return s.match(/^(20|30|40|50|60|70)(?:\s*mph)?$/i)?.[1];
}
export function surveyedLimit(tags: Record<string, unknown>) {
 return speedLimit(tags.maxspeed) ?? String(tags.traffic_sign ?? '').match(/(?:274|670)\[(20|30|40|50|60|70)\]/)?.[1]
  ?? (/(?:^|[;,:])(?:GB:)?671(?:$|[;,])/.test(String(tags.traffic_sign ?? '')) ? 'NSL' : undefined);
}
