import { useEffect, useRef, useState } from 'react'
import ScheduleEditor, { type GridPosition } from './ScheduleEditor'
import type {
  AvailabilityEntry,
  Member,
  ScheduleSlot,
} from './scheduleRepository'
import { ScheduleApiError, type ScheduleWeek } from './scheduleRepository'
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
  selectedWeek?: ScheduleWeek
  onSelectWeek?: (week: ScheduleWeek) => void
  suppliedMembers?: Member[]
  loadState?: 'loading' | 'ready' | 'error'
  isRefreshing?: boolean
  onRetrySchedule?: () => void
  weekStart?: string
  weekEnd?: string
  suppliedAvailability?: AvailabilityEntry[]
  onSaveSchedule?: (memberId: number, slots: ScheduleSlot[]) => Promise<void>
}

/** 선택한 주의 팀원별 가능 시간과 추천 구간을 같은 화면에서 표시하고 편집한다. */
export default function SchedulePage({
  selectedWeek = 'current',
  onSelectWeek,
  suppliedMembers = [],
  loadState = 'ready',
  isRefreshing = false,
  onRetrySchedule,
  weekStart,
  weekEnd,
  suppliedAvailability,
  onSaveSchedule,
}: SchedulePageProps = {}) {
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [dragStart, setDragStart] = useState<GridPosition | null>(null)
  const [dragEnd, setDragEnd] = useState<GridPosition | null>(null)
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null)
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
  const members = suppliedMembers
  const availability = createAvailabilityCounts(suppliedAvailability, dayDates)
  const recommendations = createRecommendations(availability, TEAM_SIZE)
  const teamSizeMismatch = loadState === 'ready'
    && members.length > 0
    && members.length !== TEAM_SIZE
  const weekTitle = `${formatKoreanDate(displayedWeekStart)} ~ ${formatKoreanDate(displayedWeekEnd)}`
  const remainingDays = getRemainingDays(displayedWeekEnd)
  const weekLabel = selectedWeek === 'current' ? '이번 주' : '다음 주'

  const selectWeek = (week: ScheduleWeek) => {
    setEditingMember(null)
    setSelectedSlots(new Set())
    setSaveState('idle')
    setScheduleNotice(null)
    onSelectWeek?.(week)
  }

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
      setEditingMember(null)
      setSaveState('idle')
    } catch (error) {
      if (error instanceof ScheduleApiError && error.code === 'SCHEDULE_WEEK_MISMATCH') {
        setEditingMember(null)
        setSaveState('idle')
        setScheduleNotice('주차가 변경되어 최신 일정을 다시 불러왔습니다. 일정을 다시 확인해 주세요.')
        return
      }
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
          <span>{weekLabel} 일정 기간을 표시하고 있습니다.</span>
        </div>
        <div className="countdown">
          <strong>D-{remainingDays}</strong>
          <span>{weekLabel} 종료</span>
        </div>
      </header>

      <section className="schedule-grid">
          <article className="panel members-panel">
            <h2>팀원</h2>
            <ol>
              {loadState === 'loading' && (
                <li className="member-message">{weekLabel} 일정을 불러오는 중입니다.</li>
              )}
              {loadState === 'error' && (
                <li className="member-message member-error">
                  <span>{weekLabel} 일정을 불러오지 못했습니다.</span>
                  {onRetrySchedule && (
                    <button type="button" onClick={onRetrySchedule}>다시 시도</button>
                  )}
                </li>
              )}
              {loadState === 'ready' && members.length === 0 && (
                <li className="member-message">표시할 팀원이 없습니다.</li>
              )}
              {teamSizeMismatch && (
                <li className="member-message member-error">팀원 데이터는 {TEAM_SIZE}명이어야 합니다.</li>
              )}
              {loadState === 'ready' && members.map((member) => (
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
          <div className="week-tabs" role="tablist" aria-label="일정 주 선택">
            <button
              type="button"
              role="tab"
              aria-selected={selectedWeek === 'current'}
              onClick={() => selectWeek('current')}
            >
              이번 주
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedWeek === 'next'}
              onClick={() => selectWeek('next')}
            >
              다음 주
            </button>
          </div>
          <div className="panel-title-row">
            <h2>{weekLabel} 일정</h2>
            <span
              className={`refresh-indicator ${isRefreshing ? 'visible' : ''}`}
              role="status"
            >
              최신 정보 확인 중
            </span>
          </div>
          {scheduleNotice && <p className="schedule-notice" role="status">{scheduleNotice}</p>}
          {loadState !== 'ready' ? (
            <div className={`schedule-state ${loadState === 'error' ? 'error' : ''}`} role="status">
              {loadState === 'loading'
                ? `${weekLabel} 시간표를 불러오는 중입니다.`
                : `${weekLabel} 시간표를 표시할 수 없습니다.`}
            </div>
          ) : <div className="table-scroll">
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
          </div>}
          {loadState === 'ready' && <div className="legend">
            <span><i className="level-8" />8명 가능</span>
            <span><i className="level-7" />6~7명</span>
            <span><i className="level-5" />4~5명</span>
            <span><i className="level-3" />2~3명</span>
            <span><i className="level-1" />1명</span>
            <span><i className="level-0" />0명 (없음)</span>
          </div>}
        </article>

        <aside className="panel recommendations">
          <h2>
            <span aria-hidden="true">✦</span> 추천 가능한 시간
          </h2>
          <p>
            전원이 가능한 시간과 두 명 이상이 겹치는 시간을 보여줍니다.
          </p>
          {loadState !== 'ready' ? (
            <p className="recommendation-state">일정을 불러온 뒤 추천 시간을 표시합니다.</p>
          ) : <><section className="recommend-box all">
            <h3>{TEAM_SIZE}명 모두 가능</h3>
            {recommendations.allMembers.length > 0 ? (
              <ul>
                {recommendations.allMembers.map((recommendation) => (
                  <li key={recommendationKey(recommendation)}>
                    <b>{getDayName(days[recommendation.dayIndex])}</b>
                    {formatRecommendationTime(recommendation)}
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
                    {formatRecommendationTime(recommendation)} ({recommendation.count}명)
                  </li>
                ))}
              </ul>
            ) : <p className="empty-recommendation">2명 이상 겹치는 시간이 없습니다.</p>}
          </section>
          </>}
        </aside>
      </section>

      {editingMember && (
        <ScheduleEditor
          member={editingMember}
          days={days}
          dayDates={dayDates}
          selectedSlots={selectedSlots}
          saveState={saveState}
          weekLabel={weekLabel}
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

function formatRecommendationTime(recommendation: {
  startTime: string
  endTime: string
}) {
  return recommendation.startTime === recommendation.endTime
    ? recommendation.startTime
    : `${recommendation.startTime} ~ ${recommendation.endTime}`
}
