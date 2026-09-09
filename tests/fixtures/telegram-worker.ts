import { TelegramProviderError } from '../../src/lib/server/outbox/providers';
import { TelegramBotApiProvider } from '../../src/lib/server/telegram/bot-api';

export default {
	async fetch(request: Request): Promise<Response> {
		const provider = new TelegramBotApiProvider({
			token: `123456:${'A'.repeat(30)}`,
			chatId: '-1001234567890',
			chatType: 'channel',
		});
		try {
			const result =
				new URL(request.url).pathname === '/preflight'
					? await provider.preflight()
					: await provider.send({
							chatId: '-1001234567890',
							deliveryReference: 'TG-ABCDEF012345',
							text: 'Neue Portal-Mitteilung. Zustellreferenz: TG-ABCDEF012345.',
						});
			return Response.json(result);
		} catch (error) {
			if (!(error instanceof TelegramProviderError)) throw error;
			return Response.json(
				{
					code: error.code,
					retryable: error.retryable,
					delivery: error.options.delivery,
				},
				{ status: 502 }
			);
		}
	},
};
