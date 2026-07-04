import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export type UserRole = 'super_admin' | 'ops_admin' | 'anchor' | 'readonly' | 'auditor';

export interface UserSession {
  userId: string;
  role: UserRole;
  anchorName?: string;
}

// 模拟获取当前用户会话
// 在实际系统中，这应该从 JWT、Session Cookie 或其他身份验证机制中获取
export async function getCurrentUser(request: Request): Promise<UserSession | null> {
  // 简化的模拟实现
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return { userId: 'guest', role: 'readonly' };
  
  // 模拟不同角色
  if (authHeader.includes('super_admin')) return { userId: 'admin_1', role: 'super_admin' };
  if (authHeader.includes('ops_admin')) return { userId: 'ops_1', role: 'ops_admin' };
  if (authHeader.includes('anchor')) return { userId: 'anchor_1', role: 'anchor', anchorName: '雅文老师' };
  if (authHeader.includes('auditor')) return { userId: 'audit_1', role: 'auditor' };
  
  return { userId: 'guest', role: 'readonly' };
}

// 权限检查辅助函数
export function hasPermission(user: UserSession | null, requiredRole: UserRole | UserRole[]): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(user.role);
  }
  return user.role === requiredRole;
}

// 审计日志记录
export async function logAudit(
  user: UserSession | null, 
  action: string, 
  resourceType?: string, 
  resourceId?: string, 
  details?: any,
  request?: Request
) {
  try {
    const client = getSupabaseClient();
    let ipAddress = 'unknown';
    
    if (request) {
      ipAddress = request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  'unknown';
    }

    await client.from('audit_logs').insert({
      user_id: user?.userId || 'system',
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details ? JSON.stringify(details) : null,
      ip_address: ipAddress
    });
  } catch (e) {
    console.error('Failed to log audit event', e);
  }
}

// 封装鉴权中间件
export function withAuth(
  handler: (request: Request, user: UserSession) => Promise<NextResponse>,
  allowedRoles?: UserRole[]
) {
  return async (request: Request) => {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    if (allowedRoles && allowedRoles.length > 0 && !hasPermission(user, allowedRoles)) {
      await logAudit(user, 'access_denied', 'api', new URL(request.url).pathname, { required: allowedRoles });
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    
    return handler(request, user);
  };
}