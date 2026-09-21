const MEMBER_POSITIONS = ['MT', 'ST', 'MH', 'SH', 'D1', 'D2', 'D3', 'D4'] as const
const SCHEDULE_TIME_PATTERN = /^(?:18|19|20|21|22|23):(?:00|30)$|^24:00$/

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
      slots: slots.map((slot) => {
        if (!SCHEDULE_TIME_PATTERN.test(slot.time)) {
          throw new Error('선택 가능한 일정은 18:00부터 24:00까지입니다.')
        }
        return { date: slot.date, slotTime: slot.time }
      }),
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
      || !Array.isArray(entry.slots)
      || !entry.slots.every((slot) => (
        typeof slot === 'string' && SCHEDULE_TIME_PATTERN.test(slot)
      ))) {
      throw new Error('일정 데이터 형식이 올바르지 않습니다.')
    }

    return {
      memberId: entry.memberId,
      date: entry.date,
      slots: [...new Set(entry.slots as string[])].sort(),
    }
  })
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
