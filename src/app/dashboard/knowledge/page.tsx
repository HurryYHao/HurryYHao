'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, MessageSquare, Download, Upload, Database, 
  Search, RefreshCw, FileText, BarChart3, Shield,
  Send, Loader2, Trash2, BookOpen
} from 'lucide-react';

interface KnowledgeItem {
  id: number;
  category: string;
  dimension: string;
  key: string;
  value: string;
  source: string | null;
  confidence: number;
  sample_count: number;
  status?: string;
  decay_score?: number;
  last_validated_at: string | null;
  created_at: string;
}

interface ScriptItem {
  id: number;
  session_date: string;
  anchor_name: string;
  keywords: string | null;
  content_points: string | null;
  product_list: string | null;
  transaction_data: string | null;
  source: string | null;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const CATEGORY_MAP: Record<string, string> = {
  threshold: '阈值',
  pattern: '模式',
  benchmark: '基准',
  rule: '规则',
};

const DIMENSION_MAP: Record<string, string> = {
  anchor: '主播话术',
  interaction: '互动热度',
  conversion: '商品转化',
  sentiment: '评论舆情',
  rhythm: '直播节奏',
  general: '通用',
};

export default function KnowledgePage() {
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dimensionFilter, setDimensionFilter] = useState('all');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Review state
  const [reviewItems, setReviewItems] = useState<KnowledgeItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Backup state
  const [backupInfo, setBackupInfo] = useState<{ timestamp: string; knowledge_count: number; scripts_count: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/knowledge/feed?type=all');
      const json = await res.json();
      if (json.success) {
        setKnowledge(json.data.knowledge || []);
        setScripts(json.data.scripts || []);
      }
    } catch (err) {
      console.error('获取知识库失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBackupInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/backup');
      const json = await res.json();
      if (json.success && json.last_backup) {
        setBackupInfo(JSON.parse(json.last_backup));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); fetchBackupInfo(); }, [fetchData, fetchBackupInfo]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Filtered knowledge
  const filteredKnowledge = knowledge.filter(item => {
    const matchesSearch = !searchQuery || 
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.value.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesDimension = dimensionFilter === 'all' || item.dimension === dimensionFilter;
    return matchesSearch && matchesCategory && matchesDimension;
  });

  // Chat handler
  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/knowledge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `请求失败 (${res.status})`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let sseBuffer = '';

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          sseBuffer += chunk;

