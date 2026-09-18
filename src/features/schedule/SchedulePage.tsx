import { useEffect, useRef, useState } from 'react'
import type {
  AvailabilityEntry,
  Member,
  ScheduleSlot,
} from './scheduleRepository'
import { createRecommendations } from './recommendations'

const times = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2).toString().padStart(2, '0')
  return `${hour}:${index % 2 === 0 ? '00' : '30'}`
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
  onSaveSchedule?: (memberId: number, slots: ScheduleSlot[]) => Promise<void>
}

/** 현재 주의 팀원별 가능 시간과 추천 구간을 표시하고 편집한다. */
export default function SchedulePage({
  suppliedMembers = [],
  memberLoadState = 'ready',
  onRetryMembers,
  weekStart,
  weekEnd,
  suppliedAvailability,
  onSaveSchedule,
}: SchedulePageProps = {}) {
  const [memberUpdates, setMemberUpdates] = useState<Record<number, Partial<Member>>>({})
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

  const displayedWeekStart = weekStart ?? getCurrentWeekStart()
  const displayedWeekEnd = weekEnd ?? addDays(displayedWeekStart, 6)
  const days = createWeekDayLabels(displayedWeekStart)
  const dayDates = Array.from(
    { length: 7 },
    (_, index) => addDays(displayedWeekStart, index),
  )
  const members = suppliedMembers.map((member) => ({
    ...member,
    updated: formatUpdatedAt(member.updated),
    ...memberUpdates[member.id],
  }))
  const availability = suppliedAvailability === undefined
    ? times.map(() => days.map(() => 0))
    : times.map((time) => dayDates.map((date) => (
      new Set(
        suppliedAvailability
          .filter((entry) => entry.date === date && entry.slots.includes(time))
          .map((entry) => entry.memberId),
      ).size
    )))
  const recommendations = createRecommendations(availability, members.length)
  const weekTitle = `${formatKoreanDate(displayedWeekStart)} ~ ${formatKoreanDate(displayedWeekEnd)}`
  const remainingDays = getRemainingDays(displayedWeekEnd)

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
              {memberLoadState === 'ready' && members.map(({ id, name, server, position, status, updated }) => (
                <li key={id}>
                  <span className={`member-position position-${position.toLowerCase()}`}>{position}</span>
                  <strong>{name}@{server}</strong>
                  <div className="member-actions">
                    <span
                      className={`status ${status === '미입력' ? 'pending' : ''}`}
                    >
                      {status}
                    </span>
                    <button type="button" onClick={() => openEditor({ id, name, server, position, status, updated })}>
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
                <h2 id="editor-title">{editingMember.name}@{editingMember.server}님의 가능한 시간</h2>
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

function getCurrentWeekStart() {
  const today = getTodayInKorea()
  const day = parseDate(today).getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  return addDays(today, -daysSinceMonday)
}

function getTodayInKorea() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function getRemainingDays(weekEnd: string) {
  const difference = parseDate(weekEnd).getTime() - parseDate(getTodayInKorea()).getTime()
  return Math.max(0, Math.ceil(difference / 86_400_000))
}

function formatUpdatedAt(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}.${values.month.padStart(2, '0')}.${values.day.padStart(2, '0')} ${values.hour}:${values.minute}`
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
