
// 脚本：创建示例直播会话数据
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, '..', 'data', 'storage.json');

console.log('📊 创建示例直播会话数据...\n');

try {
  // 读取现有数据
  let storage = {};
  if (fs.existsSync(storagePath)) {
    const data = fs.readFileSync(storagePath, 'utf8');
    storage = JSON.parse(data);
  }

  // 确保必要的字段存在
  storage.liveSessions = storage.liveSessions || [];
  storage.snapshotData = storage.snapshotData || [];
  storage.analysisReports = storage.analysisReports || [];
  storage.liveTimelineEvents = storage.liveTimelineEvents || [];
  storage.liveMetricsMinute = storage.liveMetricsMinute || [];

  const now = new Date();

  // 创建示例直播会话
  const sampleSession = {
    id: 1,
    room_id: 'room12345',
    room_name: '618狂欢夜直播',
    live_space_id: 'live_space_123',
    start_time: new Date(now.getTime() - 3600000 * 2).toISOString(), // 2小时前开始
    end_time: null,
    status: 'recording',
    trtc_info: null,
    last_snapshot_seq: 5,
    last_analysis_time: new Date(now.getTime() - 1800000).toISOString(),
    live_token: 'sample_token',
    token_expires_at: new Date(now.getTime() + 86400000).toISOString(),
    error_message: null,
    anchor_name: '张主播',
    created_at: new Date(now.getTime() - 3600000 * 2).toISOString(),
    updated_at: now.toISOString(),
    session_type: 'normal',
    product_category: '美妆',
    traffic_level: 'high',
    final_status: null,
    total_duration_seconds: 7200,
    data_quality_score: 95,
    room_type: 'normal'
  };

  const sampleSession2 = {
    id: 2,
    room_id: 'room54321',
    room_name: '周末特惠专场',
    live_space_id: 'live_space_456',
    start_time: new Date(now.getTime() - 3600000 * 4).toISOString(),
    end_time: new Date(now.getTime() - 3600000 * 1).toISOString(),
    status: 'ended',
    trtc_info: null,
    last_snapshot_seq: 10,
    last_analysis_time: new Date(now.getTime() - 3600000 * 1).toISOString(),
    live_token: 'sample_token_2',
    token_expires_at: new Date(now.getTime() + 86400000).toISOString(),
    error_message: null,
    anchor_name: '李主播',
    created_at: new Date(now.getTime() - 3600000 * 4).toISOString(),
    updated_at: new Date(now.getTime() - 3600000 * 1).toISOString(),
    session_type: 'normal',
    product_category: '食品',
    traffic_level: 'medium',
    final_status: 'completed',
    total_duration_seconds: 10800,
    data_quality_score: 90,
    room_type: 'normal'
  };

  // 创建智能直播示例
  const sampleSession3 = {
    id: 3,
    room_id: 'room99999',
    room_name: '智能模板直播间',
    template_name: '爆款美妆推广模板',
    live_space_id: 'live_space_789',
    start_time: new Date(now.getTime() - 3600000 * 0.5).toISOString(),
    end_time: null,
    status: 'recording',
    trtc_info: null,
    last_snapshot_seq: 3,
    last_analysis_time: new Date(now.getTime() - 1800000 * 0.5).toISOString(),
    live_token: 'sample_token_3',
    token_expires_at: new Date(now.getTime() + 86400000).toISOString(),
    error_message: null,
    anchor_name: 'AI 助手',
    created_at: new Date(now.getTime() - 3600000 * 0.5).toISOString(),
    updated_at: now.toISOString(),
    session_type: 'intelligence',
    product_category: '美妆',
    traffic_level: 'high',
    final_status: null,
    total_duration_seconds: 1800,
    data_quality_score: 98,
    room_type: 'intelligence'
  };

  // 替换或添加示例数据
  const existingSessions = storage.liveSessions.filter(s => ![1, 2, 3].includes(s.id));
  storage.liveSessions = [sampleSession, sampleSession2, sampleSession3, ...existingSessions];

  // 更新 nextId
  storage.nextIds = storage.nextIds || {};
  storage.nextIds.liveSessions = Math.max(storage.nextIds.liveSessions || 1, 4);

  // 创建一些快照数据
  const sampleSnapshot = {
    id: 1,
    session_id: 1,
    snapshot_seq: 1,
    snapshot_time: new Date(now.getTime() - 3600000 * 1.5).toISOString(),
    watcher_cnt: '234',
    comment_cnt: '56',
    online_user_cnt: '234',
    order_total: '15600',
    order_count: 45,
    new_fan_conversion_rate: '3.2%',
    old_fan_conversion_rate: '5.8%',
    new_fan_paid_count: 12,
    old_fan_paid_count: 33,
    raw_json: {
      orderDetails: [
        {
          goodsName: '爆款护肤精华',
          clickCount: 156,
          orderCount: 23,
          paidCount: 18,
          payAmount: 5400
        },
        {
          goodsName: '保湿面膜套装',
          clickCount: 89,
          orderCount: 12,
          paidCount: 10,
          payAmount: 3200
        }
      ]
    },
    created_at: new Date(now.getTime() - 3600000 * 1.5).toISOString()
  };

  const sampleSnapshot2 = {
    id: 2,
    session_id: 1,
    snapshot_seq: 2,
    snapshot_time: new Date(now.getTime() - 3600000 * 1).toISOString(),
    watcher_cnt: '456',
    comment_cnt: '123',
    online_user_cnt: '456',
    order_total: '35200',
    order_count: 89,
    new_fan_conversion_rate: '4.1%',
    old_fan_conversion_rate: '6.5%',
    new_fan_paid_count: 34,
    old_fan_paid_count: 55,
    raw_json: {
      orderDetails: [
        {
          goodsName: '爆款护肤精华',
          clickCount: 312,
          orderCount: 45,
          paidCount: 38,
          payAmount: 11400
        },
        {
          goodsName: '保湿面膜套装',
          clickCount: 178,
          orderCount: 32,
          paidCount: 28,
          payAmount: 8960
        },
        {
          goodsName: '新品口红礼盒',
          clickCount: 289,
          orderCount: 28,
          paidCount: 22,
          payAmount: 14840
        }
      ]
    },
    created_at: new Date(now.getTime() - 3600000 * 1).toISOString()
  };

  const existingSnapshots = storage.snapshotData.filter(s => ![1, 2].includes(s.id));
  storage.snapshotData = [sampleSnapshot, sampleSnapshot2, ...existingSnapshots];
  storage.nextIds.snapshotData = Math.max(storage.nextIds.snapshotData || 1, 3);

  // 保存文件
  fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2));
  
  console.log('✅ 示例数据创建成功！');
  console.log('');
  console.log('📊 已创建：');
  console.log('  - 3个直播会话（2个正在进行，1个已结束）');
  console.log('  - 2个数据快照');
  console.log('');
  console.log('🌐 现在访问 http://localhost:3001 查看效果！');
  console.log('');

} catch (error) {
  console.error('❌ 错误:', error);
  process.exit(1);
}