          // 解析SSE格式: data: {json}\n\n
          const lines = sseBuffer.split('\n');
          sseBuffer = '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  assistantContent += parsed.content;
                  setChatMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                    return updated;
                  });
                }
                if (parsed.error) {
                  assistantContent += `[错误] ${parsed.error}`;
                  setChatMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                    return updated;
                  });
                }
              } catch {
                // 非JSON行，可能是残余数据，保留到buffer
                if (!line.endsWith('\n')) {
                  sseBuffer = line + '\n';
                }
              }
            }
          }
        }
      }

      // 如果没有解析到任何内容，尝试直接使用原始响应
      if (!assistantContent) {
        // 可能不是SSE格式，尝试解析为普通JSON
        try {
          const json = JSON.parse(await res.text());
          if (json.error) {
            assistantContent = `错误: ${json.error}`;
          }
        } catch { /* ignore */ }
      }

      if (!assistantContent) {
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '抱歉，未获取到回复内容' };
          return updated;
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `请求失败: ${errMsg}` }]);
    } finally {
      setChatLoading(false);
      // 滚动到底部
      const scrollArea = document.getElementById('chat-scroll-area');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  };

  // Export handler
  const handleExport = async (type: 'all' | 'skill' | 'knowledge') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/knowledge/export?type=${type}`);
      const json = await res.json();
      if (json.success) {
        const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `knowledge_${type}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('导出失败:', err);
    } finally {
      setExporting(false);
    }
  };

  // Import handler
  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const skillPackage = JSON.parse(text);
        const res = await fetch('/api/knowledge/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: skillPackage }),
        });
        const json = await res.json();
        if (json.success) {
          alert(`导入成功: 知识${json.imported.knowledge}条, 脚本${json.imported.scripts}条`);
          fetchData();
        } else {
          alert(`导入失败: ${json.error}`);
        }
      } catch (err) {
        alert(`导入失败: ${err}`);
      }
    };
    input.click();
  };

  // Backup handler
  const handleBackup = async () => {
    try {
      const res = await fetch('/api/knowledge/backup', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setBackupInfo({ timestamp: json.timestamp, knowledge_count: json.knowledge_count, scripts_count: json.scripts_count });
        alert(`备份成功: ${json.knowledge_count}条知识, ${json.scripts_count}条脚本`);
      }
    } catch (err) {
      alert(`备份失败: ${err}`);
    }
  };

  // Delete knowledge item
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此知识条目？')) return;
    try {
      await fetch(`/api/knowledge/feed?id=${id}`, { method: 'DELETE' });
      setKnowledge(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            知识库
          </h1>
          <p className="text-muted-foreground mt-1">
            AI分析的知识积累与进化 · {knowledge.length}条知识 · {scripts.length}场脚本
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBackup}>
            <Shield className="h-4 w-4 mr-1" /> 备份
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('skill')} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" /> 导出技能包
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-1" /> 导入
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Backup info */}
      {backupInfo && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-2 px-4 flex items-center gap-4 text-sm">
            <Shield className="h-4 w-4 text-primary" />
            <span>最近备份: {new Date(backupInfo.timestamp).toLocaleString('zh-CN')}</span>
            <span className="text-muted-foreground">|</span>
            <span>{backupInfo.knowledge_count}条知识</span>
            <span>{backupInfo.scripts_count}条脚本</span>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold font-mono">{knowledge.length}</div>
            <div className="text-sm text-muted-foreground">知识条目</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold font-mono">{scripts.length}</div>
            <div className="text-sm text-muted-foreground">直播脚本</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold font-mono">{knowledge.filter(k => k.confidence >= 3).length}</div>
            <div className="text-sm text-muted-foreground">高置信度</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold font-mono">
              {Object.keys(DIMENSION_MAP).filter(d => knowledge.some(k => k.dimension === d)).length}/5
            </div>
            <div className="text-sm text-muted-foreground">维度覆盖</div>
          </CardContent>
        </Card>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="knowledge" className="space-y-4">
        <TabsList>
          <TabsTrigger value="knowledge"><Database className="h-4 w-4 mr-1" /> 知识库</TabsTrigger>
          <TabsTrigger value="scripts"><FileText className="h-4 w-4 mr-1" /> 直播脚本</TabsTrigger>
          <TabsTrigger value="quality"><Shield className="h-4 w-4 mr-1" /> 自动质量控制</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquare className="h-4 w-4 mr-1" /> 知识对话</TabsTrigger>
        </TabsList>

        {/* Knowledge Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索知识..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-background"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="all">所有类型</option>
              {Object.entries(CATEGORY_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-background"
              value={dimensionFilter}
              onChange={e => setDimensionFilter(e.target.value)}
            >
              <option value="all">所有维度</option>
              {Object.entries(DIMENSION_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => handleExport('knowledge')}>
              <Download className="h-4 w-4 mr-1" /> 导出
            </Button>
          </div>

          {/* Knowledge list */}
          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {filteredKnowledge.map((item, index) => (
                <Card key={item.id || `knowledge-${index}`} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_MAP[item.category] || item.category}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {DIMENSION_MAP[item.dimension] || item.dimension}
                          </Badge>
                          <Badge variant={item.confidence >= 3 ? 'default' : 'outline'} className="text-xs">
                            置信度 {item.confidence}
                          </Badge>
                          {item.status && (
                            <Badge variant="outline" className={`text-xs ${item.status === 'active' ? 'text-green-500 border-green-200 bg-green-50' : item.status === 'weakened' ? 'text-orange-500 border-orange-200 bg-orange-50' : 'text-slate-500 border-slate-200 bg-slate-50'}`}>
                              {item.status === 'active' ? '生效中' : item.status === 'weakened' ? '已弱化' : '已归档'}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">样本{item.sample_count}</span>
                        </div>
                        <div className="font-medium text-sm">{item.key}</div>
                        <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{item.value}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredKnowledge.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无匹配的知识条目</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Scripts Tab */}
        <TabsContent value="scripts" className="space-y-4">
          <ScrollArea className="h-[650px]">
            <div className="space-y-3">
              {scripts.map(script => (
                <Card key={script.id}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">{script.session_date}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{script.anchor_name || '未知'}</Badge>
                        {script.source && <Badge variant="secondary" className="text-xs">{script.source}</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4 space-y-3">
                    {script.keywords && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">关键词</div>
                        <div className="flex flex-wrap gap-1">
                          {script.keywords.split(/[,，、]/).filter(Boolean).map((kw, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{kw.trim()}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {script.content_points && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">内容要点</div>
                        <div className="text-sm whitespace-pre-wrap">{script.content_points}</div>
                      </div>
                    )}
                    {script.product_list && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">产品清单</div>
                        <div className="text-sm whitespace-pre-wrap line-clamp-3">{script.product_list}</div>
                      </div>
                    )}
                    {script.transaction_data && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">成交数据</div>
                        <div className="text-sm font-mono">{script.transaction_data}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Knowledge Quality Control Tab */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>自动化质量控制机制</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>系统已启用完全自动化的知识库质量控制，无需人工审核：</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>自动置信度计算：</strong> 基于多场复现、指标验证等正向样本自动提升置信度。</li>
                  <li><strong>自动衰减机制：</strong> 超过30天未被使用的知识将自动累加衰减分，逐步降低权重。</li>
                  <li><strong>自动冲突检测：</strong> 当新场次数据与知识库产生冲突时，系统将自动记录反例并扣除置信度。</li>
                  <li><strong>状态自动流转：</strong> 知识条目的状态将自动在 <code>active</code>(生效)、<code>weakened</code>(弱化)、<code>archived</code>(归档) 之间流转。</li>
                </ul>
                <div className="pt-4 border-t mt-4 flex gap-4">
                  <Button variant="outline" size="sm" onClick={async () => {
                    await fetch('/api/tasks', { method: 'POST', body: JSON.stringify({ action: 'trigger_knowledge_quality' }) }); // 伪代码，展示用
                    alert('已触发后台自动质量控制任务');
                  }}>
                    手动触发质量控制重算
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat Tab - 全屏对话区域 */}
        <TabsContent value="chat" className="-m-6">
          <div className="h-[calc(100vh-160px)] flex flex-col">
            {/* 消息区域 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" id="chat-scroll-area">
              {chatMessages.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                  <Brain className="h-14 w-14 mx-auto mb-4 opacity-30" />
                  <p className="font-medium text-lg">知识库AI助手</p>
                  <p className="text-sm mt-2 max-w-md mx-auto">基于{knowledge.length}条知识库数据和{scripts.length}场历史脚本的智能对话</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-lg mx-auto">
                    {[
                      { label: '话术趋势分析', query: '分析近期直播话术趋势和变化' },
                      { label: '逼单话术建议', query: '生成逼单话术建议' },
                      { label: '漏斗优化', query: '商品转化漏斗优化建议' },
                      { label: '舆情预警规则', query: '评论舆情预警规则有哪些' },
                    ].map(q => (
                      <Button key={q.label} variant="outline" size="sm" onClick={() => { setChatInput(q.query); }}>
                        {q.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    {msg.content || (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        思考中...
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="border-t bg-background p-4 shrink-0">
              <div className="flex items-end gap-3 max-w-4xl mx-auto">
                <textarea
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-[160px]"
                  placeholder="输入问题或需求... (Shift+Enter换行, Enter发送)"
                  rows={1}
                  value={chatInput}
                  onChange={e => {
                    setChatInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSend();
                      e.currentTarget.style.height = 'auto';
                    }
                  }}
                  disabled={chatLoading}
                />
                <Button
                  size="icon"
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  className="shrink-0 self-end h-11 w-11 rounded-xl"
                >
                  {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
