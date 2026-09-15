import { useEffect, useRef, useState } from 'react'
import type {
  AvailabilityEntry,
  Member,
  ScheduleSlot,
} from '../src/features/members/memberRepository'
import { createRecommendations } from '../src/features/schedule/recommendations'

const initialMembers: Member[] = [
  { id: 'sample-1', name: '김철수', status: '입력 완료', updated: '9.15 10:24', sortOrder: 1 },
  { id: 'sample-2', name: '이영희', status: '입력 완료', updated: '9.15 09:18', sortOrder: 2 },
  { id: 'sample-3', name: '박민수', status: '입력 완료', updated: '9.14 22:11', sortOrder: 3 },
  { id: 'sample-4', name: '최지은', status: '미입력', updated: '-', sortOrder: 4 },
  { id: 'sample-5', name: '정현우', status: '입력 완료', updated: '9.15 08:36', sortOrder: 5 },
  { id: 'sample-6', name: '한소희', status: '입력 완료', updated: '9.14 23:02', sortOrder: 6 },
  { id: 'sample-7', name: '오민준', status: '입력 완료', updated: '9.15 07:51', sortOrder: 7 },
  { id: 'sample-8', name: '이수빈', status: '미입력', updated: '-', sortOrder: 8 },
]
const sampleDays = ['9/15 (월)', '9/16 (화)', '9/17 (수)', '9/18 (목)', '9/19 (금)', '9/20 (토)', '9/21 (일)']
const times = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2).toString().padStart(2, '0')
  return `${hour}:${index % 2 === 0 ? '00' : '30'}`
})

// 화면 시안용 값으로, 하루 전체에서도 업무 시간대가 상대적으로 높게 보이도록 구성한다.
const sampleAvailability = times.map((_, row) => {
  const hour = Math.floor(row / 2)
  const timeWeight = hour >= 9 && hour < 18 ? 3 : hour >= 7 && hour < 22 ? 1 : -1

  return sampleDays.map((__, column) =>
    Math.max(0, Math.min(8, 4 + timeWeight + ((row + column * 2) % 3) - (column > 4 ? 1 : 0))),
  )
})

type GridPosition = { row: number; column: number }
type DragSelection = {
  start: GridPosition
  shouldSelect: boolean
  baseSelection: Set<string>
}

type SchedulePageProps = {
  suppliedMembers?: Member[]
  memberLoadState?: 'loading' | 'ready' | 'error'
  onRetryMembers?: () => void
  weekStart?: string
  weekEnd?: string
  suppliedAvailability?: AvailabilityEntry[]
  onSaveSchedule?: (memberId: string, slots: ScheduleSlot[]) => Promise<void>
}

