# factmarketer-web

팩트마케터 for 티링크 소개 사이트 (정적 HTML/CSS, 빌드 없음).

- `index.html` 소개 · `results.html` 저장된 실제 실행 결과
- 이 폴더는 출품 저장소의 `python build_site.py`가 만든 결과물입니다. 직접 고치지 말고 생성기를 고친 뒤 다시 만드세요.
- Vercel 설정: Framework Preset "Other", Build Command 비움, Output Directory 비움
- API 키, 대회에서 받은 원본 문서, 원본 사진 파일은 들어 있지 않습니다. 카드뉴스 이미지의 고객명은 홈페이지에 가려진 이름 그대로입니다.


배포 주소: https://factmarketer-web.vercel.app/

직접 사용해 보기: https://factmarketer-web.vercel.app/app.html

## 직접 사용해 보기 (app.html)
소개 쪽의 "직접 사용해 보기" 버튼으로 들어가는 실제 사용 화면입니다. 분석 → 콘텐츠 → 검수와 승인 순서로 씁니다.

- **키가 없어도 되는 것**: 저장된 결과 불러오기, 실시간 검수, 원고 직접 고치기, 검수 시험(검출률 · 오탐률 · 표현 변형), 승인, 내려받기
- **키가 있어야 되는 것**: 콘텐츠 새로 만들기, 요청으로 고치기 (AI 호출)

### Vercel 환경변수 (Project → Settings → Environment Variables, 넣은 뒤 Redeploy)
| 이름 | 필요 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 만들기 · 고치기를 켜려면 필수 | 서버 함수만 읽습니다. 화면과 저장소에는 들어가지 않습니다 |
| `FM_ACCESS_CODE` | 선택 | 넣으면 만들기 · 고치기를 할 때 이 코드를 물어봅니다 (아무나 크레딧을 쓰지 못하게) |
| `CLAUDE_MODEL` | 선택 | 기본값을 바꿀 때만 |

프로젝트 설정은 그대로입니다: Framework Preset "Other", Build Command 비움, Output Directory 비움. `vercel.json`이 `api/*.py` 함수의 실행 시간을 300초로 잡습니다.

### 구성
- `app.html`, `assets/app.css`, `assets/app.js` 사용 화면 (프레임워크 없음)
- `api/*.py` 서버 함수: `health` `check` `tests` `cards` `publish` (키 불필요) · `generate` `revise` (키 필요). 실제 처리는 `webapi/core.py`
- `engine/` 출품 저장소의 엔진(`kit/`)과 분석 결과. **직접 고치지 않습니다.** 출품 저장소에서 `python sync_web.py <이 폴더>`로 다시 맞춥니다
- `d/` 화면이 읽는 자료(분석 요약, 사실 카드, 저장된 결과) · `assets/photos/` 설치 사례 사진(중립 이름) · `assets/cards/` 저장된 카드뉴스 이미지
- `index.html`은 이 저장소에서 직접 관리합니다. `results.html`은 출품 저장소의 `build_site.py`가 만듭니다

### 로컬에서 시험
```
python dev_server.py                      # http://localhost:8600 (키 없이)
python dev_server.py --env <.env 경로>     # 만들기 · 고치기까지
python tests/e2e_local.py shots           # 화면을 끝까지 눌러 보는 시험 (playwright 필요)
```

