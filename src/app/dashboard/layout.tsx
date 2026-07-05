'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useMonitor } from '@/components/dashboard/monitor-provider';
import { MonitorProvider } from '@/components/dashboard/monitor-provider';
import {
  BarChart3, Monitor, FileText, Settings, Activity, Radio, Pause, Play, Brain, Bell, Users, Package, AlertTriangle, Terminal
} from 'lucide-react';

const navigation = [
  { name: '概览', href: '/dashboard', icon: BarChart3 },
  { name: '数据大盘', href: '/dashboard/live', icon: Activity },
  { name: '实时预警', href: '/dashboard/alerts', icon: Bell },
  { name: '商品作战卡', href: '/dashboard/products', icon: Package },
  { name: '主播画像', href: '/dashboard/anchors', icon: Users },
  { name: '分析报告', href: '/dashboard/reports', icon: FileText },
  { name: '知识库', href: '/dashboard/knowledge', icon: Brain },
  { name: '系统日志', href: '/dashboard/logs', icon: Terminal },
  { name: '系统设置', href: '/dashboard/settings', icon: Settings },
];

function SidebarStatus() {
  const { polling, togglePolling, lastPollTime, activeSessions, liveRoomCount, nextRefreshIn } = useMonitor();
  return (
    <div className="absolute bottom-6 left-0 right-0 px-4 space-y-3">
      {/* Polling control */}
      <button
        type="button"
        onClick={togglePolling}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors',
          polling
            ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {polling ? (
          <>
            <Radio className="h-4 w-4 animate-pulse" />
            <span className="flex-1 text-left">监控轮询中</span>
            <Pause className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            <span className="flex-1 text-left">启动监控</span>
          </>
        )}
      </button>

      {/* Status info */}
      <div className="space-y-1.5 px-1">
        {polling && lastPollTime && (
          <p className="text-[11px] text-muted-foreground">
            {nextRefreshIn}s后刷新 · {lastPollTime.toLocaleTimeString('zh-CN')}
          </p>
        )}
        {(liveRoomCount > 0 || activeSessions.length > 0) && (
          <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            {liveRoomCount > 0 ? `${liveRoomCount} 场直播中` : `${activeSessions.length} 场录制中`}
          </p>
        )}
        {!polling && liveRoomCount === 0 && activeSessions.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            当前无活跃直播
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { activeSessions, polling, liveRoomCount, nextRefreshIn } = useMonitor();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-2 px-6 border-b border-border">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold text-foreground">
            AI 直播分析
          </span>
        </div>
        <nav className="mt-6 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Global polling status (persistent across pages) */}
        <SidebarStatus />
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card/80 backdrop-blur-sm px-6">
          <button
            type="button"
            className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />
          {/* 直播监控中标识 */}
          {(liveRoomCount > 0 || activeSessions.length > 0) && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-sm font-medium text-red-600">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              直播监控中 · {Math.max(liveRoomCount, activeSessions.length)}场
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-block h-2 w-2 rounded-full ${polling ? 'bg-green-500' : 'bg-yellow-500'}`} />
            {polling ? `${nextRefreshIn}s后刷新` : '监控暂停'}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MonitorProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </MonitorProvider>
  );
}
