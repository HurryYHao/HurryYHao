// 测试记忆管理系统
import { memoryManager } from './src/lib/server/memory-manager';

async function testMemorySystem() {
  console.log('=== 开始测试记忆管理系统 ===\n');

  try {
    // 1. 测试获取活跃 schema 版本
    console.log('1. 测试获取活跃 schema 版本...');
    const schemaVersion = await memoryManager.getActiveSchemaVersion();
    console.log(`   当前 schema 版本: ${schemaVersion}\n`);

    // 2. 测试创建主播记忆
    console.log('2. 测试创建主播记忆...');
    const anchorName = '测试主播';
    const testAnchorMemory = await memoryManager.createOrUpdateAnchorMemory(
      anchorName,
      {
        personality_traits: ['活泼', '善于沟通'],
        strengths: ['话术流畅', '互动性强'],
        improvement_areas: ['节奏控制'],
        historical_summary: '首次直播测试，整体表现良好',
      },
      'volcengine:test-model'
    );
    console.log('   主播记忆创建成功:', testAnchorMemory.anchor_name, '\n');

    // 3. 测试获取主播记忆
    console.log('3. 测试获取主播记忆...');
    const retrievedAnchorMemory = await memoryManager.getAnchorMemory(anchorName);
    if (retrievedAnchorMemory) {
      console.log('   成功获取主播记忆');
      console.log('   优势:', retrievedAnchorMemory.strengths);
      console.log('   待改进:', retrievedAnchorMemory.improvement_areas, '\n');
    }

    // 4. 测试创建商品记忆
    console.log('4. 测试创建商品记忆...');
    const goodsName = '测试商品';
    const testProductMemory = await memoryManager.createOrUpdateProductMemory(
      goodsName,
      {
        product_category: '食品',
        performance_summary: '首次上播，点击率不错',
        conversion_insights: ['价格合适', '包装吸引人'],
        optimal_pitches: ['强调新鲜度', '展示食用方法'],
      },
      'volcengine:test-model'
    );
    console.log('   商品记忆创建成功:', testProductMemory.goods_name, '\n');

    // 5. 测试获取分析上下文
    console.log('5. 测试获取分析上下文...');
    const context = await memoryManager.getContextForAnalysis(anchorName, [goodsName]);
    console.log('   获取上下文成功:');
    console.log('   - 主播记忆存在:', !!context.anchorMemory);
    console.log('   - 商品记忆数量:', context.productMemories.length);
    console.log('   - 通用知识数量:', context.generalKnowledge.length, '\n');

    // 6. 测试格式化记忆上下文
    console.log('6. 测试格式化记忆上下文...');
    const formattedContext = memoryManager.formatMemoryForPrompt(context);
    console.log('   格式化后的上下文长度:', formattedContext.length, '字符');
    console.log('   格式化结果预览:', formattedContext.slice(0, 200), '...\n');

    console.log('=== 所有测试通过！ ===');

  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

testMemorySystem()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('测试脚本执行失败:', error);
    process.exit(1);
  });
