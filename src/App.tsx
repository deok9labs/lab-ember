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

type LoadedSchedule = {
  week: ScheduleWeek
  data: WeeklySchedule
}

/** Aster API와 선택 주차의 조회·저장 상태를 주간 일정 화면에 연결한다. */
export default function App() {
  const [selectedWeek, setSelectedWeek] = useState<ScheduleWeek>('current')
  const [loadedSchedule, setLoadedSchedule] = useState<LoadedSchedule | null>(null)
  const [loadState, setLoadState] = useState<ScheduleLoadState>('loading')
  const [requestVersion, setRequestVersion] = useState(0)
  // 동일 출처 /api를 기본값으로 두어 인증 정보나 환경별 host를 frontend bundle에 고정하지 않는다.
  const endpoint = import.meta.env.VITE_API_BASE_URL ?? '/api'

  const requestSchedule = useCallback((week: ScheduleWeek, signal?: AbortSignal) => {
    return endpoint
      ? fetchSchedule(endpoint, week, signal)
      : Promise.reject(new Error('일정 API 주소가 설정되지 않았습니다.'))
  }, [endpoint])

  useEffect(() => {
    const controller = new AbortController()
    void requestSchedule(selectedWeek, controller.signal)
      .then((data) => {
        setLoadedSchedule({ week: selectedWeek, data })
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadState('error')
      })
    // 탭을 빠르게 바꿔도 이전 주의 늦은 응답이 선택한 주를 덮지 않게 취소한다.
    return () => controller.abort()
  }, [requestSchedule, requestVersion, selectedWeek])

  const selectWeek = (week: ScheduleWeek) => {
    if (week === selectedWeek) return
    setSelectedWeek(week)
    setLoadState('loading')
  }

  const retrySchedule = () => {
    setLoadState('loading')
    setRequestVersion((current) => current + 1)
  }

  const activeSchedule = loadedSchedule?.week === selectedWeek
    ? loadedSchedule.data
    : null

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
      const data = await requestSchedule(selectedWeek)
      setLoadedSchedule({ week: selectedWeek, data })
      setLoadState('ready')
    } catch (error) {
      if (error instanceof ScheduleApiError && error.code === 'SCHEDULE_WEEK_MISMATCH') {
        const data = await requestSchedule(selectedWeek)
        setLoadedSchedule({ week: selectedWeek, data })
        setLoadState('ready')
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
      loadState={loadState}
      onRetrySchedule={retrySchedule}
      onSaveSchedule={saveSchedule}
    />
  )
}