/** 시안 기반의 정적 주간 공용 스케줄 화면을 제공한다. */
export default function App({
  suppliedMembers,
  memberLoadState = 'ready',
  onRetryMembers,
  weekStart,
  weekEnd,
  suppliedAvailability,
  onSaveSchedule,
}: SchedulePageProps = {}) {
  const [memberUpdates, setMemberUpdates] = useState<Record<string, Partial<Member>>>({})
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [dragStart, setDragStart] = useState<GridPosition | null>(null)
  const [dragEnd, setDragEnd] = useState<GridPosition | null>(null)
  const dragSelection = useRef<DragSelection | null>(null)

  useEffect(() => {
    const stopDragging = () => {
      dragSelection.current = null
      setDragStart(null)
      setDragEnd(null)
    }

    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [])

  const days = weekStart ? createWeekDayLabels(weekStart) : sampleDays
  const dayDates = Array.from(
    { length: 7 },
    (_, index) => weekStart ? addDays(weekStart, index) : `sample-${index}`,
  )
  const members = (suppliedMembers ?? initialMembers).map((member) => {
    const savedEntries = suppliedAvailability?.filter((entry) => entry.memberId === member.id) ?? []
    const latestUpdate = savedEntries
      .map((entry) => entry.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1)
    return {
      ...member,
      ...(savedEntries.length > 0
        ? { status: '입력 완료', updated: formatUpdatedAt(latestUpdate ?? '') }
        : {}),
      ...memberUpdates[member.id],
    }
  })
  const availability = suppliedAvailability === undefined
    ? sampleAvailability
    : times.map((time) => dayDates.map((date) => (
      new Set(
        suppliedAvailability
          .filter((entry) => entry.date === date && entry.slots.includes(time))
          .map((entry) => entry.memberId),
      ).size
    )))
  const recommendations = createRecommendations(availability, members.length)
  const weekTitle = weekStart && weekEnd
    ? `${formatKoreanDate(weekStart)} ~ ${formatKoreanDate(weekEnd)}`
    : '2026년 9월 15일 (월) ~ 9월 21일 (일)'
  const remainingDays = weekEnd ? getRemainingDays(weekEnd) : 6

  const openEditor = (member: Member) => {
    setEditingMember(member)
    setSelectedSlots(new Set(
      suppliedAvailability
        ?.filter((entry) => entry.memberId === member.id)
        .flatMap((entry) => entry.slots.map((time) => `${entry.date}|${time}`))
        ?? [],
    ))
    setSaveState('idle')
  }

  const toggleSlot = (slot: string) => {
    setSelectedSlots((current) => {
      const next = new Set(current)
      if (next.has(slot)) next.delete(slot)
      else next.add(slot)
      return next
    })
  }

  const applyDragRectangle = (end: GridPosition, drag: DragSelection) => {
    const next = new Set(drag.baseSelection)
    const firstRow = Math.min(drag.start.row, end.row)
    const lastRow = Math.max(drag.start.row, end.row)
    const firstColumn = Math.min(drag.start.column, end.column)
    const lastColumn = Math.max(drag.start.column, end.column)

    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const slot = `${dayDates[column]}|${times[row]}`
        if (drag.shouldSelect) next.add(slot)
        else next.delete(slot)
      }
    }
    setSelectedSlots(next)
  }

  const startSlotDrag = (position: GridPosition) => {
    const slot = `${dayDates[position.column]}|${times[position.row]}`
    const drag = {
      start: position,
      shouldSelect: !selectedSlots.has(slot),
      baseSelection: new Set(selectedSlots),
    }
    dragSelection.current = drag
    setDragStart(position)
    setDragEnd(position)
    applyDragRectangle(position, drag)
  }

  const continueSlotDrag = (position: GridPosition) => {
    if (!dragSelection.current) return
    setDragEnd(position)
    applyDragRectangle(position, dragSelection.current)
  }

  const isInsideDragRectangle = (row: number, column: number) => {
    if (!dragStart || !dragEnd) return false
    return row >= Math.min(dragStart.row, dragEnd.row)
      && row <= Math.max(dragStart.row, dragEnd.row)
      && column >= Math.min(dragStart.column, dragEnd.column)
      && column <= Math.max(dragStart.column, dragEnd.column)
  }

  const savePreview = async () => {
    if (!editingMember) return
    setSaveState('saving')

    try {
      if (onSaveSchedule && weekStart) {
        const slots = Array.from(selectedSlots).map((slot) => {
          const [date, time] = slot.split('|')
          return { date, time }
        })
        await onSaveSchedule(editingMember.id, slots)
      }
      setMemberUpdates((current) => ({
        ...current,
        [editingMember.id]: { status: '입력 완료', updated: '방금 전' },
      }))
      setEditingMember(null)
      setSaveState('idle')
    } catch {
      setSaveState('error')
    }
  }

  return (
    <main className="main-content" aria-labelledby="dashboard-title">
      <header className="schedule-header">
        <div className="title-cluster">
          <span className="calendar-mark" aria-hidden="true">
            ▦
          </span>
          <div>
            <h1 id="dashboard-title">주간 일정</h1>
            <p>
              우리 팀의 가능한 시간을 한눈에 확인하고, 본인의 일정을
              입력해 주세요.
            </p>
          </div>
        </div>
        <div className="week-summary">
          <strong>{weekTitle}</strong>
          <span>이번 주가 지나면 모든 일정이 초기화됩니다.</span>
        </div>
        <div className="countdown">
          <strong>D-{remainingDays}</strong>
          <span>이번 주 종료</span>
        </div>
      </header>

      <section className="schedule-grid">
          <article className="panel members-panel">
            <h2>팀원</h2>
            <ol>
              {memberLoadState === 'loading' && (
                <li className="member-message">팀원 목록을 불러오는 중입니다.</li>
              )}
              {memberLoadState === 'error' && (
                <li className="member-message member-error">
                  <span>팀원 목록을 불러오지 못했습니다.</span>
                  {onRetryMembers && (
                    <button type="button" onClick={onRetryMembers}>다시 시도</button>
                  )}
                </li>
              )}
              {memberLoadState === 'ready' && members.length === 0 && (
                <li className="member-message">표시할 팀원이 없습니다.</li>
              )}
              {memberLoadState === 'ready' && members.map(({ id, name, status, updated, sortOrder }, index) => (
                <li key={id}>
                  <span className="member-number">{index + 1}</span>
                  <strong>{name}</strong>
                  <div className="member-actions">
                    <span
                      className={`status ${status === '미입력' ? 'pending' : ''}`}
                    >
                      {status}
                    </span>
                    <button type="button" onClick={() => openEditor({ id, name, status, updated, sortOrder })}>
                      수정하기
                    </button>
                  </div>
                  <time>{updated}</time>
                </li>
              ))}
            </ol>
          </article>

        <article className="panel availability-panel">
          <h2>이번 주 일정</h2>
          <div className="table-scroll">
            <table aria-label="팀 가용 시간표">
              <thead>
                <tr>
                  <th>시간</th>
                  {days.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((time, row) => (
                  <tr key={time}>
                    <th>{time}</th>
                    {availability[row].map((count, column) => (
                      <td
                        key={`${time}-${days[column]}`}
                        className={`level-${count}`}
                      >
                        {count}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend">
            <span><i className="level-8" />8명 가능</span>
            <span><i className="level-7" />6~7명</span>
            <span><i className="level-5" />4~5명</span>
            <span><i className="level-3" />2~3명</span>
            <span><i className="level-1" />1명</span>
            <span><i className="level-0" />0명 (없음)</span>
          </div>
        </article>

        <aside className="panel recommendations">
          <h2>
            <span aria-hidden="true">✦</span> 추천 가능한 시간
          </h2>
          <p>
            전원이 가능한 시간과 두 명 이상이 겹치는 시간을 보여줍니다.
          </p>
          <section className="recommend-box all">
            <h3>{members.length}명 모두 가능</h3>
            {recommendations.allMembers.length > 0 ? (
              <ul>
                {recommendations.allMembers.map((recommendation) => (
                  <li key={recommendationKey(recommendation)}>
                    <b>{getDayName(days[recommendation.dayIndex])}</b>
                    {recommendation.startTime} ~ {recommendation.endTime}
                  </li>
                ))}
              </ul>
            ) : <p className="empty-recommendation">해당하는 시간이 없습니다.</p>}
          </section>
          <section className="recommend-box seven">
            <h3>{members.length}명 미만 가능</h3>
            {recommendations.partial.length > 0 ? (
              <ul>
                {recommendations.partial.map((recommendation) => (
                  <li key={recommendationKey(recommendation)}>
                    <b>{getDayName(days[recommendation.dayIndex])}</b>
                    {recommendation.startTime} ~ {recommendation.endTime} ({recommendation.count}명)
                  </li>
                ))}
              </ul>
            ) : <p className="empty-recommendation">2명 이상 겹치는 시간이 없습니다.</p>}
          </section>
          <div className="notice">
            <strong>● 안내사항</strong>
            <p>각자 본인의 이름과 비밀번호로 접속하여 일정을 입력해 주세요.</p>
            <p>입력된 일정은 모든 팀원이 실시간으로 확인할 수 있습니다.</p>
          </div>
        </aside>
      </section>

      {editingMember && (
        <div className="editor-backdrop" role="presentation">
          <section
            className="schedule-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <header className="editor-header">
              <div>
                <span className="editor-eyebrow">주간 일정 수정</span>
                <h2 id="editor-title">{editingMember.name}님의 가능한 시간</h2>
                <p>클릭하거나 드래그해 가능한 시간을 선택하세요. 선택된 칸에서 드래그하면 해제됩니다.</p>
              </div>
              <button
                className="editor-close"
                type="button"
                aria-label="일정 수정 닫기"
                onClick={() => setEditingMember(null)}
              >
                ×
              </button>
            </header>

            <div className="editor-summary">
              <strong>{selectedSlots.size}개 시간 선택</strong>
              {saveState === 'error' ? (
                <span className="editor-error" role="alert">
                  저장하지 못했습니다. 다시 시도해 주세요.
                </span>
              ) : (
                <span>30분 단위 · 이번 주에만 적용</span>
              )}
            </div>

            <div className="editor-table-scroll">
              <table className="editor-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    {days.map((day) => <th key={day}>{day}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {times.map((time, row) => (
                    <tr key={time}>
                      <th>{time}</th>
                      {days.map((day, column) => {
                        const slot = `${dayDates[column]}|${time}`
                        const selected = selectedSlots.has(slot)
                        return (
                          <td
                            key={slot}
                            className={isInsideDragRectangle(row, column) ? 'drag-preview' : ''}
                          >
                            <button
                              type="button"
                              className={selected ? 'selected' : ''}
                              aria-pressed={selected}
                              aria-label={`${day} ${time}`}
                              onPointerDown={(event) => {
                                if (event.button !== 0) return
                                event.preventDefault()
                                startSlotDrag({ row, column })
                              }}
                              onPointerEnter={() => continueSlotDrag({ row, column })}
                              onClick={(event) => {
                                // 키보드로 발생한 click에는 pointer 이벤트가 없으므로 별도로 처리한다.
                                if (event.detail === 0) toggleSlot(slot)
                              }}
                            >
                              <span aria-hidden="true">✓</span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="editor-footer">
              <button className="secondary-button" type="button" disabled={saveState === 'saving'} onClick={() => setEditingMember(null)}>
                취소
              </button>
              <button className="primary-button" type="button" disabled={saveState === 'saving'} onClick={() => void savePreview()}>
                {saveState === 'saving' ? '저장 중...' : '선택한 일정 저장'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}

function parseDate(dateText: string) {
  const [year, month, day] = dateText.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(dateText: string, days: number) {
  const date = parseDate(dateText)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatKoreanDate(dateText: string) {
  const date = parseDate(dateText)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${weekdays[date.getUTCDay()]})`
}

function createWeekDayLabels(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = parseDate(addDays(weekStart, index))
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()} (${weekdays[date.getUTCDay()]})`
  })
}

function getRemainingDays(weekEnd: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const today = `${value.year}-${value.month}-${value.day}`
  const difference = parseDate(weekEnd).getTime() - parseDate(today).getTime()
  return Math.max(0, Math.ceil(difference / 86_400_000))
}

function formatUpdatedAt(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function getDayName(dayLabel: string) {
  return dayLabel.match(/\(([^)]+)\)/)?.[1] ?? dayLabel
}

function recommendationKey(recommendation: {
  dayIndex: number
  startTime: string
  endTime: string
  count: number
}) {
  return [
    recommendation.dayIndex,
    recommendation.startTime,
    recommendation.endTime,
    recommendation.count,
  ].join('-')
}
