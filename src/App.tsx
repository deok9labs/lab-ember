import { useCallback, useEffect, useState } from 'react'
import SchedulePage from './features/schedule/SchedulePage'
import {
  fetchCurrentSchedule,
  saveMemberSchedule,
  type CurrentSchedule,
  type ScheduleSlot,
} from './features/schedule/scheduleRepository'

type MemberLoadState = 'loading' | 'ready' | 'error'

/** Google Sheets API와 주간 일정 화면의 조회·저장 상태를 연결한다. */
export default function App() {
  const [schedule, setSchedule] = useState<CurrentSchedule | null>(null)
  const [memberLoadState, setMemberLoadState] = useState<MemberLoadState>('loading')
  const endpoint = import.meta.env.VITE_MEMBERS_API_URL

  const requestMembers = useCallback((signal?: AbortSignal) => {
    const request = endpoint
      ? fetchCurrentSchedule(endpoint, signal)
      : Promise.reject(new Error('팀원 API 주소가 설정되지 않았습니다.'))

    return request.then((loadedSchedule) => {
      setSchedule(loadedSchedule)
      setMemberLoadState('ready')
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMemberLoadState('error')
    })
  }, [endpoint])

  useEffect(() => {
    const controller = new AbortController()
    void requestMembers(controller.signal)
    return () => controller.abort()
  }, [requestMembers])

  const retryMembers = () => {
    setMemberLoadState('loading')
    void requestMembers()
  }

  const saveSchedule = async (memberId: string, slots: ScheduleSlot[]) => {
    if (!endpoint || !schedule) throw new Error('일정 API가 준비되지 않았습니다.')
    await saveMemberSchedule(endpoint, memberId, schedule.weekStart, slots)
    setSchedule(await fetchCurrentSchedule(endpoint))
  }

  return (
    <SchedulePage
      suppliedMembers={schedule?.members ?? []}
      weekStart={schedule?.weekStart}
      weekEnd={schedule?.weekEnd}
      suppliedAvailability={schedule?.availability}
      memberLoadState={memberLoadState}
      onRetryMembers={retryMembers}
      onSaveSchedule={saveSchedule}
    />
  )
}
