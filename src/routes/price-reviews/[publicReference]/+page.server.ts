import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { requestSubject } from '$lib/server/auth/http';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import {
	PRICE_REVIEW_ACCEPTANCE_TEXT,
} from '$lib/server/price-reviews/contracts';
import { PriceReviewServiceError } from '$lib/server/price-reviews/price-review-service';
import { requestPriceReviewRuntime } from '$lib/server/price-reviews/runtime';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	const runtime = requestPriceReviewRuntime(event);
	const item = await runtime.repository.getParentItem(event.params.publicReference, actor.id);
	if (!item)
		throw error(404, {
			code: 'PRICE_REVIEW_NOT_FOUND',
			message: translate('de', 'priceReviews.detail.notActionable'),
			requestId: event.locals.requestId,
		});
	const card = (await runtime.repository.listParentItems(actor.id)).find(
		(candidate) => candidate.publicReference === item.publicReference
	);
	return {
		item,
		courseName: card?.courseName ?? '',
		acceptanceText: PRICE_REVIEW_ACCEPTANCE_TEXT,
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		responseKey: crypto.randomUUID(),
	};
};

export const actions = {
	respond: async (event) => {
		try {
			const form = await event.request.formData();
			await requireCsrf({
				cookies: event.cookies,
				user: event.locals.user,
				submittedToken: form.get('_csrf')?.toString(),
			});
			const actor = requireParent(event.locals.user);
			await requestPriceReviewRuntime(event).service.respond({
				actor,
				payload: {
					publicReference: event.params.publicReference,
					itemHash: form.get('itemHash'),
					decision: form.get('decision'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
				requestSubject: requestSubject(event),
				userAgent: event.request.headers.get('user-agent') ?? 'unavailable',
			});
			return { success: true, message: translate('de', 'priceReviews.detail.responded') };
		} catch (caught) {
			return fail(
				caught instanceof PriceReviewServiceError &&
					caught.code === 'PRICE_REVIEW_ITEM_NOT_FOUND'
					? 404
					: 409,
				{
				success: false,
				message: translate('de', 'priceReviews.detail.rejected'),
				}
			);
		}
	},
} satisfies Actions;
