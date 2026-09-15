import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('주간 스케줄 시안을 표시한다', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: '주간 일정' }),
    ).toBeInTheDocument()
    expect(screen.getByText('이번 주 일정')).toBeInTheDocument()
  })
})
