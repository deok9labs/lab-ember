const members = [
  ['김철수', '입력 완료', '9.15 10:24'], ['이영희', '입력 완료', '9.15 09:18'],
  ['박민수', '입력 완료', '9.14 22:11'], ['최지은', '미입력', '-'],
  ['정현우', '입력 완료', '9.15 08:36'], ['한소희', '입력 완료', '9.14 23:02'],
  ['오민준', '입력 완료', '9.15 07:51'], ['이수빈', '미입력', '-'],
]
const days = ['9/15 (월)', '9/16 (화)', '9/17 (수)', '9/18 (목)', '9/19 (금)', '9/20 (토)', '9/21 (일)']
const times = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2).toString().padStart(2, '0')
  return `${hour}:${index % 2 === 0 ? '00' : '30'}`
})

// 화면 시안용 값으로, 하루 전체에서도 업무 시간대가 상대적으로 높게 보이도록 구성한다.
const availability = times.map((_, row) => {
  const hour = Math.floor(row / 2)
  const timeWeight = hour >= 9 && hour < 18 ? 3 : hour >= 7 && hour < 22 ? 1 : -1

  return days.map((__, column) =>
    Math.max(0, Math.min(8, 4 + timeWeight + ((row + column * 2) % 3) - (column > 4 ? 1 : 0))),
  )
})

/** 시안 기반의 정적 주간 공용 스케줄 화면을 제공한다. */
export default function App() {
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
          <strong>2026년 9월 15일 (월) ~ 9월 21일 (일)</strong>
          <span>이번 주가 지나면 모든 일정이 초기화됩니다.</span>
        </div>
        <div className="countdown">
          <strong>D-6</strong>
          <span>이번 주 종료</span>
        </div>
      </header>

      <section className="schedule-grid">
        <div className="panel member-input-panel">
          <article className="members-panel">
            <h2>팀원</h2>
            <ol>
              {members.map(([name, status, updated], index) => (
                <li key={name}>
                  <span className="member-number">{index + 1}</span>
                  <strong>{name}</strong>
                  <span
                    className={`status ${status === '미입력' ? 'pending' : ''}`}
                  >
                    {status}
                  </span>
                  <time>{updated}</time>
                </li>
              ))}
            </ol>
          </article>

          <section className="input-panel">
            <div className="input-copy">
              <span className="lock-mark">▣</span>
              <div>
                <h2>내 일정 입력 / 수정하기</h2>
                <p>본인 확인 후, 이번 주 가능한 시간을 선택해주세요.</p>
              </div>
            </div>
            <div className="form-preview">
              <div className="fake-field">
                ♙ <span>이름을 선택하세요</span>
                <b>⌄</b>
              </div>
              <div className="fake-field">
                ♙ <span>비밀번호를 입력하세요</span>
                <b>◉</b>
              </div>
              <button type="button">내 일정 불러오기</button>
            </div>
          </section>
        </div>

        <article className="panel availability-panel">
          <h2>이번 주 일정</h2>
          <div className="table-scroll">
            <table>
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
            8명 모두가 가능한 시간과, 7명 이상 가능한 시간을 추천합니다.
          </p>
          <section className="recommend-box all">
            <h3>8명 모두 가능</h3>
            <ul>
              <li><b>월</b> 14:00 ~ 14:30</li>
              <li><b>화</b> 10:00 ~ 10:30</li>
              <li><b>수</b> 13:00 ~ 13:30</li>
              <li><b>목</b> 09:00 ~ 10:00</li>
            </ul>
          </section>
          <section className="recommend-box seven">
            <h3>7명 이상 가능</h3>
            <ul>
              <li><b>월</b> 09:00 ~ 11:00 (7명)</li>
              <li><b>화</b> 13:30 ~ 15:00 (7명)</li>
              <li><b>목</b> 13:00 ~ 15:00 (7명)</li>
              <li><b>토</b> 09:00 ~ 10:30 (7명)</li>
            </ul>
          </section>
          <div className="notice">
            <strong>● 안내사항</strong>
            <p>각자 본인의 이름과 비밀번호로 접속하여 일정을 입력해 주세요.</p>
            <p>입력된 일정은 모든 팀원이 실시간으로 확인할 수 있습니다.</p>
          </div>
        </aside>
      </section>
    </main>
  )
}
