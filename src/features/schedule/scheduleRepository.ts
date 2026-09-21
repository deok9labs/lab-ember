const MEMBER_POSITIONS = ['MT', 'ST', 'MH', 'SH', 'D1', 'D2', 'D3', 'D4'] as const
const FIRST_SLOT_MINUTE = 18 * 60
const LAST_BOUNDARY_MINUTE = 24 * 60

/** Aster API가 지원하는 서버 기준 상대 주차다. */
export type ScheduleWeek = 'current' | 'next'

/** Aster에서 사용하는 팀 포지션과 화면의 고정 표시 순서다. */
export type MemberPosition = typeof MEMBER_POSITIONS[number]

/** 화면에 공개할 수 있는 팀원 정보다. */
export type Member = {
  id: number
  name: string
  server: string
  position: MemberPosition
  submitted: boolean
  updatedAt: string | null
}

/** 선택한 주 범위와 그 주에 표시할 팀원 및 가용 시간이다. */
export type WeeklySchedule = {
  weekStart: string
  weekEnd: string
  members: Member[]
  availability: AvailabilityEntry[]
}

/** 화면에서 선택하는 날짜별 30분 슬롯이다. */
export type ScheduleSlot = {
  date: string
  time: string
}

/** 한 팀원이 하루 동안 선택한 시간 목록이다. */
export type AvailabilityEntry = {
  memberId: number
  date: string
  slots: string[]
}

type ScheduleApiResponse = {
  members?: unknown
  weekStart?: unknown
  weekEnd?: unknown
  availability?: unknown
}

type AvailabilityRangeRequest = {
  date: string
  startTime: string
  endTime: string
}

/** HTTP 상태와 Aster 오류 코드를 보존해 화면이 복구 방법을 선택할 수 있게 한다. */
export class ScheduleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ScheduleApiError'
  }
}

/** 선택한 주의 범위, 팀원과 가용 시간을 읽고 화면 계약으로 변환한다. */
export async function fetchSchedule(
  apiBaseUrl: string,
  scheduleWeek: ScheduleWeek,
  signal?: AbortSignal,
): Promise<WeeklySchedule> {
  const response = await fetch(scheduleUrl(apiBaseUrl, scheduleWeek), { method: 'GET', signal })
  if (!response.ok) throw await createApiError(response, '일정 API 요청에 실패했습니다.')

  const body = await response.json() as ScheduleApiResponse
  // TypeScript type은 network 응답을 보장하지 않으므로 UI 경계에 진입하기 전에 필수 구조를 검증한다.
  if (typeof body.weekStart !== 'string'
    || typeof body.weekEnd !== 'string'
    || !Array.isArray(body.members)
    || !Array.isArray(body.availability)) {
    throw new Error('일정 API 응답 형식이 올바르지 않습니다.')
  }

  return {
    weekStart: body.weekStart,
    weekEnd: body.weekEnd,
    members: parseMembers(body.members),
    availability: parseAvailability(body.availability),
  }
}

