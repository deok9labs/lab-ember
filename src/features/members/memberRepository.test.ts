import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCurrentSchedule,
  fetchMembers,
  saveMemberSchedule,
} from './memberRepository'

describe('fetchMembers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('API 팀원을 표시 순서대로 변환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        members: [
          { id: 'two', name: '두 번째', server: '서버B', position: 'D1', status: '', updatedAt: '' },
          { id: 'one', name: '첫 번째', server: '서버A', position: 'MT', status: '입력 완료', updatedAt: '방금 전' },
        ],
      }),
    }))

    await expect(fetchMembers('https://example.com/exec')).resolves.toEqual([
      { id: 'one', name: '첫 번째', server: '서버A', position: 'MT', status: '입력 완료', updated: '방금 전' },
      { id: 'two', name: '두 번째', server: '서버B', position: 'D1', status: '미입력', updated: '-' },
    ])
  })

  it('잘못된 API 응답을 거부한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, members: [{ name: '식별자 없음' }] }),
    }))

    await expect(fetchMembers('https://example.com/exec')).rejects.toThrow(
      '팀원 데이터 형식이 올바르지 않습니다.',
    )
  })

  it('현재 주 범위와 팀원 목록을 읽는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        weekStart: '2026-09-14',
        weekEnd: '2026-09-20',
        members: [
          { id: 'one', name: '첫 번째', server: '서버A', position: 'MT', status: '미입력', updatedAt: '' },
        ],
        availability: [{
          memberId: 'one',
          date: '2026-09-14',
          slots: ['09:00'],
          updatedAt: '2026-09-14T10:00:00+09:00',
          revision: 1,
        }],
      }),
    }))

    await expect(fetchCurrentSchedule('https://example.com/exec')).resolves.toEqual({
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      members: [
        { id: 'one', name: '첫 번째', server: '서버A', position: 'MT', status: '미입력', updated: '-' },
      ],
      availability: [{
        memberId: 'one',
        date: '2026-09-14',
        slots: ['09:00'],
        updatedAt: '2026-09-14T10:00:00+09:00',
        revision: 1,
      }],
    })
  })

  it('현재 주의 선택 슬롯을 저장한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await saveMemberSchedule(
      'https://example.com/exec',
      'member-001',
      '2026-09-14',
      [{ date: '2026-09-14', time: '09:00' }],
    )

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/exec', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    }))
  })
})
