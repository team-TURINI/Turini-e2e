import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const themeStart = cssSource.indexOf("/* My page —");
const profileTheme = cssSource.slice(themeStart);

test("마이 페이지는 딥그린·골드 전용 테마를 사용한다", () => {
  assert.ok(themeStart > 0, "마이 페이지 테마 규칙을 찾지 못했습니다");
  assert.match(profileTheme, /--profile-deep: #123c2c/);
  assert.match(profileTheme, /--profile-gold: #d2a640/);
  assert.match(profileTheme, /linear-gradient\(135deg, #0f3528 0%, #194f39 60%, #3e5d3d 100%\)/);
  assert.doesNotMatch(profileTheme, /#ffe3e6|#ffe8e4|#ffdfe3/);
});

test("프로필의 주요 카드와 모바일 탭이 한 테마로 연결된다", () => {
  assert.match(pageSource, /className="screen profile-screen"/);
  assert.match(profileTheme, /\.profile-screen \.account-card/);
  assert.match(profileTheme, /\.profile-screen \.profile-stats article/);
  assert.match(profileTheme, /\.profile-screen \.growth-summary article/);
  assert.match(profileTheme, /\.profile-screen \.turini-dress/);
  assert.match(profileTheme, /\.app-main:has\(\.profile-screen\) \.mobile-nav button\.active/);
});

