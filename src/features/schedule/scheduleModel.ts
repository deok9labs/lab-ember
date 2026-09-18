import type { AvailabilityEntry } from './scheduleRepository'

/** 일정 추천과 범례가 전제로 하는 고정 팀원 수다. */
export const TEAM_SIZE = 8

/** 하루 전체를 표현하는 30분 단위 슬롯이다. */
export const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2).toString().padStart(2, '0')
  return `${hour}:${index % 2 === 0 ? '00' : '30'}`
})

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
