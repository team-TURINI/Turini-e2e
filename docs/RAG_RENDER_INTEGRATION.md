# Render 웹 ↔ Cloud Run RAG 연결

## 구성

홈 화면의 ‘금융 개념 물어보기’에서 질문한다. 포트폴리오 화면은 규칙 엔진 결과와 전용 AI 코치만 제공한다. 브라우저는 같은 출처의 `/api/chat`만 호출한다. Next.js 서버가 세션 쿠키로 사용자를 식별하고 Neon DB의 대화 state와 저장된 포트폴리오를 조회한 뒤 Cloud Run `/chat`에 보낸다.

Cloud Run 응답의 `state`는 다음 턴 입력용으로 저장하고, `messages` 2개는 기존 전체 대화 내역에 추가한다. 전체 내역과 요약된 state를 따로 유지하므로 오래된 대화도 화면에서 다시 볼 수 있다. 브라우저가 보낸 user_id/state/portfolio는 사용하지 않는다.

현재 Cloud Run:

```text
https://turini-rag-941433084012.asia-northeast3.run.app
```

## Render Environment

기존 DATABASE_URL, OPENAI_API_KEY, OPENAI_MODEL은 유지한다. 다음 두 항목을 추가한다.

| 변수 | 값 |
|---|---|
| RAG_API_URL | 위 Cloud Run URL |
| RAG_API_KEY | GCP Secret Manager의 RAG_API_KEY 버전 1과 동일한 값 |

Render 서버는 `X-API-Key`만 전송한다. 서비스 계정 JSON과 `GCP_SA_KEY`는 필요하지 않다. 이 변수에 NEXT_PUBLIC_ 접두사를 붙이지 않는다.

리버스 프록시가 별도 설정되어 있다면 APP_ORIGIN을 실제 웹 출처(예: https://turini-web-fx5q.onrender.com)로 지정한다. 기본값은 Render가 전달하는 forwarded host/proto를 사용한다.

## GCP 인증 경계

조직 정책 `iam.disableServiceAccountKeyCreation`을 유지한다. 사용자가 승인한 API-key-only 방식에 따라 Cloud Run `turini-rag` 서비스의 호출 권한을 allUsers에 부여한다. 다른 서비스와 조직 정책은 변경하지 않는다. 서비스 URL은 공개되지만 `/chat`은 GCP Secret Manager에서 주입된 `RAG_API_KEY`와 헤더가 일치해야 호출할 수 있다. `/health` 및 기본 API 문서 경로는 공개된다.

IAM 인증이라는 추가 보호 계층은 제거된다. 키 유출 시 웹 로그인/분당 제한을 우회해 RAG를 직접 호출할 수 있으므로 키는 서버 비밀 환경변수로만 관리하고 유출 시 GCP와 Render에서 함께 교체해야 한다. Cloud Run의 `RAG_API_KEY`가 누락되지 않도록 유지한다(현재 API 코드는 키 미설정 시 인증을 강제하지 않는다).

기존 app-caller 계정과 그 권한은 삭제하지 않았지만 현재 웹에서는 사용하지 않는다. 서비스 계정 키는 생성하지 않았다.

## DB 변경

기존 ensureSchema가 로그인 시 다음 테이블을 없을 때만 생성한다.

- turini_rag_conversations: 사용자, 제목, state, 전체 messages, 요청 lease
- turini_rag_rate: 사용자별 분당 요청 제한

사용자 삭제 시 두 테이블의 해당 사용자 데이터도 FK cascade로 삭제된다. 모든 대화 조회·수정은 user_id를 조건으로 사용한다. 대화별 DB lease로 여러 웹 인스턴스에서도 동시 턴의 state 덮어쓰기를 막는다. 사용자별 분당 10회 요청 제한을 적용한다.

포트폴리오의 비중은 저장된 0~1 값을 사용한다. 국내주식/해외주식/채권/주식형 ETF·펀드/현금성자산/금 6종과 입력 구분, 투자금액, 목적, 기간을 보존한다. 합계가 1이 아니거나 데이터가 없으면 portfolio=null을 보내며 RAG의 portfolio_required 경로를 따른다. 아직 저장되지 않은 화면 입력은 전달하지 않는다.

## 배포와 확인

1. 코드 검토 후 GitHub의 Render 연결 브랜치에 반영한다.
2. Render에 위 2개 환경변수를 등록한다.
3. `npm ci && npm run build`, `npm start`로 배포한다.
4. 로그인 후 홈의 금융 개념 채팅에서 ‘주식과 채권은 뭐가 달라?’처럼 한 개념씩 질문한다. 질문 말풍선이 즉시 나타나고 답변 전까지 점 3개 입력 표시가 보이는지 확인한다.
5. 다른 탭/기기로 이동 후 지난 대화를 선택해 전체 내역과 후속 문맥이 유지되는지 확인한다.
6. 다른 계정에는 해당 대화가 보이지 않는지 확인한다.
7. 실제 포트폴리오를 저장한 뒤 서버 요청에 6개 비중·금액·목적·기간이 함께 들어가는지 확인한다. 개인 비중과 조정안은 포트폴리오 화면의 AI 코치 결과로 확인한다.

새 대화는 기존 대화를 지우지 않는다. UI에 모델의 검색 chunk, state, 인증 정보는 공개하지 않는다. 상류 401은 RAG_API_KEY 불일치, 403은 Cloud Run 공개 호출 권한을 점검하고, 503은 서비스 준비 상태를 확인한다. API 오류 본문에는 키가 포함될 수 있어 로그나 브라우저에 그대로 전달하지 않는다.

## 검증 범위

코드 검증은 유료 모델 호출 없이 수행한다. 실제 Render 환경변수 입력, 운영 DB 테이블 생성, 로그인 상태에서의 RAG 턴 왕복은 운영 배포 후 별도 확인이 필요하다. 이 문서의 준비 절차만으로 Render 배포 완료를 의미하지 않는다.

