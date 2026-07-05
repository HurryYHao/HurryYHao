/**
 * 企业微信机器人 Webhook 通知
 */

const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL || '';

interface WeComMessage {
  msgtype: 'markdown' | 'text';
  markdown?: { content: string };
  text?: { content: string; mentioned_mobile_list?: string[] };
}

/**
 * 发送企业微信通知
 */
export async function sendWeComNotification(
  title: string,
  description: string,
  severity: 'high' | 'medium' | 'low' = 'medium',
): Promise<boolean> {
  if (!WECOM_WEBHOOK_URL) {
    console.log('[WeCom] 未配置 WECOM_WEBHOOK_URL，跳过通知');
    return false;
  }

  const severityEmoji = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
  };

  const message: WeComMessage = {
    msgtype: 'markdown',
    markdown: {
      content: `${severityEmoji[severity]} **${title}**\n> ${description}\n> <font color="comment">AI直播分析系统</font>`,
    },
  };

  try {
    const response = await fetch(WECOM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    const result = await response.json() as { errcode: number; errmsg: string };

    if (result.errcode === 0) {
      console.log(`[WeCom] 通知发送成功: ${title}`);
      return true;
    } else {
      console.error(`[WeCom] 通知发送失败: errcode=${result.errcode}, errmsg=${result.errmsg}`);
      return false;
    }
  } catch (err) {
    console.error(`[WeCom] 通知发送异常:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * 批量发送预警通知（合并为一条消息避免刷屏）
 */
export async function sendWeComAlertsBatch(
  alerts: Array<{ title: string; description: string; severity: 'high' | 'medium' | 'low' }>,
): Promise<boolean> {
  if (!WECOM_WEBHOOK_URL || alerts.length === 0) return false;

  const severityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

  const content = alerts
    .map((a) => `${severityEmoji[a.severity]} **${a.title}**\n> ${a.description}`)
    .join('\n\n');

  const message: WeComMessage = {
    msgtype: 'markdown',
    markdown: {
      content: `**实时预警 (${alerts.length}条)**\n\n${content}\n\n> <font color="comment">AI直播分析系统</font>`,
    },
  };

  try {
    const response = await fetch(WECOM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    const result = await response.json() as { errcode: number; errmsg: string };
    return result.errcode === 0;
  } catch (err) {
    console.error(`[WeCom] 批量通知发送异常:`, err instanceof Error ? err.message : err);
    return false;
  }
}
