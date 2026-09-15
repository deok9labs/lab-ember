/** 화면에 표시할 연속 추천 시간 구간이다. */
export type TimeRecommendation = {
  dayIndex: number
  startTime: string
  endTime: string
  count: number
}
/**
 * 슬롯별 가능 인원을 전원 가능과 부분 중첩 구간으로 묶는다.
 * 부분 구간은 의미가 같은 인원수의 연속 슬롯만 병합한다.
 */
export function createRecommendations(
  counts: number[][],
  totalMembers: number,
): { allMembers: TimeRecommendation[]; partial: TimeRecommendation[] } {
  if (totalMembers === 0) return { allMembers: [], partial: [] }

  const allMembers = collectRanges(
    counts,
    (count) => count === totalMembers,
  )
  const partial = collectRanges(
    counts,
    (count) => count >= 2 && count < totalMembers,
  ).sort((left, right) => (
    right.count - left.count
    || left.dayIndex - right.dayIndex
    || left.startTime.localeCompare(right.startTime)
  ))

  return { allMembers, partial }
}

function collectRanges(
  counts: number[][],
  include: (count: number) => boolean,
): TimeRecommendation[] {
  const dayCount = counts[0]?.length ?? 0
  const recommendations: TimeRecommendation[] = []

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    let startRow: number | null = null
    let rangeCount = 0

    for (let row = 0; row <= counts.length; row += 1) {
      const count = counts[row]?.[dayIndex] ?? 0
      const continuesRange = startRow !== null && include(count) && count === rangeCount

      if (continuesRange) continue
      if (startRow !== null) {
        recommendations.push({
          dayIndex,
          startTime: slotTime(startRow),
          endTime: slotTime(row),
          count: rangeCount,
        })
        startRow = null
      }
      if (include(count)) {
        startRow = row
        rangeCount = count
      }
    }
  }

  return recommendations
}

function slotTime(index: number) {
  const totalMinutes = index * 30
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
