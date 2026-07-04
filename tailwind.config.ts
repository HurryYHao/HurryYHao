import type { Config } from 'tailwindcss';

const config: Config = {
  // 明确指定内容路径
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  
  theme: {
    extend: {},
  },
  
  plugins: [],
};

export default config;