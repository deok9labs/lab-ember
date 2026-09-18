import { useCallback, useEffect, useState } from 'react'
import SchedulePage from './features/schedule/SchedulePage'
import {
  fetchCurrentSchedule,
  saveMemberSchedule,
  type CurrentSchedule,
  type ScheduleSlot,
} from './features/schedule/scheduleRepository'

type MemberLoadState = 'loading' | 'ready' | 'error'

/** Aster API와 주간 일정 화면의 조회·저장 상태를 연결한다. */
export default function App() {
  const [schedule, setSchedule] = useState<CurrentSchedule | null>(null)
  const [memberLoadState, setMemberLoadState] = useState<MemberLoadState>('loading')
  // 동일 출처 /api를 기본값으로 두어 인증 정보나 환경별 host를 frontend bundle에 고정하지 않는다.
  const endpoint = import.meta.env.VITE_API_BASE_URL ?? '/api'

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
    // 화면이 사라진 뒤 완료된 응답이 상태를 갱신하지 않도록 진행 중인 요청을 취소한다.
    return () => controller.abort()
  }, [requestMembers])

  const retryMembers = () => {
    setMemberLoadState('loading')
    void requestMembers()
  }

  const saveSchedule = async (memberId: number, slots: ScheduleSlot[]) => {
    if (!endpoint || !schedule) throw new Error('일정 API가 준비되지 않았습니다.')
    await saveMemberSchedule(endpoint, memberId, schedule.weekStart, slots)
    // 저장 응답을 화면 모델로 추측하지 않고 server가 확정한 입력 상태와 수정 시각을 다시 조회한다.
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
