import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSchedule,
  saveMemberSchedule,
} from './scheduleRepository'

describe('scheduleRepository', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('선택한 주의 슬롯 응답을 24:00까지 그대로 읽는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        weekStart: '2026-09-21',
        weekEnd: '2026-09-27',
        members: [
          { id: 2, name: '두 번째', server: '서버B', position: 'D1', submitted: true, updatedAt: '2026-09-21T10:00:00+09:00' },
          { id: 1, name: '첫 번째', server: '서버A', position: 'MT', submitted: false, updatedAt: null },
        ],
        availability: [{
          memberId: 1,
          date: '2026-09-21',
          slots: ['21:30', '22:00', '24:00'],
        }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSchedule('https://example.com/api', 'next')).resolves.toEqual({
      weekStart: '2026-09-21',
      weekEnd: '2026-09-27',
      members: [
        { id: 1, name: '첫 번째', server: '서버A', position: 'MT', submitted: false, updatedAt: null },
        { id: 2, name: '두 번째', server: '서버B', position: 'D1', submitted: true, updatedAt: '2026-09-21T10:00:00+09:00' },
      ],
      availability: [{
        memberId: 1,
        date: '2026-09-21',
        slots: ['21:30', '22:00', '24:00'],
      }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/v1/schedules/next',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('선택 슬롯을 24:00까지 다음 주에 그대로 저장한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await saveMemberSchedule(
      'https://example.com/api',
      'next',
      1,
      '2026-09-21',
      [
        { date: '2026-09-21', time: '21:30' },
        { date: '2026-09-21', time: '22:00' },
        { date: '2026-09-21', time: '24:00' },
      ],
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/v1/schedules/next/members/1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedWeekStart: '2026-09-21',
          slots: [
            { date: '2026-09-21', slotTime: '21:30' },
            { date: '2026-09-21', slotTime: '22:00' },
            { date: '2026-09-21', slotTime: '24:00' },
          ],
        }),
      },
    )
  })

  it('선택을 모두 지우면 빈 슬롯 목록으로 전체 교체한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await saveMemberSchedule('https://example.com/api', 'current', 1, '2026-09-14', [])

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/v1/schedules/current/members/1',
      expect.objectContaining({
        body: JSON.stringify({ expectedWeekStart: '2026-09-14', slots: [] }),
      }),
    )
  })

  it('백엔드 오류 코드와 HTTP 상태를 보존한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'SCHEDULE_WEEK_MISMATCH', message: '주차가 변경되었습니다.' }),
    }))

    const promise = saveMemberSchedule(
      'https://example.com/api',
      'current',
      1,
      '2026-09-14',
      [],
    )

    await expect(promise).rejects.toMatchObject({
      status: 409,
      code: 'SCHEDULE_WEEK_MISMATCH',
    })
  })
})
