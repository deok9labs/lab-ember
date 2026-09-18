import { useEffect, useRef, useState } from 'react'
import ScheduleEditor, { type GridPosition } from './ScheduleEditor'
import type {
  AvailabilityEntry,
  Member,
  ScheduleSlot,
} from './scheduleRepository'
import { createRecommendations } from './recommendations'
import {
  addDays,
  createWeekDayLabels,
  formatKoreanDate,
  formatUpdatedAt,
  getCurrentWeekStart,
  getDayName,
  getRemainingDays,
} from './scheduleDate'
import {
  createAvailabilityCounts,
  createMemberSlotSelection,
  TEAM_SIZE,
  TIME_SLOTS,
} from './scheduleModel'
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
    ...memberUpdates[member.id],
  }))
  const availability = createAvailabilityCounts(suppliedAvailability, dayDates)
  const recommendations = createRecommendations(availability, TEAM_SIZE)
  const teamSizeMismatch = memberLoadState === 'ready'
    && members.length > 0
    && members.length !== TEAM_SIZE
  const weekTitle = `${formatKoreanDate(displayedWeekStart)} ~ ${formatKoreanDate(displayedWeekEnd)}`
  const remainingDays = getRemainingDays(displayedWeekEnd)

  const openEditor = (member: Member) => {
    setEditingMember(member)
    setSelectedSlots(createMemberSlotSelection(suppliedAvailability, member.id))
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
        const slot = `${dayDates[column]}|${TIME_SLOTS[row]}`
        if (drag.shouldSelect) next.add(slot)
        else next.delete(slot)
      }
    }
    setSelectedSlots(next)
  }

  const startSlotDrag = (position: GridPosition) => {
    const slot = `${dayDates[position.column]}|${TIME_SLOTS[position.row]}`
    const drag = {
      start: position,
      shouldSelect: !selectedSlots.has(slot),
      // 드래그 중 매 이동마다 같은 최초 상태를 기준으로 계산해야 되돌아갈 때 선택이 흔들리지 않는다.
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
        [editingMember.id]: { submitted: true, updatedAt: new Date().toISOString() },
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
              {teamSizeMismatch && (
                <li className="member-message member-error">팀원 데이터는 {TEAM_SIZE}명이어야 합니다.</li>
              )}
              {memberLoadState === 'ready' && members.map((member) => (
                <li key={member.id}>
                  <span className={`member-position position-${member.position.toLowerCase()}`}>{member.position}</span>
                  <strong>{member.name}@{member.server}</strong>
                  <div className="member-actions">
                    <span
                      className={`status ${member.submitted ? '' : 'pending'}`}
                    >
                      {member.submitted ? '입력 완료' : '미입력'}
                    </span>
                    <button type="button" onClick={() => openEditor(member)}>
                      수정하기
                    </button>
                  </div>
                  <time>{formatUpdatedAt(member.updatedAt)}</time>
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
                {TIME_SLOTS.map((time, row) => (
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
            <h3>{TEAM_SIZE}명 모두 가능</h3>
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
            <h3>{TEAM_SIZE}명 미만 가능</h3>
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
        <ScheduleEditor
          member={editingMember}
          days={days}
          dayDates={dayDates}
          selectedSlots={selectedSlots}
          saveState={saveState}
          isInsideDragRectangle={isInsideDragRectangle}
          onStartDrag={startSlotDrag}
          onContinueDrag={continueSlotDrag}
          onToggleSlot={toggleSlot}
          onCancel={() => setEditingMember(null)}
          onSave={() => void savePreview()}
        />
      )}
    </main>
  )
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