/** 선택한 팀원의 선택 주 일정을 Aster의 전체 교체 API에 저장한다. */
export async function saveMemberSchedule(
  apiBaseUrl: string,
  scheduleWeek: ScheduleWeek,
  memberId: number,
  expectedWeekStart: string,
  slots: ScheduleSlot[],
): Promise<void> {
  const response = await fetch(`${scheduleUrl(apiBaseUrl, scheduleWeek)}/members/${memberId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedWeekStart,
      ranges: slotsToRanges(slots),
    }),
  })
  if (!response.ok) throw await createApiError(response, '일정 저장 API 요청에 실패했습니다.')
}

function scheduleUrl(apiBaseUrl: string, scheduleWeek: ScheduleWeek) {
  // 환경 변수의 trailing slash 유무가 endpoint를 바꾸지 않도록 경계에서 한 번 정규화한다.
  return `${apiBaseUrl.replace(/\/$/, '')}/v1/schedules/${scheduleWeek}`
}

function parseMembers(values: unknown[]): Member[] {
  return values.map((value) => {
    if (!isMemberRecord(value)) throw new Error('팀원 데이터 형식이 올바르지 않습니다.')

    return {
      id: value.id,
      name: value.name,
      server: value.server,
      position: value.position,
      submitted: value.submitted,
      updatedAt: value.updatedAt,
    }
  // API 반환 순서와 관계없이 업무상 고정된 파티 구성 순서로 화면을 유지한다.
  }).sort((left, right) => (
    MEMBER_POSITIONS.indexOf(left.position) - MEMBER_POSITIONS.indexOf(right.position)
  ))
}

function parseAvailability(values: unknown[]): AvailabilityEntry[] {
  return values.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('일정 데이터 형식이 올바르지 않습니다.')
    const entry = value as Record<string, unknown>
    if (typeof entry.memberId !== 'number'
      || typeof entry.date !== 'string'
      || !Array.isArray(entry.ranges)) {
      throw new Error('일정 데이터 형식이 올바르지 않습니다.')
    }

    const slots = entry.ranges.flatMap((range) => rangeToSlots(range))
    return { memberId: entry.memberId, date: entry.date, slots: [...new Set(slots)].sort() }
  })
}

function rangeToSlots(value: unknown): string[] {
  if (!value || typeof value !== 'object') throw new Error('일정 범위 형식이 올바르지 않습니다.')
  const range = value as Record<string, unknown>
  if (typeof range.startTime !== 'string' || typeof range.endTime !== 'string') {
    throw new Error('일정 범위 형식이 올바르지 않습니다.')
  }

  const start = parseScheduleMinute(range.startTime)
  const end = parseScheduleMinute(range.endTime)
  if (start < FIRST_SLOT_MINUTE || start >= LAST_BOUNDARY_MINUTE || end > LAST_BOUNDARY_MINUTE || start >= end) {
    throw new Error('일정 범위가 허용 시간을 벗어났습니다.')
  }

  const slots: string[] = []
  for (let minute = start; minute < end; minute += 30) slots.push(formatScheduleMinute(minute))
  return slots
}

function slotsToRanges(slots: ScheduleSlot[]): AvailabilityRangeRequest[] {
  const minutesByDate = new Map<string, number[]>()
  for (const slot of slots) {
    const minute = parseScheduleMinute(slot.time)
    if (minute < FIRST_SLOT_MINUTE || minute >= LAST_BOUNDARY_MINUTE) {
      throw new Error('선택 가능한 일정은 18:00부터 23:30까지입니다.')
    }
    const minutes = minutesByDate.get(slot.date) ?? []
    minutes.push(minute)
    minutesByDate.set(slot.date, minutes)
  }

  return [...minutesByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([date, values]) => {
      const minutes = [...new Set(values)].sort((left, right) => left - right)
      const ranges: AvailabilityRangeRequest[] = []
      let start = minutes[0]
      let previous = start

      for (const minute of minutes.slice(1)) {
        if (minute !== previous + 30) {
          ranges.push(toRange(date, start, previous + 30))
          start = minute
        }
        previous = minute
      }
      if (start !== undefined) ranges.push(toRange(date, start, previous + 30))
      return ranges
    })
}

function toRange(date: string, start: number, end: number): AvailabilityRangeRequest {
  return {
    date,
    startTime: formatScheduleMinute(start),
    endTime: formatScheduleMinute(end),
  }
}

function parseScheduleMinute(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('일정 시간 형식이 올바르지 않습니다.')
  const hour = Number(match[1])
  const minute = Number(match[2])
  if ((minute !== 0 && minute !== 30) || hour > 24 || (hour === 24 && minute !== 0)) {
    throw new Error('일정 시간 형식이 올바르지 않습니다.')
  }
  return (hour * 60) + minute
}

function formatScheduleMinute(value: number) {
  const hour = Math.floor(value / 60).toString().padStart(2, '0')
  const minute = (value % 60).toString().padStart(2, '0')
  return `${hour}:${minute}`
}

async function createApiError(response: Response, fallbackMessage: string) {
  let code: string | undefined
  let message = fallbackMessage
  try {
    const body = await response.json() as { code?: unknown; message?: unknown }
    if (typeof body.code === 'string') code = body.code
    if (typeof body.message === 'string') message = body.message
  } catch {
    // 오류 응답에 JSON 본문이 없어도 HTTP 상태를 보존해 상위 계층이 처리할 수 있다.
  }
  return new ScheduleApiError(message, response.status, code)
}

function isMemberRecord(value: unknown): value is {
  id: number
  name: string
  server: string
  position: MemberPosition
  submitted: boolean
  updatedAt: string | null
} {
  if (!value || typeof value !== 'object') return false
  const member = value as Record<string, unknown>
  return typeof member.id === 'number'
    && typeof member.name === 'string'
    && typeof member.server === 'string'
    && member.server.trim().length > 0
    && typeof member.position === 'string'
    && MEMBER_POSITIONS.includes(member.position as MemberPosition)
    && typeof member.submitted === 'boolean'
    && (typeof member.updatedAt === 'string' || member.updatedAt === null)
}
