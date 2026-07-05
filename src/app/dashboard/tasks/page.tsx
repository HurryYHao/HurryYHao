'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Clock, User, Calendar, MoreHorizontal, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Task {
  id: number;
  sessionId: number;
  reportId: number;
  anchorName: string | null;
  dimension: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  assignee: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'auto_verified' | 'failed';
  dueDate: string | null;
  verifiedResult: string | null;
  createdAt: string;
  liveSessions?: {
    roomName: string;
  };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchTasks();
  }, [filterStatus]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/tasks', window.location.origin);
      if (filterStatus !== 'all') {
        url.searchParams.set('status', filterStatus);
      }
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setTasks(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-600 border-red-200';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-200';
      case 'low': return 'bg-green-500/10 text-green-600 border-green-200';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-slate-100 text-slate-600">待处理</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">进行中</Badge>;
      case 'done':
        return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">已完成</Badge>;
      case 'auto_verified':
        return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">系统验证通过</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">未达标</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDimensionLabel = (dim: string) => {
    const map: Record<string, string> = {
      'anchor': '主播话术',
      'interaction': '互动热度',
      'conversion': '商品转化',
      'sentiment': '评论舆情',
      'rhythm': '直播节奏',
      'general': '综合建议'
    };
    return map[dim] || dim;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">复盘任务与改进</h1>
          <p className="text-muted-foreground mt-2">
            基于 AI 分析自动生成的行动建议，形成“发现问题 → 制定任务 → 下场验证”的业务闭环。
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'pending' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            待处理
          </button>
          <button
            onClick={() => setFilterStatus('done')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'done' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            已完成
          </button>
          <button
            onClick={() => setFilterStatus('auto_verified')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'auto_verified' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            系统验证通过
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckSquare className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <p>当前没有复盘任务记录</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <Card key={task.id} className="flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="secondary" className="font-normal">
                    {getDimensionLabel(task.dimension)}
                  </Badge>
                  {getStatusBadge(task.status)}
                </div>
                <CardTitle className="text-base leading-snug">
                  {task.title}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col">
                <div className="text-sm text-muted-foreground mb-4 line-clamp-3 flex-1">
                  {task.description}
                </div>
                
                <div className="space-y-2 text-xs text-muted-foreground mt-auto pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>{task.anchorName || '所有主播'}</span>
                    </div>
                    <Badge variant="outline" className={getPriorityColor(task.priority)}>
                      {task.priority === 'high' ? '高优先级' : task.priority === 'medium' ? '中优先级' : '低优先级'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>来源场次: {task.liveSessions?.roomName || `Session #${task.sessionId}`}</span>
                    </div>
                    <span>{format(new Date(task.createdAt), 'MM-dd', { locale: zhCN })}</span>
                  </div>

                  {task.verifiedResult && (
                    <div className="mt-3 p-2 bg-muted rounded-md text-foreground">
                      <span className="font-medium text-purple-600 block mb-1">验证结果:</span>
                      {task.verifiedResult}
                    </div>
                  )}
                </div>

                {task.status === 'pending' && (
                  <div className="mt-4 pt-4 border-t flex gap-2">
                    <button 
                      onClick={() => handleUpdateStatus(task.id, 'done')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-md hover:bg-primary/20 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> 标记完成
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}