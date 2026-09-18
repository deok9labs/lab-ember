const MEMBER_POSITIONS = ['MT', 'ST', 'MH', 'SH', 'D1', 'D2', 'D3', 'D4'] as const

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

type ScheduleApiResponse = {
  members?: unknown
  weekStart?: unknown
  weekEnd?: unknown
  availability?: unknown
}

/** 현재 주 범위와 그 주에 표시할 팀원 목록이다. */
export type CurrentSchedule = {
  weekStart: string
  weekEnd: string
  members: Member[]
  availability: AvailabilityEntry[]
}

/** 일정 저장 API에 전달하는 날짜와 30분 시간 슬롯이다. */
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

/** Aster에서 현재 주 범위와 활성 팀원 일정을 읽고 화면 계약에 맞게 검증한다. */
export async function fetchCurrentSchedule(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<CurrentSchedule> {
  const response = await fetch(scheduleUrl(apiBaseUrl), { method: 'GET', signal })
  if (!response.ok) throw new Error('일정 API 요청에 실패했습니다.')

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

/** 선택한 팀원의 현재 주 일정을 Aster의 전체 교체 API에 저장한다. */
export async function saveMemberSchedule(
  apiBaseUrl: string,
  memberId: number,
  weekStart: string,
  slots: ScheduleSlot[],
): Promise<void> {
  const response = await fetch(`${scheduleUrl(apiBaseUrl)}/members/${memberId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekStart, slots }),
  })
  if (!response.ok) throw new Error('일정 저장 API 요청에 실패했습니다.')
}

function scheduleUrl(apiBaseUrl: string) {
  // 환경 변수의 trailing slash 유무가 endpoint를 바꾸지 않도록 경계에서 한 번 정규화한다.
  return `${apiBaseUrl.replace(/\/$/, '')}/v1/schedules/current`
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
      || !entry.slots.every((slot) => typeof slot === 'string')) {
      throw new Error('일정 데이터 형식이 올바르지 않습니다.')
    }
    return { memberId: entry.memberId, date: entry.date, slots: entry.slots }
  })
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
