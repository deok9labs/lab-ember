# lab-ember

Google Spreadsheet의 팀원별 주간 가능 시간을 표시하고 편집하는 웹 애플리케이션입니다.

## 로컬 실행

`.env.example`을 참고해 `.env.local`을 만들고 Apps Script 웹 앱의 `/exec` URL을 설정합니다.

```text
VITE_MEMBERS_API_URL=https://script.google.com/macros/s/.../exec
```

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

저장소의 Actions secret `MEMBERS_API_URL`에 Apps Script `/exec` URL을 등록합니다. 이 값은 저장소 소스에는 기록되지 않지만 Vite 빌드 결과에서는 브라우저가 API를 호출할 수 있도록 공개됩니다. Apps Script는 공개 가능한 데이터만 반환해야 합니다.

저장소의 `Settings → Pages → Build and deployment → Source`에서 `GitHub Actions`를 선택합니다. 이후 `main` push 또는 수동 실행 시 테스트, lint와 build를 통과한 결과가 Pages에 배포됩니다.

프로젝트 저장소 Pages 주소는 다음 형식을 사용합니다.

```text
https://deok9labs.github.io/lab-ember/
```
