import { expect, test, type Page } from '@playwright/test';
import { PERSON_TOKEN, SHARED_TOKEN } from './seed.ts';

/**
 * Opens the app as Andi with the seeded login token. The login form has a rate limit, so only the login tests use
 * it.
 *
 * @param page the page
 */
async function login(page: Page): Promise<void> {
    await page.addInitScript((token) => localStorage.setItem('chores.token', token), PERSON_TOKEN);
    await page.goto('/');
    await expect(page.locator('.task').first()).toBeVisible();
}

test.beforeEach(async ({ request }) => {
    await request.post('/__test/reset');
});

test('logs in and shows the suggestions', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Name').fill('Andi');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Wrong name or password')).toBeVisible();

    await page.getByLabel('Password').fill('andi-pw');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.badge')).toHaveText(['Andi']);
    await expect(page.locator('.badge')).toHaveCSS('background-color', 'rgb(47, 111, 219)');
    await expect(page.getByText('up to 120 min, energy 5')).toBeVisible();
    await expect(page.locator('.task h2')).toHaveText(['Kühlschrank auswischen', 'Spiegel putzen', 'Fußboden wischen']);
    await expect(page.locator('.task').nth(2).getByText('Also possible')).toBeVisible();
});

test('marks a suggestion as done and taps necessary earlier', async ({ page, request }) => {
    await login(page);
    const card = page.locator('.task').filter({ hasText: 'Fußboden wischen' });
    const dialog = page.getByRole('dialog');
    await card.getByRole('button', { name: 'Done' }).click();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog.getByText('Done. Thank you!')).toBeVisible();
    await dialog.getByRole('button', { name: 'Was necessary earlier' }).click();
    await expect(dialog.getByText('Noted. The chore comes back sooner.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.task h2')).toHaveText(['Kühlschrank auswischen', 'Spiegel putzen']);

    const late = page.locator('.task').filter({ hasText: 'Kühlschrank auswischen' });
    await late.getByRole('button', { name: 'Done' }).click();
    await expect(dialog.getByText('Done. Thank you!')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Was necessary earlier' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.task h2')).toHaveText(['Spiegel putzen']);

    const token = await page.evaluate(() => localStorage.getItem('chores.token'));
    const res = await request.get('/api/chores?q=Fußboden', { headers: { authorization: `Bearer ${token}` } });
    const { chores } = await res.json() as { chores: { interval: number; categoryIds: number[]; lastDoneAt: number }[] };
    expect(chores.map((c) => c.interval).sort()).toEqual([5.95, 7]);
    expect(chores.every((c) => Date.now() - c.lastDoneAt < 60_000)).toBe(true);
});

test('shows the notes and opens the chore from a suggestion', async ({ page }) => {
    await login(page);
    const card = page.locator('.task').filter({ hasText: 'Kühlschrank auswischen' });
    const notes = card.locator('details.notes');
    await expect(notes.locator('summary')).toHaveText('Alles ausräumen und mit Essigwasser auswischen.');
    await expect(notes.getByText('Dichtung nicht vergessen.')).toBeHidden();
    await notes.locator('summary').click();
    await expect(notes.getByText('Dichtung nicht vergessen.')).toBeVisible();

    await card.getByRole('button', { name: 'Edit chore' }).click();
    await expect(page).toHaveURL(/\/chores\/\d+$/);
    await expect(page.getByLabel('Name')).toHaveValue('Kühlschrank auswischen');
});

