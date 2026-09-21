import { useCallback, useEffect, useState } from 'react'
import SchedulePage from './features/schedule/SchedulePage'
import {
  fetchSchedule,
  saveMemberSchedule,
  ScheduleApiError,
  type ScheduleSlot,
  type ScheduleWeek,
  type WeeklySchedule,
} from './features/schedule/scheduleRepository'

type ScheduleLoadState = 'loading' | 'ready' | 'error'

const SCHEDULE_WEEKS: ScheduleWeek[] = ['current', 'next']

/** Aster API와 주차별 조회 캐시 및 저장 상태를 주간 일정 화면에 연결한다. */
export default function App() {
  const [selectedWeek, setSelectedWeek] = useState<ScheduleWeek>('current')
  const [schedules, setSchedules] = useState<Record<ScheduleWeek, WeeklySchedule | null>>({
    current: null,
    next: null,
  })
  const [loadStates, setLoadStates] = useState<Record<ScheduleWeek, ScheduleLoadState>>({
    current: 'loading',
    next: 'loading',
  })
  // 동일 출처 /api를 기본값으로 두어 인증 정보나 환경별 host를 frontend bundle에 고정하지 않는다.
  const endpoint = import.meta.env.VITE_API_BASE_URL ?? '/api'

  const requestSchedule = useCallback((week: ScheduleWeek, signal?: AbortSignal) => {
    return endpoint
      ? fetchSchedule(endpoint, week, signal)
      : Promise.reject(new Error('일정 API 주소가 설정되지 않았습니다.'))
  }, [endpoint])

  useEffect(() => {
    const controller = new AbortController()

    // 첫 화면 뒤 다른 주를 기다리지 않도록 두 주를 병렬로 미리 불러온다.
    SCHEDULE_WEEKS.forEach((week) => {
      void requestSchedule(week, controller.signal)
        .then((data) => {
          setSchedules((current) => ({ ...current, [week]: data }))
          setLoadStates((current) => ({ ...current, [week]: 'ready' }))
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setLoadStates((current) => ({ ...current, [week]: 'error' }))
        })
    })

    return () => controller.abort()
  }, [requestSchedule])

  const refreshSchedule = useCallback(async (week: ScheduleWeek) => {
    setLoadStates((current) => ({ ...current, [week]: 'loading' }))
    try {
      const data = await requestSchedule(week)
      setSchedules((current) => ({ ...current, [week]: data }))
      setLoadStates((current) => ({ ...current, [week]: 'ready' }))
      return data
    } catch (error) {
      setLoadStates((current) => ({ ...current, [week]: 'error' }))
      throw error
    }
  }, [requestSchedule])

  const selectWeek = (week: ScheduleWeek) => {
    if (week === selectedWeek) return
    setSelectedWeek(week)

    // 캐시를 즉시 표시하고 이미 진행 중인 요청이 없을 때만 최신 상태를 다시 확인한다.
    if (schedules[week] && loadStates[week] !== 'loading') {
      void refreshSchedule(week).catch(() => {
        // 캐시가 있으므로 갱신 실패 시 기존 화면을 유지한다.
      })
    }
  }

  const retrySchedule = () => {
    void refreshSchedule(selectedWeek).catch(() => {
      // 오류 상태와 다시 시도 UI는 선택 주차의 loadState가 담당한다.
    })
  }

  const activeSchedule = schedules[selectedWeek]
  const selectedLoadState = loadStates[selectedWeek]
  const displayedLoadState = activeSchedule ? 'ready' : selectedLoadState
  const isRefreshing = Boolean(activeSchedule && selectedLoadState === 'loading')

  const saveSchedule = async (memberId: number, slots: ScheduleSlot[]) => {
    if (!endpoint || !activeSchedule) throw new Error('일정 API가 준비되지 않았습니다.')
    try {
      await saveMemberSchedule(
        endpoint,
        selectedWeek,
        memberId,
        activeSchedule.weekStart,
        slots,
      )
      // 저장 응답을 화면 모델로 추측하지 않고 서버가 확정한 제출 상태와 수정 시각을 다시 조회한다.
      await refreshSchedule(selectedWeek)
    } catch (error) {
      if (error instanceof ScheduleApiError && error.code === 'SCHEDULE_WEEK_MISMATCH') {
        await refreshSchedule(selectedWeek)
      }
      throw error
    }
  }

  return (
    <SchedulePage
      selectedWeek={selectedWeek}
      onSelectWeek={selectWeek}
      suppliedMembers={activeSchedule?.members ?? []}
      weekStart={activeSchedule?.weekStart}
      weekEnd={activeSchedule?.weekEnd}
      suppliedAvailability={activeSchedule?.availability}
      loadState={displayedLoadState}
      isRefreshing={isRefreshing}
      onRetrySchedule={retrySchedule}
      onSaveSchedule={saveSchedule}
    />
  )
}
