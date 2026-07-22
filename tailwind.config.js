// @ts-check
/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				primary: {
					50: '#eff6ff',
					100: '#dbeafe',
					200: '#bfdbfe',
					300: '#93c5fd',
					400: '#60a5fa',
					500: '#3b82f6',
					600: '#2563eb',
					700: '#1d4ed8',
					800: '#1e40af',
					900: '#1e3a8a',
					950: '#172554',
				},
			},
			spacing: {
				4: '4px',
				8: '8px',
				16: '16px',
				24: '24px',
				32: '32px',
			},
			minHeight: {
				touch: '44px',
			},
			minWidth: {
				touch: '44px',
			},
		},
	},
	plugins: [],
};
