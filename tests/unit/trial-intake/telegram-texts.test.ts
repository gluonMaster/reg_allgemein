import { telegramParts } from '$lib/trial-intake/server/templates.server';
import type { IntakeDetail } from '$lib/trial-intake/server/model.server';

// The bureau notification as Telegram HTML (owner decision 2026-11-11).
const child = (id: string, first: string, last: string, birth: string) => ({
	id,
	request_id: 'r',
	position: 0,
	first_name: first,
	last_name: last,
	birth_date: birth,
});
type Child = ReturnType<typeof child>;
const item = (
	subject: string,
	group: string,
	date: string,
	weekday: number,
	children: Child[],
	extra: Record<string, string> = {}
) => ({
	id: `${subject}-item`,
	request_id: 'r',
	position: 1,
	lesson_id: 'lesson',
	desired_date: date,
	subject,
	group_name: group,
	weekday,
	start_time: '16:00',
	end_time: '16:50',
	teacher: 'Lehrkraft A',
	room: '3.3',
	building: 'Kolibri',
	children,
	...extra,
});

describe('trial-intake Telegram notification', () => {
	it('one lesson: headline, parent, child with age on the lesson date, lesson block', () => {
		const max = child('c1', 'Max', 'Muster', '2017-04-04');
		const detail = {
			request: {
				parent_first_name: 'Anna',
				parent_last_name: 'Muster',
				phone: '+4915100000000',
				email: 'anna@example.test',
			},
			children: [max],
			items: [item('Soroban-Abacus', 'Mathe', '2026-12-01', 2, [max])],
		} as unknown as IntakeDetail;
		expect(telegramParts(detail)).toEqual([
			[
				'🆕 <b>Neue Probestunde</b>',
				'',
				'👤 <b>Anna Muster</b>',
				'📞 +4915100000000',
				'✉️ anna@example.test',
				'',
				'🧒 <b>Max Muster</b>, 9 J. (04.04.2017)',
				'',
				'📚 <b>Soroban-Abacus</b> · Mathe',
				'📅 <b>Di, 01.12.2026, 16:00–16:50</b>',
				'👩‍🏫 Lehrkraft A · 📍 Raum 3.3, Kolibri',
			].join('\n'),
		]);
	});

	it('several lessons and children: names per lesson, the age warning, every typed value escaped', () => {
		const a = child('c1', 'Kim', 'A <b>&', '2019-01-01');
		const b = child('c2', 'Kim', 'Beta', '2021-06-01');
		const detail = {
			request: {
				parent_first_name: '<a href="https://evil.test">x</a>',
				parent_last_name: 'P&Q',
				phone: '+49 0',
				email: 'p@example.test',
			},
			children: [a, b],
			items: [
				item('Russisch', '1B', '2026-11-12', 4, [a]),
				item('Schach', 'Anfänger', '2026-11-14', 6, [a, b], {
					teacher: '',
					building: 'Villa',
				}),
			],
		} as unknown as IntakeDetail;
		const text = telegramParts(detail).join('\n');
		expect(text).toBe(
			[
				'🆕 <b>Neue Anfrage: 2 Probestunden</b>',
				'',
				'👤 <b>&lt;a href=&quot;https://evil.test&quot;&gt;x&lt;/a&gt; P&amp;Q</b>',
				'📞 +49 0',
				'✉️ p@example.test',
				'',
				'🧒 <b>Kim A &lt;b&gt;&amp;</b>, 7 J. (01.01.2019)',
				'🧒 <b>Kim Beta</b>, 5 J. (01.06.2021)',
				'',
				'📚 <b>Russisch</b> · 1B',
				'📅 <b>Do, 12.11.2026, 16:00–16:50</b>',
				'👩‍🏫 Lehrkraft A · 📍 Raum 3.3, Kolibri',
				'🧒 Kim A &lt;b&gt;&amp;',
				'⚠️ <b>Kim A &lt;b&gt;&amp; ist älter als die Gruppe (5–6 Jahre)</b> · Hinweis bestätigt',
				'',
				'📚 <b>Schach</b> · Anfänger',
				'📅 <b>Sa, 14.11.2026, 16:00–16:50</b>',
				'📍 Raum 3.3, Villa',
				'🧒 Kim A &lt;b&gt;&amp;, Kim Beta',
			].join('\n')
		);
		expect(text).not.toContain('<a');
		// Each line closes its own tags, so a split by lines leaves every part valid.
		for (const line of text.split('\n'))
			expect(line.split('<b>').length).toBe(line.split('</b>').length);
	});
});
