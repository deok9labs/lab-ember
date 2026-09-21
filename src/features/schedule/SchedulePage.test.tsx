import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SchedulePage from './SchedulePage'
import { ScheduleApiError, type Member } from './scheduleRepository'

const testMember: Member = {
  id: 1,
  name: '김철수',
  server: '루페온',
  position: 'MT' as const,
  submitted: false,
  updatedAt: null,
}

const teamMembers: Member[] = [
  testMember,
  ...Array.from({ length: 7 }, (_, index) => ({
    ...testMember,
    id: index + 2,
    name: `팀원 ${index + 2}`,
  })),
]

function renderSchedulePage() {
  return render(
    <SchedulePage
      suppliedMembers={teamMembers}
      suppliedAvailability={[]}
      weekStart="2026-09-14"
      weekEnd="2026-09-20"
    />,
  )
}

describe('SchedulePage', () => {
  it('주간 스케줄을 표시한다', () => {
    renderSchedulePage()
    expect(
      screen.getByRole('heading', { name: '주간 일정' }),
    ).toBeInTheDocument()
    expect(screen.getByText('이번 주 일정')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '이번 주' })).toHaveAttribute('aria-selected', 'true')
  })

  it('사용자 액션으로 다음 주 조회를 요청한다', async () => {
    const user = userEvent.setup()
    const onSelectWeek = vi.fn()
    render(
      <SchedulePage
        selectedWeek="current"
        onSelectWeek={onSelectWeek}
        suppliedMembers={teamMembers}
        suppliedAvailability={[]}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
      />,
    )

    await user.click(screen.getByRole('tab', { name: '다음 주' }))

    expect(onSelectWeek).toHaveBeenCalledWith('next')
  })

  it('서버에서 받은 다음 주 날짜와 편집 문구를 표시한다', async () => {
    const user = userEvent.setup()
    render(
      <SchedulePage
        selectedWeek="next"
        suppliedMembers={teamMembers}
        suppliedAvailability={[]}
        weekStart="2026-09-21"
        weekEnd="2026-09-27"
      />,
    )

    expect(screen.getByRole('tab', { name: '다음 주' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('다음 주 일정')).toBeInTheDocument()
    expect(screen.getByText('9/21 (월)')).toBeInTheDocument()
    expect(screen.getByText('9/27 (일)')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '수정하기' })[0])
    expect(screen.getByText('30분 단위 · 다음 주 일정에 적용')).toBeInTheDocument()
  })

  it('팀원의 수정하기 버튼으로 일정 편집 화면을 연다', async () => {
    const user = userEvent.setup()
    renderSchedulePage()

    await user.click(screen.getAllByRole('button', { name: '수정하기' })[0])

    expect(
      screen.getByRole('dialog', { name: '김철수@루페온님의 가능한 시간' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '선택한 일정 저장' })).toBeInTheDocument()
  })

  it('시간 칸을 사각형 영역으로 드래그해 선택한다', async () => {
    const user = userEvent.setup()
    renderSchedulePage()
    await user.click(screen.getAllByRole('button', { name: '수정하기' })[0])

    const firstSlot = screen.getByRole('button', { name: '9/14 (월) 18:00' })
    const endSlot = screen.getByRole('button', { name: '9/15 (화) 18:30' })
    fireEvent.pointerDown(firstSlot, { button: 0 })
    fireEvent.pointerEnter(endSlot)
    fireEvent.pointerUp(endSlot)

    expect(firstSlot).toHaveAttribute('aria-pressed', 'true')
    expect(endSlot).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('4개 시간 선택')).toBeInTheDocument()
  })

  it('저장된 일정 선택과 팀 가용 인원을 표시한다', async () => {
    const user = userEvent.setup()
    render(
      <SchedulePage
        suppliedMembers={[
          { ...testMember, name: '연동 팀원', server: '테스트', submitted: true, updatedAt: '2026-09-14T10:00:00+09:00' },
          ...teamMembers.slice(1),
        ]}
        suppliedAvailability={[
          {
            memberId: 1,
            date: '2026-09-14',
            slots: ['18:00'],
          },
        ]}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
      />,
    )

    expect(screen.getByText('입력 완료')).toBeInTheDocument()
    expect(screen.getByText('2026.09.14 10:00')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '수정하기' })[0])
    expect(screen.getByRole('button', { name: '9/14 (월) 18:00' }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('24:00을 다른 시각과 동일한 슬롯으로 선택한다', async () => {
    const user = userEvent.setup()
    const onSaveSchedule = vi.fn().mockResolvedValue(undefined)
    render(
      <SchedulePage
        suppliedMembers={teamMembers}
        suppliedAvailability={[]}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
        onSaveSchedule={onSaveSchedule}
      />,
    )
    await user.click(screen.getAllByRole('button', { name: '수정하기' })[0])

    expect(screen.getByRole('button', { name: '9/14 (월) 18:00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '9/14 (월) 23:30' })).toBeInTheDocument()
    const midnightSlot = screen.getByRole('button', { name: '9/14 (월) 24:00' })
    await user.click(midnightSlot)
    expect(midnightSlot).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '선택한 일정 저장' }))
    expect(onSaveSchedule).toHaveBeenCalledWith(1, [
      { date: '2026-09-14', time: '24:00' },
    ])
    expect(screen.queryByRole('button', { name: '9/14 (월) 17:30' })).not.toBeInTheDocument()
  })

  it('선택 주의 조회 오류와 다시 시도 동작을 표시한다', async () => {
    const user = userEvent.setup()
    const onRetrySchedule = vi.fn()
    render(
      <SchedulePage
        selectedWeek="next"
        loadState="error"
        onRetrySchedule={onRetrySchedule}
      />,
    )

    expect(screen.getByText('다음 주 일정을 불러오지 못했습니다.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetrySchedule).toHaveBeenCalledOnce()
  })

  it('선택 주를 불러오는 동안 이전 주 데이터 대신 로딩 상태를 표시한다', () => {
    render(<SchedulePage selectedWeek="next" loadState="loading" />)

    expect(screen.getByText('다음 주 일정을 불러오는 중입니다.')).toBeInTheDocument()
    expect(screen.getByText('다음 주 시간표를 불러오는 중입니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정하기' })).not.toBeInTheDocument()
  })

  it('주차가 바뀐 저장 요청은 편집기를 닫고 최신 일정 확인을 안내한다', async () => {
    const user = userEvent.setup()
    const onSaveSchedule = vi.fn().mockRejectedValue(
      new ScheduleApiError('주차가 변경되었습니다.', 409, 'SCHEDULE_WEEK_MISMATCH'),
    )
    render(
      <SchedulePage
        suppliedMembers={teamMembers}
        suppliedAvailability={[]}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
        onSaveSchedule={onSaveSchedule}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: '수정하기' })[0])
    await user.click(screen.getByRole('button', { name: '선택한 일정 저장' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/주차가 변경되어 최신 일정을 다시 불러왔습니다/)).toBeInTheDocument()
  })
})
