const MEMBER_POSITIONS = ['MT', 'ST', 'MH', 'SH', 'D1', 'D2', 'D3', 'D4'] as const

/** members 시트에서 사용하는 팀 포지션과 고정 표시 순서다. */
export type MemberPosition = typeof MEMBER_POSITIONS[number]

/** 화면에 공개할 수 있는 팀원 정보다. */
export type Member = {
  id: string
  name: string
  server: string
  position: MemberPosition
  status: string
  updated: string
}

type ScheduleApiResponse = {
  ok: boolean
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

/** 한 팀원이 하루 동안 선택한 시간과 저장 버전이다. */
export type AvailabilityEntry = {
  memberId: string
  date: string
  slots: string[]
  updatedAt: string
  revision: number
}

/**
 * Apps Script에서 현재 주 범위와 활성 팀원 일정을 읽고 화면 계약에 맞게 검증한다.
 * 스프레드시트의 예기치 않은 값이 렌더링 계층까지 전파되지 않도록 필수 필드를 확인한다.
 */
export async function fetchCurrentSchedule(
  endpoint: string,
  signal?: AbortSignal,
): Promise<CurrentSchedule> {
  const url = new URL(endpoint)
  url.searchParams.set('action', 'schedule')

  const response = await fetch(url, { method: 'GET', signal })
  if (!response.ok) throw new Error('일정 API 요청에 실패했습니다.')

  const body = await response.json() as ScheduleApiResponse
  if (!body.ok
    || typeof body.weekStart !== 'string'
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

/** 선택한 팀원의 현재 주 일정을 Apps Script에 저장한다. */
export async function saveMemberSchedule(
  endpoint: string,
  memberId: string,
  weekStart: string,
  slots: ScheduleSlot[],
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    // Apps Script는 OPTIONS를 처리하지 않으므로 CORS preflight가 없는 단순 요청으로 전송한다.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveSchedule', memberId, weekStart, slots }),
  })
  if (!response.ok) throw new Error('일정 저장 API 요청에 실패했습니다.')

  const body = await response.json() as { ok?: unknown }
  if (body.ok !== true) throw new Error('일정을 저장하지 못했습니다.')
}

function parseMembers(values: unknown[]): Member[] {
  return values.map((value) => {
    if (!isMemberRecord(value)) {
      throw new Error('팀원 데이터 형식이 올바르지 않습니다.')
    }

    return {
      id: value.id,
      name: value.name,
      server: value.server,
      position: value.position,
      status: value.status || '미입력',
      updated: value.updatedAt || '-',
    }
  }).sort((left, right) => (
    MEMBER_POSITIONS.indexOf(left.position) - MEMBER_POSITIONS.indexOf(right.position)
  ))
}

function parseAvailability(values: unknown[]): AvailabilityEntry[] {
  return values.map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('일정 데이터 형식이 올바르지 않습니다.')
    }
    const entry = value as Record<string, unknown>
    if (typeof entry.memberId !== 'string'
      || typeof entry.date !== 'string'
      || !Array.isArray(entry.slots)
      || !entry.slots.every((slot) => typeof slot === 'string')
      || typeof entry.updatedAt !== 'string'
      || typeof entry.revision !== 'number') {
      throw new Error('일정 데이터 형식이 올바르지 않습니다.')
    }
    return {
      memberId: entry.memberId,
      date: entry.date,
      slots: entry.slots,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
    }
  })
}

function isMemberRecord(value: unknown): value is {
  id: string
  name: string
  server: string
  position: MemberPosition
  status: string
  updatedAt: string
} {
  if (!value || typeof value !== 'object') return false
  const member = value as Record<string, unknown>
  return typeof member.id === 'string'
    && typeof member.name === 'string'
    && typeof member.server === 'string'
    && member.server.trim().length > 0
    && typeof member.position === 'string'
    && MEMBER_POSITIONS.includes(member.position as MemberPosition)
    && typeof member.status === 'string'
    && typeof member.updatedAt === 'string'
}
