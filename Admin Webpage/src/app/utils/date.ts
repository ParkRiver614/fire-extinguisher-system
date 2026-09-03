const HAS_TIMEZONE = /Z$|[+-]\d{2}:?\d{2}$/;

// 백엔드가 UTC datetime을 타임존 표시(Z) 없이 내려주는 경우가 있어서,
// 표시가 없으면 UTC로 간주하고 파싱한다 (없으면 브라우저가 로컬 시간으로 오인해 시각이 어긋남).
export function parseServerDate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  return new Date(HAS_TIMEZONE.test(value) ? value : `${value}Z`);
}
