# lab-ember

Aster API의 팀원별 주간 가능 시간을 표시하고 편집하는 React 웹 애플리케이션입니다.

## 로컬 실행

기본 API 경로는 `/api`이며 Vite 개발 서버가 로컬 Aster의 `http://localhost:8080`으로 요청을 전달합니다. 먼저 Aster를 실행한 뒤 Ember를 실행합니다.

```text
VITE_API_BASE_URL=/api
```

API가 다른 주소에 있다면 `.env.example`을 참고해 `.env.local`의 값을 변경합니다. API 주소에는 `/api`까지 포함하고 `/v1/schedules/current`는 포함하지 않습니다.

PowerShell에서는 다음 명령으로 실행합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

## 검증

```powershell
npm.cmd test -- --run
npm.cmd run lint
npm.cmd run build
```

## GitHub Pages 배포

현재 GitHub Pages 워크플로를 유지하는 동안에는 Actions secret `API_BASE_URL`에 브라우저에서 접근 가능한 Aster의 `/api` 주소를 등록합니다. 이 주소는 빌드 결과에 포함되는 공개 설정이며 인증 비밀값을 넣으면 안 됩니다.

저장소의 `Settings → Pages → Build and deployment → Source`에서 `GitHub Actions`를 선택합니다. 이후 `main` push 또는 수동 실행 시 테스트, lint와 build를 통과한 결과가 Pages에 배포됩니다.

프로젝트 저장소 Pages 주소는 다음 형식을 사용합니다.

```text
https://deok9labs.github.io/lab-ember/
```
