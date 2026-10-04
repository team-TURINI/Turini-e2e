import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const themeStart = cssSource.indexOf("/* My page —");
const profileTheme = cssSource.slice(themeStart);

test("마이 페이지는 포트폴리오와 같은 밝은 라임·크림 테마를 사용한다", () => {
  assert.ok(themeStart > 0, "마이 페이지 테마 규칙을 찾지 못했습니다");
  assert.match(profileTheme, /--profile-deep: #153d2d/);
  assert.match(profileTheme, /linear-gradient\(135deg, #edffdb 0%, #f6ffe8 52%, #fffbdc 100%\)/);
  assert.match(profileTheme, /grid-template-columns: minmax\(0, 1fr\) 176px/);
  assert.doesNotMatch(profileTheme, /linear-gradient\(145deg, var\(--profile-deep\)|#8a6726|#c89b35/);
});

test("프로필의 주요 카드와 모바일 탭이 밝은 초록 포인트로 연결된다", () => {
  assert.match(pageSource, /className="screen profile-screen"/);
  assert.match(profileTheme, /\.profile-screen \.profile-account-actions/);
  assert.match(profileTheme, /\.profile-screen \.profile-stats article/);
  assert.match(profileTheme, /\.profile-screen \.growth-summary article/);
  assert.match(profileTheme, /\.profile-screen \.turini-dress/);
  assert.match(profileTheme, /\.app-main:has\(\.profile-screen\) \.mobile-nav button\.active/);
  assert.match(profileTheme, /background: #eaf8ef/);
});

test("계정 버튼은 프로필 정보 중복 없이 마이페이지의 마지막 카드에 있다", () => {
  const profileStart = pageSource.indexOf('{view === "profile"');
  const profileEnd = pageSource.indexOf('<nav className="mobile-nav"', profileStart);
  const profileSource = pageSource.slice(profileStart, profileEnd);
  const badges = profileSource.indexOf("투리니 배지 컬렉션");
  const actions = profileSource.indexOf('className="card-block profile-account-actions"');
  assert.ok(actions > badges);
  assert.doesNotMatch(profileSource, /className="account-identity"|>ACCOUNT<|label="프로필 캐릭터"/);
  assert.match(profileSource, /onClick=\{logout\}/);
  assert.match(profileSource, /계정 초기화/);
});

