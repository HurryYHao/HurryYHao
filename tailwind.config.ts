import type { Config } from 'tailwindcss';

const config: Config = {
  // 明确指定内容路径
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  
  // 明确指定项目根目录（避免根目录/package.json干扰）
  root: '/workspace/projects',
  
  theme: {
    extend: {},
  },
  
  plugins: [],
};

export default config;