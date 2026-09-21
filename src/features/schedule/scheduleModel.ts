import type { AvailabilityEntry } from './scheduleRepository'

/** 일정 추천과 범례가 전제로 하는 고정 팀원 수다. */
export const TEAM_SIZE = 8

/** 실제로 선택하고 저장할 수 있는 18:00~23:30의 30분 시작 슬롯이다. */
export const TIME_SLOTS = Array.from({ length: 12 }, (_, index) => slotBoundary(index))

/** 선택 슬롯 뒤에 표시할 하루의 종료 경계다. */
export const SCHEDULE_END_TIME = slotBoundary(TIME_SLOTS.length)

/** 슬롯 index가 가리키는 30분 경계 시각을 반환한다. */
export function slotBoundary(index: number) {
  const totalMinutes = (18 * 60) + (index * 30)
  const hour = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
  const minute = (totalMinutes % 60).toString().padStart(2, '0')
  return `${hour}:${minute}`
}

/** API의 팀원별 일정을 시간표가 사용하는 슬롯별 가용 인원수로 변환한다. */
export function createAvailabilityCounts(
  entries: AvailabilityEntry[] | undefined,
  dayDates: string[],
) {
  if (entries === undefined) return TIME_SLOTS.map(() => dayDates.map(() => 0))

  return TIME_SLOTS.map((time) => dayDates.map((date) => (
    // 중복 slot 응답이 있어도 같은 팀원을 한 번만 집계해 가용 인원이 부풀지 않게 한다.
    new Set(
      entries
        .filter((entry) => entry.date === date && entry.slots.includes(time))
        .map((entry) => entry.memberId),
    ).size
  )))
}

/** 편집기를 열 때 한 팀원의 저장된 일정을 선택 key 집합으로 복원한다. */
export function createMemberSlotSelection(
  entries: AvailabilityEntry[] | undefined,
  memberId: number,
) {
  return new Set(
    entries
      ?.filter((entry) => entry.memberId === memberId)
      .flatMap((entry) => entry.slots.map((time) => `${entry.date}|${time}`))
      ?? [],
  )
}
