'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, TrendingUp, Filter, ShoppingCart, MousePointerClick, DollarSign, Award, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProductProfile {
  goods_name: string;
  session_count: number;
  total_clicks: number;
  total_orders: number;
  total_paid: number;
  total_amount: number;
  click_to_pay_rate: string;
  summary_stats?: any;
  best_session?: any;
  worst_session?: any;
  ai_analysis?: string;
  updated_at?: string;
  id?: number;
}

interface ProductAnalysis {
  goods_name: string;
  summary: any;
  best_session: any;
  worst_session: any;
  recent_sessions: any[];
  ai_analysis: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [productAnalysis, setProductAnalysis] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewProductCard = async (product: any) => {
    // 如果商品有 ai_analysis，直接显示
    if (product.ai_analysis) {
      setSelectedProduct(product);
      setProductAnalysis(product);
      setDialogOpen(true);
      return;
    }

    // 否则调用分析接口
    setAnalyzing(true);
    setSelectedProduct(product);
    setDialogOpen(true);
    
    try {
      const res = await fetch('/api/products/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ goodsName: product.goods_name }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setProductAnalysis(data.data);
      } else {
        console.error('Failed to analyze product:', res.statusText);
      }
    } catch (error) {
      console.error('Failed to analyze product:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            商品作战卡
          </h1>
          <p className="text-muted-foreground mt-2">
            沉淀单品历史转化漏斗，挖掘高转化最佳实践，形成可复用的单品打法。
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-md hover:bg-muted/80 flex items-center gap-2">
            <Filter className="w-4 h-4" /> 筛选分类
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Package className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <p>暂无商品数据。数据将在直播过程中自动抓取。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {products.map((product, index) => (
            <Card key={index} className="overflow-hidden hover:shadow-md transition-all">
              <CardHeader className="bg-muted/20 pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg leading-snug line-clamp-2" title={product.goods_name}>
                      {product.goods_name}
                    </CardTitle>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        历史曝光: {product.session_count} 场
                      </Badge>
                      {parseFloat(product.click_to_pay_rate) > 5 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs">
                          高转化单品
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-muted-foreground">累计销售额</div>
                    <div className="text-xl font-bold text-primary">
                      ¥{product.total_amount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* 漏斗数据 */}
                <div className="grid grid-cols-3 divide-x border-b bg-muted/5">
                  <div className="p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <MousePointerClick className="w-4 h-4" /> 点击人数
                    </div>
                    <div className="font-semibold text-lg">{product.total_clicks.toLocaleString()}</div>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <ShoppingCart className="w-4 h-4" /> 下单人数
                    </div>
                    <div className="font-semibold text-lg">{product.total_orders.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      转化 {(product.total_clicks > 0 ? (product.total_orders / product.total_clicks) * 100 : 0).toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                      <DollarSign className="w-4 h-4" /> 支付人数
                    </div>
                    <div className="font-semibold text-lg text-primary">{product.total_paid.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      转化 {(product.total_orders > 0 ? (product.total_paid / product.total_orders) * 100 : 0).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* 模拟的 AI 分析结论区 (实际应从 product_profiles 或 knowledge 表拉取) */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <Award className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold mb-1">历史最佳实践</h4>
                      <p className="text-sm text-muted-foreground">
                        在开播后30-45分钟上架效果最好，最佳讲解时长为5-8分钟。配合“限时加赠”话术可提升约 30% 转化。
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold mb-1 flex justify-between">
                        <span>流失节点预警</span>
                        <span className="text-xs font-normal text-red-500">点击→下单 流失严重</span>
                      </h4>
                      <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">常见用户疑虑：</span>价格是否最低？适用人群有哪些？<br/>
                        <span className="font-medium text-foreground mt-1 block">应对建议：</span>主播需在讲解前2分钟抛出价格锚点，助教配合置顶保障政策。
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-muted/30 p-3 border-t text-center">
                  <Button 
                    variant={product.ai_analysis ? "default" : "default"} 
                    size="sm"
                    onClick={() => viewProductCard(product)}
                    className="text-sm font-medium w-full"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {product.ai_analysis ? "查看商品作战卡" : "生成商品作战卡"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 商品分析弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              商品作战卡 - {selectedProduct?.goods_name || selectedProduct}
            </DialogTitle>
            <DialogDescription>
              AI 智能分析商品历史数据，生成可复用的单品打法
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[70vh] pr-4">
            {analyzing ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">正在分析中，请稍候...</p>
            </div>
          ) : productAnalysis ? (
            <div className="space-y-6">
              {/* 核心指标 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">累计上播场次</div>
                    <div className="text-2xl font-bold">{(productAnalysis.summary_stats || productAnalysis.summary)?.total_sessions}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">累计成交金额</div>
                    <div className="text-2xl font-bold text-primary">
                      ¥{((productAnalysis.summary_stats || productAnalysis.summary)?.total_amount || 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">场均成交</div>
                    <div className="text-2xl font-bold">
                      ¥{(productAnalysis.summary_stats || productAnalysis.summary)?.avg_amount_per_session}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">点击→支付转化率</div>
                    <div className="text-2xl font-bold text-green-600">
                      {(productAnalysis.summary_stats || productAnalysis.summary)?.avg_click_to_pay_rate}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* AI 分析结果 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  AI 智能分析
                </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: (productAnalysis.ai_analysis || '')
                          .replace(/\n/g, '<br />') 
                      }} 
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              暂无分析结果
            </div>
          )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}