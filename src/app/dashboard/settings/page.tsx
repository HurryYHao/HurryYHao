'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle, Clock, Key, Loader2, Lock, LogIn,
  RefreshCw, Shield, XCircle, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface TokenStatus { hasToken: boolean; expiresAt: number | null; isExpired: boolean; }

function formatCountdown(ms: number) {
  if (ms <= 0) return '已过期';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export default function SettingsPage() {
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [captchaImg, setCaptchaImg] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState<string | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [manualLoginLoading, setManualLoginLoading] = useState(false);
  const [countdown, setCountdown] = useState<string>('');
  
  // AI Settings State
  const [aiSettings, setAiSettings] = useState<{provider: string, model: string} | null>(null);
  const [aiProviders, setAiProviders] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [savingAi, setSavingAi] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTokenStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/login?action=status');
      const json = await res.json();
      if (json.success) {
        setTokenStatus(json.data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchTokenStatus(); }, [fetchTokenStatus]);

  const fetchAiSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/ai');
      const json = await res.json();
      if (json.success) {
        setAiSettings(json.data.settings);
        setAiProviders(json.data.providers);
        setAvailableModels(json.data.availableModels);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchAiSettings(); }, [fetchAiSettings]);

  // Token 倒计时
  useEffect(() => {
    if (!tokenStatus?.expiresAt) { setCountdown(''); return; }
    const update = () => {
      const remaining = tokenStatus.expiresAt! - Date.now();
      setCountdown(formatCountdown(remaining));
      if (remaining <= 0) fetchTokenStatus();
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tokenStatus, fetchTokenStatus]);

  const handleAutoLogin = async () => {
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('自动登录成功');
        fetchTokenStatus();
      } else {
        toast.error(json.error || '登录失败');
      }
    } catch {
      toast.error('登录请求失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGetCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const res = await fetch('/api/auth/login?action=captcha');
      const json = await res.json();
      if (json.success) {
        setCaptchaImg(json.data.captchaImage);
        setCaptchaKey(json.data.captchaKey);
        setCaptchaCode('');
        toast.success('验证码已获取');
      } else {
        toast.error(json.error || '获取验证码失败');
      }
    } catch {
      toast.error('获取验证码请求失败');
    } finally {
      setCaptchaLoading(false);
    }
  };

  const handleManualLogin = async () => {
    if (!captchaKey || !captchaCode) {
      toast.error('请先获取验证码并输入');
      return;
    }
    setManualLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captchaKey, captchaCode }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('手动登录成功');
        setCaptchaImg(null);
        setCaptchaKey(null);
        setCaptchaCode('');
        fetchTokenStatus();
      } else {
        toast.error(json.error || '登录失败');
        // 刷新验证码
        handleGetCaptcha();
      }
    } catch {
      toast.error('登录请求失败');
    } finally {
      setManualLoginLoading(false);
    }
  };

  const handleSaveAiSettings = async () => {
    if (!aiSettings) return;
    setSavingAi(true);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiSettings),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('AI 设置保存成功');
      } else {
        toast.error(json.error || '保存失败');
      }
    } catch {
      toast.error('保存请求失败');
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" />系统设置</h1>

      {/* 鉴权状态 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" />鉴权状态</CardTitle>
          <CardDescription>鑫云平台 Token 状态与管理</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {tokenStatus?.hasToken && !tokenStatus?.isExpired ? (
                <><CheckCircle className="h-5 w-5 text-primary" /><span className="font-medium">Token 有效</span></>
              ) : tokenStatus?.hasToken && tokenStatus?.isExpired ? (
                <><XCircle className="h-5 w-5 text-destructive" /><span className="font-medium">Token 已过期</span></>
              ) : (
                <><XCircle className="h-5 w-5 text-muted-foreground" /><span className="font-medium">未登录</span></>
              )}
            </div>
            {countdown && (
              <Badge variant="outline" className="font-mono">
                <Clock className="h-3 w-3 mr-1" />{countdown}
              </Badge>
            )}
            {tokenStatus?.expiresAt && (
              <span className="text-xs text-muted-foreground">
                过期时间: {new Date(tokenStatus.expiresAt).toLocaleString('zh-CN')}
              </span>
            )}
          </div>

          {/* 自动登录 */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAutoLogin} disabled={loginLoading}>
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
              自动登录
            </Button>
            <span className="text-xs text-muted-foreground">自动获取验证码并识别登录（可能需要多次重试）</span>
          </div>
        </CardContent>
      </Card>

      {/* 手动验证码登录 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" />手动验证码登录</CardTitle>
          <CardDescription>手动输入验证码，登录更可靠</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-6">
            {/* 验证码图片 */}
            <div className="space-y-2">
              <Label className="text-sm">验证码</Label>
              <div
                className="w-[140px] h-[50px] border rounded-md flex items-center justify-center bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={handleGetCaptcha}
                title="点击刷新验证码"
              >
                {captchaLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : captchaImg ? (
                  <img src={captchaImg} alt="验证码" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">点击获取</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={handleGetCaptcha} disabled={captchaLoading}>
                <RefreshCw className="h-3 w-3 mr-1" />刷新验证码
              </Button>
            </div>

            {/* 输入区域 */}
            <div className="space-y-2 flex-1">
              <Label className="text-sm">输入验证码结果</Label>
              <Input
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value)}
                placeholder="输入计算结果（如 8）"
                className="w-40"
                onKeyDown={(e) => e.key === 'Enter' && handleManualLogin()}
              />
              <p className="text-xs text-muted-foreground">验证码为数学表达式，请输入计算结果</p>
              <Button onClick={handleManualLogin} disabled={manualLoginLoading || !captchaKey}>
                {manualLoginLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                手动登录
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI 分析配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" />AI 分析配置</CardTitle>
          <CardDescription>选择用于直播分析和验证码识别的 AI 提供商及模型</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiSettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>AI 提供商</Label>
                <Select
                  value={aiSettings.provider}
                  onValueChange={(val) => setAiSettings({
                    provider: val,
                    model: availableModels[val]?.[0] || ''
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 AI 提供商" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiProviders.map(p => (
                      <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>模型选择</Label>
                <Select
                  value={aiSettings.model}
                  onValueChange={(val) => setAiSettings({ ...aiSettings, model: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {(availableModels[aiSettings.provider] || []).map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Button onClick={handleSaveAiSettings} disabled={savingAi}>
                  {savingAi && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  保存 AI 设置
                </Button>
              </div>
            </div>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </CardContent>
      </Card>

      {/* 调度参数 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">调度参数</CardTitle>
          <CardDescription>系统自动运行时的关键参数配置</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: '状态轮询间隔', value: '30 秒', desc: '检测开播/下播的频率' },
              { label: '数据抓取间隔', value: '30 分钟', desc: '每次快照数据的时间间隔' },
              { label: 'Token 刷新阈值', value: '5 分钟', desc: '到期前自动刷新' },
              { label: '验证码重试', value: '3 次', desc: '自动登录最大重试' },
              { label: 'API 请求超时', value: '30 秒', desc: '单次请求超时时间' },
              { label: 'API 重试', value: '2 次', desc: '失败后重试次数' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-lg border">
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-lg font-bold font-mono text-primary">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
