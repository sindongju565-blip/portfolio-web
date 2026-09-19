# 2026 Portfolio — 신동주

Figma `2026_포트폴리오` / page `웹사이트` (170:53260) 기준으로 구현한 원페이지 포트폴리오.
빌드 도구 없는 정적 사이트입니다 (HTML + CSS + 바닐라 JS).

## 실행

```bash
cd /Users/sindongju/portfolio-web
python3 -m http.server 5173 --bind 127.0.0.1
```

→ http://127.0.0.1:5173

## 구조

```
index.html                  전체 마크업
assets/css/styles.css       Figma Variables를 CSS 변수로 옮긴 토큰 + 전체 스타일
assets/js/main.js           슬라이드 생성 / 모바일 메뉴 / Download / Contact
assets/img/                 Figma에서 내려받은 실제 에셋 (로고, 프로젝트 01 목업)
assets/slides/              프로젝트 02·03·04 상세 슬라이드 → README.md 참고
assets/docs/                이력서 PDF 넣는 곳
```

## 아직 채워야 할 것 (2개)

`assets/js/main.js` 상단 `CONFIG` 에 모여 있습니다.

| 항목 | 현재 값 | 할 일 |
|---|---|---|
| Contact 이메일 | `temporary@example.com` | 실제 주소로 교체 |
| 이력서 PDF | `assets/docs/resume.pdf` | 해당 경로에 파일 추가 |

그리고 프로젝트 상세 슬라이드 이미지 → `assets/slides/README.md` 참고.
폴더에 파일을 넣기만 하면 장수는 자동으로 인식합니다.

## 브레이크포인트

| | 범위 | Figma 프레임 |
|---|---|---|
| Desktop | ≥ 1280px | 215:73888 (1280, nav 250 + main 1030) |
| Tablet | 768–1279px | 215:74013 (800, nav 88px 상단 바) |
| Mobile | < 768px | 215:74138 (375, nav 48px + Open 패널) |
