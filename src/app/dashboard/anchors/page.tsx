'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, TrendingUp, TrendingDown, Star, Activity, BarChart2, Package } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface AnchorProfile {
  anchor_name: string;
  avg_sales: number;
  avg_viewers: number;
  avg_online: number;
  avg_conversion_rate: number;
  avg_comment_rate: number;
  avg_score: number;
  dimension_scores: {
    anchor: number;
    interaction: number;
    conversion: number;
    sentiment: number;
    rhythm: number;
  };
  strengths: string[];
  weaknesses: string[];
  best_product_types: string[];
  updated_at: string;
}

export default function AnchorsPage() {
  const [profiles, setProfiles] = useState<AnchorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/anchors');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch anchor profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (score: number) => {
    const fullStars = Math.floor(score / 2);
    const hasHalfStar = score % 2 >= 1;
    
    return (
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <Star 
            key={i} 
            className={`w-4 h-4 ${
              i < fullStars 
                ? 'fill-yellow-400 text-yellow-400' 
                : (i === fullStars && hasHalfStar) 
                  ? 'fill-yellow-400/50 text-yellow-400' 
                  : 'text-gray-300'
            }`} 
          />
        ))}
        <span className="ml-2 font-medium text-sm">{score.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          主播画像
        </h1>
        <p className="text-muted-foreground mt-2">
          基于多场直播历史数据与 AI 分析结果，自动沉淀每位主播的能力模型与商品匹配度。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : profiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <User className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <p>暂无主播画像数据。数据将在直播结束后自动生成。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {profiles.map((profile) => (
            <Card key={profile.anchor_name} className="overflow-hidden">
              <CardHeader className="bg-muted/30 border-b pb-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                      {profile.anchor_name.substring(0, 1)}
                    </div>
                    <div>
                      <CardTitle className="text-xl">{profile.anchor_name}</CardTitle>
                      <CardDescription className="mt-1">
                        最后更新: {format(new Date(profile.updated_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-sm text-muted-foreground mb-1">综合能力评分</div>
                    {renderStars(profile.avg_score || 0)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-2 md:grid-cols-4 border-b">
                  <div className="p-4 border-r border-b md:border-b-0 flex flex-col items-center justify-center">
                    <div className="text-sm text-muted-foreground mb-1">场均销售额</div>
                    <div className="font-semibold text-lg">¥{(profile.avg_sales || 0).toLocaleString()}</div>
                  </div>
                  <div className="p-4 border-r md:border-b-0 flex flex-col items-center justify-center">
                    <div className="text-sm text-muted-foreground mb-1">场均在线</div>
                    <div className="font-semibold text-lg">{profile.avg_online || 0}</div>
                  </div>
                  <div className="p-4 border-r border-b md:border-b-0 flex flex-col items-center justify-center">
                    <div className="text-sm text-muted-foreground mb-1">转化率</div>
                    <div className="font-semibold text-lg text-primary">{(profile.avg_conversion_rate || 0)}%</div>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center">
                    <div className="text-sm text-muted-foreground mb-1">互动率</div>
                    <div className="font-semibold text-lg text-blue-600">{(profile.avg_comment_rate || 0)}%</div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* 能力雷达 (简化为条形图) */}
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-4">
                      <BarChart2 className="w-4 h-4 text-muted-foreground" />
                      五维能力分布
                    </h4>
                    <div className="space-y-3">
                      {[
                        { label: '话术表现', key: 'anchor', color: 'bg-blue-500' },
                        { label: '互动热度', key: 'interaction', color: 'bg-green-500' },
                        { label: '商品转化', key: 'conversion', color: 'bg-purple-500' },
                        { label: '评论舆情', key: 'sentiment', color: 'bg-yellow-500' },
                        { label: '直播节奏', key: 'rhythm', color: 'bg-orange-500' },
                      ].map(dim => {
                        const score = profile.dimension_scores?.[dim.key as keyof typeof profile.dimension_scores] || 0;
                        return (
                          <div key={dim.key} className="flex items-center gap-3">
                            <span className="text-sm w-20 text-muted-foreground">{dim.label}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${dim.color}`} style={{ width: `${(score / 10) * 100}%` }} />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{score}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 pt-4 border-t">
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-green-600">
                        <TrendingUp className="w-4 h-4" /> 核心优势
                      </h4>
                      <ul className="space-y-2">
                        {(profile.strengths || []).map((strength, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                            <span className="text-muted-foreground">{strength}</span>
                          </li>
                        ))}
                        {(!profile.strengths || profile.strengths.length === 0) && (
                          <li className="text-sm text-muted-foreground italic">暂无数据</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-red-500">
                        <TrendingDown className="w-4 h-4" /> 待提升点
                      </h4>
                      <ul className="space-y-2">
                        {(profile.weaknesses || []).map((weakness, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                            <span className="text-muted-foreground">{weakness}</span>
                          </li>
                        ))}
                        {(!profile.weaknesses || profile.weaknesses.length === 0) && (
                          <li className="text-sm text-muted-foreground italic">暂无数据</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Package className="w-4 h-4 text-muted-foreground" /> 最佳带货品类
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(profile.best_product_types || []).map((type, i) => (
                        <Badge key={i} variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                          {type}
                        </Badge>
                      ))}
                      {(!profile.best_product_types || profile.best_product_types.length === 0) && (
                        <span className="text-sm text-muted-foreground italic">暂无数据</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}