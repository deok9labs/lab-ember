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

## 배포 구조

프로덕션 빌드 결과는 `dist/`에 생성됩니다. 운영 환경에서는 Nginx가 이 정적 파일을 `/`에서 제공하고 `/api/` 요청을 Aster로 전달합니다.

```text
브라우저 ── / ─────→ Nginx ──→ Ember dist/
         └─ /api/ ─→ Nginx ──→ Aster
```

API 주소는 공개 설정이며 인증 비밀값을 포함하면 안 됩니다. 실제 인증 정보와 database 자격 증명은 프론트엔드 빌드에 주입하지 않습니다.
