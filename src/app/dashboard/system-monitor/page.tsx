'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Cpu, AlertTriangle, BarChart3, Activity, PlayCircle, RotateCcw,
  CheckCircle, XCircle, Clock, FileText, Server
} from 'lucide-react';

interface MonitorIssue {
  id: number;
  issue_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  module: string;
  title: string;
  description?: string;
  occurrence_count: number;
  status: 'open' | 'investigating' | 'resolved' | 'ignored';
  created_at: string;
  last_occurred_at: string;
}

interface HealthCheck {
  id: number;
  check_type: string;
  check_name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  created_at: string;
}

interface TestRun {
  id: number;
  test_case_id: string;
  test_name: string;
  test_type: string;
  test_module: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  created_at: string;
}

interface ResourceUsage {
  id: number;
  cpu_usage_percent?: string;
  memory_usage_percent?: string;
  disk_usage_percent?: string;
  created_at: string;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles = {
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    critical: 'bg-purple-100 text-purple-800'
  };
  
  const labels = {
    info: '信息',
    warning: '警告',
    error: '错误',
    critical: '严重'
  };

  return (
    <Badge className={styles[severity as keyof typeof styles] || 'bg-gray-100 text-gray-800'}>
      {labels[severity as keyof typeof labels] || severity}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    healthy: 'bg-green-100 text-green-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    unhealthy: 'bg-red-100 text-red-800',
    passed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    skipped: 'bg-gray-100 text-gray-800'
  };
  
  const labels = {
    healthy: '健康',
    degraded: '降级',
    unhealthy: '异常',
    passed: '通过',
    failed: '失败',
    skipped: '跳过'
  };

  return (
    <Badge className={styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}>
      {labels[status as keyof typeof labels] || status}
    </Badge>
  );
}

export default function SystemMonitorPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [issues, setIssues] = useState<MonitorIssue[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [resourceUsages, setResourceUsages] = useState<ResourceUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 并行获取所有数据
      const [issuesRes, healthRes, testsRes, resourcesRes] = await Promise.all([
        fetch('/api/monitor/issues?pageSize=20'),
        fetch('/api/monitor/health'),
        fetch('/api/monitor/tests?pageSize=20'),
        fetch('/api/monitor/resources?limit=50')
      ]);

      if (issuesRes.ok) {
        const data = await issuesRes.json();
        setIssues(data.data?.issues || []);
      }
      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealthChecks(data.data?.recent || []);
      }
      if (testsRes.ok) {
        const data = await testsRes.json();
        setTestRuns(data.data?.testRuns || []);
      }
      if (resourcesRes.ok) {
        const data = await resourcesRes.json();
        setResourceUsages(data.data || []);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runHealthCheck = async () => {
    try {
      const res = await fetch('/api/monitor/health', { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Run health check error:', error);
    }
  };

  const runTests = async () => {
    try {
      const res = await fetch('/api/monitor/tests', { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Run tests error:', error);
    }
  };

  const generateReport = async () => {
    try {
      const res = await fetch('/api/monitor/reports', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'daily' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.id) {
          alert('报告生成成功！');
        }
      }
    } catch (error) {
      console.error('Generate report error:', error);
    }
  };

  // 计算统计数据
  const stats = {
    openIssues: issues.filter(i => i.status === 'open').length,
    criticalIssues: issues.filter(i => i.severity === 'critical' && i.status === 'open').length,
    healthyChecks: healthChecks.filter(h => h.status === 'healthy').length,
    passedTests: testRuns.filter(t => t.status === 'passed').length
  };

  const latestResources = resourceUsages[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">系统监控</h1>
          <p className="text-muted-foreground mt-1">监控系统运行状态，自动化问题检测与记录</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              待处理问题
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold">{stats.openIssues}</div>
              {stats.criticalIssues > 0 && (
                <Badge variant="destructive">
                  {stats.criticalIssues} 个严重
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              健康检查
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold">{stats.healthyChecks}</div>
              <div className="text-sm text-muted-foreground">/ {healthChecks.length}</div>
              <Button size="sm" onClick={runHealthCheck} variant="outline">
                检查
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              测试通过
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold">{stats.passedTests}</div>
              <div className="text-sm text-muted-foreground">/ {testRuns.length}</div>
              <Button size="sm" onClick={runTests} variant="outline">
                运行
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              资源使用
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {latestResources && (
                <>
                  <div className="flex justify-between text-sm">
                    <span>CPU</span>
                    <span>{latestResources.cpu_usage_percent || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>内存</span>
                    <span>{latestResources.memory_usage_percent || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>磁盘</span>
                    <span>{latestResources.disk_usage_percent || 'N/A'}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            概览
          </TabsTrigger>
          <TabsTrigger value="issues" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            问题记录
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            健康检查
          </TabsTrigger>
          <TabsTrigger value="tests" className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            测试用例
          </TabsTrigger>
          <TabsTrigger value="resources" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            资源使用
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  最近问题
                  <Button size="sm" variant="outline" onClick={generateReport}>
                    <FileText className="h-4 w-4 mr-2" />
                    生成报告
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {issues.slice(0, 10).map(issue => (
                    <div key={issue.id} className="p-3 rounded-lg border bg-card flex items-start gap-3">
                      <SeverityBadge severity={issue.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{issue.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {issue.module} · {issue.occurrence_count} 次 · {new Date(issue.last_occurred_at).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  ))}
                  {issues.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">暂无问题记录</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">系统健康状态</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {healthChecks.slice(0, 10).map(check => (
                    <div key={check.id} className="p-3 rounded-lg border bg-card flex items-center justify-between">
                      <div>
                        <p className="font-medium">{check.check_name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(check.created_at).toLocaleString('zh-CN')}</p>
                      </div>
                      <StatusBadge status={check.status} />
                    </div>
                  ))}
                  {healthChecks.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">暂无健康检查记录</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {issues.map(issue => (
                  <div key={issue.id} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <SeverityBadge severity={issue.severity} />
                        <Badge variant="outline">{issue.module}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(issue.created_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <Badge variant="outline">{issue.status}</Badge>
                    </div>
                    <h3 className="font-medium mb-1">{issue.title}</h3>
                    {issue.description && (
                      <p className="text-sm text-muted-foreground mb-2">{issue.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>发生 {issue.occurrence_count} 次</span>
                      <span>最后: {new Date(issue.last_occurred_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                ))}
                {issues.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">暂无问题记录</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {healthChecks.map(check => (
                  <div key={check.id} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{check.check_name}</span>
                        <span className="text-xs text-muted-foreground">{check.check_type}</span>
                      </div>
                      <StatusBadge status={check.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(check.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                ))}
                {healthChecks.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">暂无健康检查记录</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tests" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {testRuns.map(test => (
                  <div key={test.id} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={test.status} />
                        <span className="font-medium">{test.test_name}</span>
                        <Badge variant="outline">{test.test_type}</Badge>
                        <Badge variant="outline">{test.test_module}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {test.duration_ms}ms
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(test.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                ))}
                {testRuns.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">暂无测试记录</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {resourceUsages.map(usage => (
                  <div key={usage.id} className="p-4 rounded-lg border bg-card">
                    <div className="grid grid-cols-3 gap-4 mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">CPU</p>
                        <p className="font-medium">{usage.cpu_usage_percent || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">内存</p>
                        <p className="font-medium">{usage.memory_usage_percent || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">磁盘</p>
                        <p className="font-medium">{usage.disk_usage_percent || 'N/A'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(usage.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                ))}
                {resourceUsages.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">暂无资源使用记录</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