test('postpones a suggestion with a reason', async ({ page }) => {
    await login(page);
    const card = page.locator('.task').filter({ hasText: 'Spiegel putzen' });
    await card.getByRole('button', { name: 'Later' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'No energy' }).click();
    await expect(page.locator('.task h2')).toHaveText(['Kühlschrank auswischen', 'Fußboden wischen']);

    await page.getByRole('link', { name: 'Chores' }).click();
    const row = page.locator('.task').filter({ hasText: 'Spiegel putzen' });
    await expect(row).toContainText('paused until');

    await row.getByRole('button', { name: 'Later' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('opens the tablet mode with the shared token URL', async ({ page }) => {
    await page.goto(`/?token=${SHARED_TOKEN}`);
    await expect(page.locator('.task').first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(page.url()).not.toContain('token');
    await expect(page.locator('html')).toHaveClass(/tablet/);
    await expect(page.locator('.badge')).toHaveText(['Andi', 'Kaddi']);
    await expect(page.locator('.badge').last()).toHaveCSS('background-color', 'rgb(224, 123, 26)');
    await expect(page.locator('.nav a')).toHaveText(['Now', 'Chores']);
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit chore' })).toHaveCount(0);
    await expect(page.locator('.task h2 a')).toHaveCount(0);
    await expect(page.locator('.task details.notes')).toBeVisible();

    await page.goto('/settings');
    await expect(page.locator('.task').first()).toBeVisible();
    await page.getByRole('link', { name: 'Chores' }).click();
    await expect(page.getByRole('button', { name: 'New chore' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).first().click();
    await expect(page.getByRole('dialog').getByText('Done. Thank you!')).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/tablet/);
});

test('groups the chore list by category or by group key', async ({ page }) => {
    await login(page);
    await page.goto('/chores');
    await expect(page.locator('.chores > section > h2')).toHaveText(['Küche', 'Bad', 'Without category']);
    await page.getByLabel('Grouping').selectOption('groupKey');
    await expect(page.locator('.chores > section > h2')).toHaveText(['fussboden-wischen', 'Without group key']);
    await expect(page.locator('.chores section').first().locator('.task h2')).toHaveText(['Fußboden wischen', 'Fußboden wischen']);
    await expect(page.locator('.chores section').first().locator('.related').first()).toContainText('Fußboden wischen (Bad)');
});

test('creates and edits a chore in the form', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Chores' }).click();
    await page.getByRole('button', { name: 'New chore' }).click();
    await page.getByLabel('Name').fill('Backofen reinigen');
    await page.getByRole('button', { name: 'Küche' }).click();
    await page.getByLabel('Growth').selectOption('time');
    await page.getByLabel('Interval (days)').fill('60');
    await page.getByLabel('Duration (minutes)').fill('45');
    await page.getByRole('radio', { name: 'Effort 4 of 5' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/chores$/);
    const row = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Küche' }) })
        .locator('.task').filter({ hasText: 'Backofen reinigen' });
    await expect(row).toBeVisible();

    await row.getByRole('link', { name: 'Backofen reinigen' }).click();
    await expect(page.getByRole('heading', { name: 'Edit chore' })).toBeVisible();
    await expect(page.getByLabel('Minimum interval')).toHaveValue('7.5');
    await expect(page.getByRole('radio', { name: 'Effort 4 of 5' })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Name').fill('Backofen gründlich reinigen');
    await page.getByRole('button', { name: 'Kaddi' }).click();
    const season = page.getByRole('group', { name: 'Season' });
    await expect(season.getByText('Whole year')).toBeVisible();
    for (const month of ['May', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']) await season.getByRole('button', { name: month }).click();
    await expect(season.getByText('Season May, Nov–Mar')).toBeVisible();
    await season.getByRole('button', { name: 'Mar' }).click();
    await expect(season.getByText('Season May, Nov–Feb')).toBeVisible();
    await expect(season.getByRole('button', { name: 'Jan' })).toHaveAttribute('aria-pressed', 'true');
    await expect(season.getByRole('button', { name: 'Mar' })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Save' }).click();
    const card = page.locator('.task').filter({ hasText: 'Backofen gründlich reinigen' });
    await expect(card.locator('.flag[title="Season May, Nov–Feb"]')).toBeVisible();
});

test('creates a condition and uses it in a chore', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Conditions' }).click();
    const form = page.locator('form.condition').last();
    await form.getByLabel('Name').fill('Trocken');
    await form.getByLabel('Template').fill('{{ is_state("sensor.rain", "off") }}');
    await form.getByRole('button', { name: 'Select icon' }).click();
    await form.getByLabel('Search icon').fill('weather-sunny');
    await form.getByLabel('Search icon').press('Enter');
    await form.getByRole('button', { name: 'weather-sunny', exact: true }).click();
    await form.getByRole('button', { name: 'Add condition' }).click();
    const created = page.locator('form.condition').first();
    await expect(created.getByLabel('Name')).toHaveValue('Trocken');
    await expect(created.getByRole('button', { name: 'Select icon' })).toHaveAttribute('title', 'weather-sunny');
    await expect(created.getByText('Current result: no result')).toBeVisible();
    await expect(created.getByText('Used by 0 chores')).toBeVisible();

    await page.goto('/chores');
    await page.getByRole('link', { name: 'Spiegel putzen' }).click();
    await page.getByRole('combobox', { name: /^Condition/ }).selectOption({ label: 'Trocken' });
    await expect(page.getByText('Current result: no result')).toBeVisible();
    await expect(page.getByLabel('Forecast condition').locator('option')).toHaveText(['–']);
    await page.getByRole('button', { name: 'Save' }).click();
    const row = page.locator('.task').filter({ hasText: 'Spiegel putzen' });
    await expect(row).toContainText('condition');
    await expect(row.locator('.flag[title="Trocken"] path')).toHaveAttribute('d', /^M/);

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Conditions' }).click();
    await expect(page.getByText('Used by 1 chores')).toBeVisible();
    await page.locator('form.condition').first().getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Chores use the condition')).toBeVisible();
});

test('sets the icon of a category and the color of a person', async ({ page }) => {
    await login(page);
    const card = page.locator('.task').filter({ hasText: 'Spiegel putzen' });
    await expect(card.locator('.stripe')).toHaveAttribute('title', 'Assigned: anybody');
    await expect(card.locator('.room[title="Bad"] path')).toHaveAttribute('d', /^M/);

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Categories' }).click();
    const garden = page.locator('.categories-list li').nth(2);
    await garden.getByRole('button', { name: 'Select icon' }).click();
    await garden.getByLabel('Search icon').fill('flower');
    await garden.getByRole('button', { name: 'flower', exact: true }).click();
    await expect(garden.getByRole('button', { name: 'Select icon' })).toHaveAttribute('title', 'flower');

    await page.getByRole('tab', { name: 'Persons' }).click();
    const andi = page.locator('form.person').first();
    await expect(andi.getByLabel('Color')).toHaveValue('#2f6fdb');
    await andi.getByLabel('Color').fill('#123456');
    await andi.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('form.person').first().getByLabel('Color')).toHaveValue('#123456');
    await expect(page.locator('form.person').last().getByLabel('Color')).toHaveCount(0);

    await page.getByRole('link', { name: 'Chores' }).click();
    const windows = page.locator('.task').filter({ hasText: 'Fenster putzen' });
    await expect(windows.locator('.stripe')).toHaveAttribute('title', 'Assigned: Andi, Kaddi');
    await expect(windows.locator('.stripe')).toHaveAttribute('style', /repeating-linear-gradient.*#123456.*#e07b1a/);
    await expect(windows.locator('.flag[title="Noisy"]')).toBeVisible();
});

test.describe('German browser', () => {
    test.use({ locale: 'de-DE' });

    test('shows the German texts', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
        await page.getByLabel('Name').fill('Andi');
        await page.getByLabel('Passwort').fill('andi-pw');
        await page.getByRole('button', { name: 'Anmelden' }).click();
        await expect(page.locator('.nav a')).toHaveText(['Jetzt', 'Aufgaben', 'Ausblick', 'Einstellungen']);
        await expect(page.getByRole('button', { name: 'Erledigt' }).first()).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'de');
        await expect(page).toHaveTitle('Chores');
    });
});

test('creates and revokes a device token', async ({ page, browser }) => {
    await login(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Devices and tokens' }).click();
    await page.getByLabel('Label').fill('Küchentablet');
    await page.getByRole('button', { name: 'Create device token' }).click();
    const url = await page.locator('.created-token code').textContent();
    expect(url).toMatch(/\/\?token=/);

    const tablet = await browser.newPage();
    await tablet.goto(url!);
    await expect(tablet.locator('html')).toHaveClass(/tablet/);

    await page.locator('tr').filter({ hasText: 'Küchentablet' }).getByRole('button', { name: 'Revoke' }).click();
    await expect(page.locator('tr').filter({ hasText: 'Küchentablet' })).toContainText('revoked');

    await tablet.reload();
    await expect(tablet).toHaveURL(/\/login$/);
    await tablet.close();
});

test('is an installable PWA', async ({ page, request }) => {
    await page.goto('/login');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(`/${manifestHref!.replace(/^\//, '')}`)).json() as {
        name: string; display: string; icons: { sizes: string }[] };
    expect(manifest).toMatchObject({ name: 'Chores', display: 'standalone' });
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png']) {
        expect((await request.get(icon)).headers()['content-type']).toBe('image/png');
    }

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    const api = await page.evaluate(async () => {
        const r = await fetch('/api/health');
        return r.headers.get('content-security-policy');
    });
    expect(api).toBe("frame-ancestors 'self' https://ha.example.org");
});
