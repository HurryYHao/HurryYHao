import { getLocalStorage } from './local-storage';

// 模拟 Supabase 客户端，实际使用本地存储
function getSupabaseClient(token?: string) {
  return getLocalStorage();
}

// 保留其他函数的空实现
function loadEnv(): void {
  // 不需要加载环境变量
}

function getSupabaseCredentials() {
  return { url: '', anonKey: '' };
}

function getSupabaseServiceRoleKey(): string | undefined {
  return undefined;
}

export { loadEnv, getSupabaseCredentials, getSupabaseServiceRoleKey, getSupabaseClient };
