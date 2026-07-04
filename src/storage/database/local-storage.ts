/**
 * 本地存储模块 - 已切换到 Supabase 数据库
 * 此文件仅做 re-export，保持向后兼容
 */
export { getStorage, getSupabaseClient, getLocalStorage, initDatabase, migrateFromLocalStorage, query, getDbPool, testConnection } from './supabase-client';
export type { DbResult } from './supabase-client';
