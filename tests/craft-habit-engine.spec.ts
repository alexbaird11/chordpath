import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('daily ring credits genuine reads but not the hear-it helper', async ({ page }) => {
  await page.evaluate(() => (window as any).simulateCorrect());
  await expect(page.locator('#dailyGoalCount')).toHaveText('0');
  await page.evaluate(() => eval('checkAnswer([...targetMidis], performance.now(), { genuine: true })'));
  await expect(page.locator('#dailyGoalCount')).toHaveText('1');
  await expect(page.locator('#dailyGoalRing')).toHaveCSS('--goal-pct', '5%');
});

test('habit state persists separately and recap reports this session', async ({ page }) => {
  await page.evaluate(() => eval('checkAnswer([...targetMidis], performance.now(), { genuine: true }); finishSession()'));
  await expect(page.locator('#sessionRecap')).toBeVisible();
  await expect(page.locator('#recapReads')).toHaveText('1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chordpath.habit.v1') || '{}'));
  expect(Object.keys(saved.days)).toHaveLength(1);
  expect(saved.sessions).toHaveLength(1);
});

test('streak tolerates one grace day', async ({ page }) => {
  const streak = await page.evaluate(() => {
    const w = window as any;
    const d = new Date();
    const key = (offset: number) => { const x = new Date(d); x.setDate(x.getDate() - offset); const p=(n:number)=>String(n).padStart(2,'0'); return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`; };
    w.Habit.state.days = { [key(0)]: { reads: 2 }, [key(2)]: { reads: 3 } };
    return w.Habit.streak();
  });
  expect(streak).toEqual({ count: 2, forgiven: true });
});
