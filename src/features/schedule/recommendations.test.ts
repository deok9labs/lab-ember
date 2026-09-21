import { describe, expect, it } from 'vitest'
import { createRecommendations } from './recommendations'

describe('createRecommendations', () => {
  it('전원 가능한 연속 30분 슬롯을 하나의 구간으로 묶는다', () => {
    const counts = [
      [8, 0],
      [8, 0],
      [0, 0],
    ]

    expect(createRecommendations(counts, 8).allMembers).toEqual([
      { dayIndex: 0, startTime: '18:00', endTime: '18:30', count: 8 },
    ])
  })

  it('2명 이상 전원 미만 구간을 인원수 내림차순으로 정렬한다', () => {
    const counts = [
      [3, 7],
      [3, 7],
      [1, 6],
    ]

    expect(createRecommendations(counts, 8).partial).toEqual([
      { dayIndex: 1, startTime: '18:00', endTime: '18:30', count: 7 },
      { dayIndex: 1, startTime: '19:00', endTime: '19:00', count: 6 },
      { dayIndex: 0, startTime: '18:00', endTime: '18:30', count: 3 },
    ])
  })

  it('0명과 1명 가능 시간은 부분 추천에서 제외한다', () => {
    expect(createRecommendations([[0], [1]], 8).partial).toEqual([])
  })

  it('24:00 슬롯을 단일 추천 시각으로 표시한다', () => {
    const counts = Array.from({ length: 13 }, (_, index) => [index === 12 ? 8 : 0])

    expect(createRecommendations(counts, 8).allMembers).toEqual([
      { dayIndex: 0, startTime: '24:00', endTime: '24:00', count: 8 },
    ])
  })
})
