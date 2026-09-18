import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCurrentSchedule, saveMemberSchedule } from './scheduleRepository'

describe('scheduleRepository', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Aster에서 현재 주 범위와 팀원 목록을 읽는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        weekStart: '2026-09-14',
        weekEnd: '2026-09-20',
        members: [
          { id: 2, name: '두 번째', server: '서버B', position: 'D1', submitted: true, updatedAt: '2026-09-14T10:00:00+09:00' },
          { id: 1, name: '첫 번째', server: '서버A', position: 'MT', submitted: false, updatedAt: null },
        ],
        availability: [{ memberId: 1, date: '2026-09-14', slots: ['09:00'] }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCurrentSchedule('https://example.com/api')).resolves.toEqual({
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      members: [
        { id: 1, name: '첫 번째', server: '서버A', position: 'MT', submitted: false, updatedAt: null },
        { id: 2, name: '두 번째', server: '서버B', position: 'D1', submitted: true, updatedAt: '2026-09-14T10:00:00+09:00' },
      ],
      availability: [{ memberId: 1, date: '2026-09-14', slots: ['09:00'] }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/v1/schedules/current',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('현재 주의 선택 슬롯을 Aster에 저장한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await saveMemberSchedule(
      'https://example.com/api',
      1,
      '2026-09-14',
      [{ date: '2026-09-14', time: '09:00' }],
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/v1/schedules/current/members/1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: '2026-09-14',
          slots: [{ date: '2026-09-14', time: '09:00' }],
        }),
      },
    )
  })
})
