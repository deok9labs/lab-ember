import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import SchedulePage from './SchedulePage'

const testMember = {
  id: 'test-1',
  name: '김철수',
  server: '루페온',
  position: 'MT' as const,
  status: '미입력',
  updated: '-',
}

function renderSchedulePage() {
  return render(
    <SchedulePage
      suppliedMembers={[testMember]}
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

    const firstSlot = screen.getByRole('button', { name: '9/14 (월) 00:00' })
    const endSlot = screen.getByRole('button', { name: '9/15 (화) 00:30' })
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
          { id: 'one', name: '연동 팀원', server: '테스트', position: 'MT', status: '미입력', updated: '-' },
        ]}
        suppliedAvailability={[
          {
            memberId: 'one',
            date: '2026-09-14',
            slots: ['09:00'],
            updatedAt: '2026-09-14T10:00:00+09:00',
            revision: 1,
          },
        ]}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
      />,
    )

    expect(screen.getByText('입력 완료')).toBeInTheDocument()
    expect(screen.getByText('2026.09.14 10:00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '수정하기' }))
    expect(screen.getByRole('button', { name: '9/14 (월) 09:00' }))
      .toHaveAttribute('aria-pressed', 'true')
  })
})
