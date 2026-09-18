const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** API의 날짜 전용 문자열을 timezone 영향 없이 계산하기 위한 UTC Date로 변환한다. */
export function parseDate(dateText: string) {
  const [year, month, day] = dateText.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** 날짜 전용 문자열에 일수를 더하고 같은 형식으로 반환한다. */
export function addDays(dateText: string, days: number) {
  const date = parseDate(dateText)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formatKoreanDate(dateText: string) {
  const date = parseDate(dateText)
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${WEEKDAYS[date.getUTCDay()]})`
}

export function createWeekDayLabels(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = parseDate(addDays(weekStart, index))
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()} (${WEEKDAYS[date.getUTCDay()]})`
  })
}

export function getCurrentWeekStart() {
  const today = getTodayInKorea()
  const daysSinceMonday = (parseDate(today).getUTCDay() + 6) % 7
  return addDays(today, -daysSinceMonday)
}

export function getRemainingDays(weekEnd: string) {
  const difference = parseDate(weekEnd).getTime() - parseDate(getTodayInKorea()).getTime()
  return Math.max(0, Math.ceil(difference / 86_400_000))
}

export function formatUpdatedAt(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}.${values.month.padStart(2, '0')}.${values.day.padStart(2, '0')} ${values.hour}:${values.minute}`
}

export function getDayName(dayLabel: string) {
  return dayLabel.match(/\(([^)]+)\)/)?.[1] ?? dayLabel
}

function getTodayInKorea() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}
