import type { Member } from './scheduleRepository'
import { TIME_SLOTS } from './scheduleModel'

export type GridPosition = { row: number; column: number }

type ScheduleEditorProps = {
  member: Member
  days: string[]
  dayDates: string[]
  selectedSlots: Set<string>
  saveState: 'idle' | 'saving' | 'error'
  isInsideDragRectangle: (row: number, column: number) => boolean
  onStartDrag: (position: GridPosition) => void
  onContinueDrag: (position: GridPosition) => void
  onToggleSlot: (slot: string) => void
  onCancel: () => void
  onSave: () => void
}

/** 선택 상태와 저장 생명주기는 상위 화면이 소유하고 편집기의 표시와 입력만 담당한다. */
export default function ScheduleEditor({
  member,
  days,
  dayDates,
  selectedSlots,
  saveState,
  isInsideDragRectangle,
  onStartDrag,
  onContinueDrag,
  onToggleSlot,
  onCancel,
  onSave,
}: ScheduleEditorProps) {
  return (
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
            <h2 id="editor-title">{member.name}@{member.server}님의 가능한 시간</h2>
            <p>클릭하거나 드래그해 가능한 시간을 선택하세요. 선택된 칸에서 드래그하면 해제됩니다.</p>
          </div>
          <button
            className="editor-close"
            type="button"
            aria-label="일정 수정 닫기"
            onClick={onCancel}
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
              {TIME_SLOTS.map((time, row) => (
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
                            onStartDrag({ row, column })
                          }}
                          onPointerEnter={() => onContinueDrag({ row, column })}
                          onClick={(event) => {
                            // 키보드 click에는 pointer 이벤트가 없으므로 접근 가능한 선택 경로를 별도로 유지한다.
                            if (event.detail === 0) onToggleSlot(slot)
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
          <button className="secondary-button" type="button" disabled={saveState === 'saving'} onClick={onCancel}>
            취소
          </button>
          <button className="primary-button" type="button" disabled={saveState === 'saving'} onClick={onSave}>
            {saveState === 'saving' ? '저장 중...' : '선택한 일정 저장'}
          </button>
        </footer>
      </section>
    </div>
  )
}
