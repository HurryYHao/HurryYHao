// 腾讯云 COS 存储管理器
// 负责上传、下载、删除文件到腾讯云 COS

import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config';

export class CosManager {
  private cos: COS | null = null;
  private initialized = false;

  constructor() {
    this.init();
  }

  /**
   * 初始化 COS 客户端
   */
  private init(): void {
    try {
      const { secretId, secretKey, region } = CONFIG.cos;
      
      if (!secretId || !secretKey || !region) {
        console.warn('[COS] 腾讯云 COS 配置不完整，将使用本地存储');
        return;
      }

      this.cos = new COS({
        SecretId: secretId,
        SecretKey: secretKey,
      });
      
      this.initialized = true;
      console.log('[COS] 腾讯云 COS 客户端初始化成功');
    } catch (err) {
      console.error('[COS] 初始化失败:', err);
    }
  }

  /**
   * 检查 COS 是否可用
   */
  public isAvailable(): boolean {
    return this.initialized && this.cos !== null && CONFIG.cos.bucket !== '';
  }

  /**
   * 生成 COS 对象 Key
   */
  private generateKey(type: string, filename: string): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const prefix = CONFIG.cos.prefix;
    return `${prefix}/${type}/${dateStr}/${filename}`;
  }

  /**
   * 上传文件到 COS
   * @param localPath 本地文件路径
   * @param type 文件类型 (recordings, reports, knowledge 等)
   * @param customFilename 自定义文件名（可选）
   * @returns COS 文件 URL
   */
  public async uploadFile(
    localPath: string,
    type: string = 'recordings',
    customFilename?: string
  ): Promise<string> {
    if (!this.isAvailable()) {
      console.warn('[COS] COS 不可用，使用本地路径:', localPath);
      return localPath;
    }

    try {
      const filename = customFilename || path.basename(localPath);
      const key = this.generateKey(type, filename);
      const bucket = CONFIG.cos.bucket;
      const region = CONFIG.cos.region;

      console.log(`[COS] 开始上传文件: ${filename} -> ${key}`);

      const result = await new Promise<any>((resolve, reject) => {
        this.cos!.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: fs.createReadStream(localPath),
            ContentLength: fs.statSync(localPath).size,
          },
          (err: any, data: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          }
        );
      });

      // 生成访问 URL
      const cosUrl = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
      console.log(`[COS] 文件上传成功: ${cosUrl}`);
      
      return cosUrl;
    } catch (err) {
      console.error('[COS] 上传失败:', err);
      // 上传失败时回退到本地路径
      return localPath;
    }
  }

  /**
   * 上传 Buffer 到 COS
   * @param buffer 文件内容 Buffer
   * @param filename 文件名
   * @param type 文件类型
   * @returns COS 文件 URL
   */
  public async uploadBuffer(
    buffer: Buffer,
    filename: string,
    type: string = 'data'
  ): Promise<string> {
    if (!this.isAvailable()) {
      console.warn('[COS] COS 不可用，无法上传 Buffer');
      throw new Error('COS not available');
    }

    try {
      const key = this.generateKey(type, filename);
      const bucket = CONFIG.cos.bucket;
      const region = CONFIG.cos.region;

      console.log(`[COS] 开始上传 Buffer: ${filename} -> ${key}`);

      await new Promise<any>((resolve, reject) => {
        this.cos!.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: buffer,
            ContentLength: buffer.length,
          },
          (err: any, data: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          }
        );
      });

      const cosUrl = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
      console.log(`[COS] Buffer 上传成功: ${cosUrl}`);
      
      return cosUrl;
    } catch (err) {
      console.error('[COS] Buffer 上传失败:', err);
      throw err;
    }
  }

  /**
   * 从 COS 下载文件
   * @param cosUrl COS 文件 URL
   * @param localPath 本地保存路径
   */
  public async downloadFile(cosUrl: string, localPath: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('COS not available');
    }

    try {
      // 从 URL 中提取 key
      const url = new URL(cosUrl);
      const key = url.pathname.slice(1); // 去掉开头的 /
      const bucket = CONFIG.cos.bucket;
      const region = CONFIG.cos.region;

      console.log(`[COS] 开始下载文件: ${key}`);

      const result = await new Promise<any>((resolve, reject) => {
        this.cos!.getObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
          },
          (err: any, data: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          }
        );
      });

      // 写入本地文件
      fs.writeFileSync(localPath, result.Body);
      console.log(`[COS] 文件下载成功: ${localPath}`);
    } catch (err) {
      console.error('[COS] 下载失败:', err);
      throw err;
    }
  }

  /**
   * 删除 COS 上的文件
   * @param cosUrl COS 文件 URL
   */
  public async deleteFile(cosUrl: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      const url = new URL(cosUrl);
      const key = url.pathname.slice(1);
      const bucket = CONFIG.cos.bucket;
      const region = CONFIG.cos.region;

      console.log(`[COS] 删除文件: ${key}`);

      await new Promise<any>((resolve, reject) => {
        this.cos!.deleteObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
          },
          (err: any, data: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          }
        );
      });

      console.log(`[COS] 文件删除成功`);
    } catch (err) {
      console.error('[COS] 删除失败:', err);
    }
  }

  /**
   * 检查文件是否存在于 COS
   */
  public async fileExists(cosUrl: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const url = new URL(cosUrl);
      const key = url.pathname.slice(1);
      const bucket = CONFIG.cos.bucket;
      const region = CONFIG.cos.region;

      await new Promise<any>((resolve, reject) => {
        this.cos!.headObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
          },
          (err: any, data: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          }
        );
      });

      return true;
    } catch {
      return false;
    }
  }
}

// 导出单例实例
export const cosManager = new CosManager();
