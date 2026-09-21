import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function scheduleResponse(week: 'current' | 'next') {
  const isCurrent = week === 'current'
  return {
    ok: true,
    json: async () => ({
      weekStart: isCurrent ? '2026-09-14' : '2026-09-21',
      weekEnd: isCurrent ? '2026-09-20' : '2026-09-27',
      members: [],
      availability: [],
    }),
  }
}

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('미리 불러온 다음 주를 즉시 표시하고 백그라운드에서 갱신한다', async () => {
    const refreshResponse = scheduleResponse('next')
    let resolveRefresh!: (response: typeof refreshResponse) => void
    const refreshPromise = new Promise<typeof refreshResponse>((resolve) => {
      resolveRefresh = resolve
    })
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (fetchMock.mock.calls.length > 2) return refreshPromise
      return Promise.resolve(scheduleResponse(url.endsWith('/next') ? 'next' : 'current'))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<App />)
    expect(await screen.findByText('9/14 (월)')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('tab', { name: '다음 주' }))

    expect(screen.getByText('9/21 (월)')).toBeInTheDocument()
    expect(screen.queryByText('다음 주 시간표를 불러오는 중입니다.')).not.toBeInTheDocument()
    expect(screen.getByText('최신 정보 확인 중')).toHaveClass('visible')
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/schedules/next',
      expect.objectContaining({ method: 'GET' }),
    )

    resolveRefresh(refreshResponse)
    await waitFor(() => expect(screen.getByText('최신 정보 확인 중')).not.toHaveClass('visible'))
  })
})
