import { VolcengineSigner } from './volcengine-signer.js';
import type { FaaSResponse, FunctionInfo, ReleaseInfo, ImageSyncStatus } from './types.js';

const FAAS_HOST = 'open.volcengineapi.com';
const FAAS_SERVICE = 'vefaas';
const FAAS_VERSION = '2024-06-06';

import fs from 'fs';

// 通过环境变量开启 DEBUG 模式: DEBUG=1 vefaas-deploy ...
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true' || process.env.DEBUG?.includes('faas');
const DEBUG_LOG_FILE = process.env.DEBUG_LOG || 'faas-debug.log';

function debugLog(message: string) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(DEBUG_LOG_FILE, line);
}

interface FaaSClientConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

// 函数列表项
export interface FunctionListItem {
  Id: string;
  Name: string;
  Description: string;
  Runtime: string;
  CreatedTime: string;
  UpdatedTime: string;
}

// 函数列表响应
export interface ListFunctionsResult {
  Items: FunctionListItem[];
  Total: number;
}

export class FaaSClient {
  private signer: VolcengineSigner;
  private region: string;

  constructor(config: FaaSClientConfig) {
    this.region = config.region;
    this.signer = new VolcengineSigner({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: FAAS_SERVICE,
    });
  }

  private async request<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const query: Record<string, string> = {
      Action: action,
      Version: FAAS_VERSION,
    };

    const body = JSON.stringify(params);
    const path = '/';

    const headers = this.signer.sign({
      method: 'POST',
      host: FAAS_HOST,
      path,
      query,
      body,
    });

    const queryString = Object.entries(query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const url = `https://${FAAS_HOST}${path}?${queryString}`;

    // DEBUG 模式写入日志文件
    debugLog(`[Request] ${action}`);
    debugLog(`  URL: ${url}`);
    debugLog(`  Body: ${body}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json() as FaaSResponse<T>;

    // DEBUG 模式写入响应
    debugLog(`[Response] ${action}`);
    debugLog(`  Status: ${response.status}`);
    debugLog(`  Data: ${JSON.stringify(data)}`);
    debugLog('---');

    if (!response.ok || !data.Result) {
      throw new Error(
        `FaaS API Error [${action}]: ${response.status} - ${JSON.stringify(data)}`
      );
    }

    return data.Result;
  }

  /**
   * 获取函数列表
   */
  async listFunctions(options: { 
    pageNumber?: number; 
    pageSize?: number;
    name?: string;
  } = {}): Promise<ListFunctionsResult> {
    return this.request<ListFunctionsResult>('ListFunctions', {
      PageNumber: options.pageNumber || 1,
      PageSize: options.pageSize || 50,
      ...(options.name && { Name: options.name }),
    });
  }

  /**
   * 获取函数信息
   */
  async getFunction(functionId: string): Promise<FunctionInfo> {
    return this.request<FunctionInfo>('GetFunction', { Id: functionId });
  }

  /**
   * 更新函数（修改镜像）
   */
  async updateFunction(functionId: string, imageUri: string): Promise<void> {
    await this.request('UpdateFunction', {
      Id: functionId,
      Source: imageUri,
      SourceType: 'image',
    });
  }

  /**
   * 发布函数
   */
  async release(functionId: string, description?: string): Promise<void> {
    await this.request('Release', {
      FunctionId: functionId,
      RevisionNumber: 0,  // 0 = 发布最新版本
      TargetTrafficWeight: 100,  // 全量发布
      RollingStep: 100,
      Description: description || `Deploy via vefaas-deploy CLI at ${new Date().toISOString()}`,
    });
  }

  /**
   * 获取发布状态
   */
  async getReleaseStatus(functionId: string): Promise<ReleaseInfo> {
    return this.request<ReleaseInfo>('GetReleaseStatus', {
      FunctionId: functionId,
    });
  }

  /**
   * 获取镜像同步状态
   */
  async getImageSyncStatus(functionId: string, imageUri: string): Promise<ImageSyncStatus> {
    return this.request<ImageSyncStatus>('GetImageSyncStatus', {
      FunctionId: functionId,
      Source: imageUri,
    });
  }

  /**
   * 等待镜像同步完成
   */
  async waitForImageSync(
    functionId: string,
    imageUri: string,
    options: { timeout?: number; interval?: number; onProgress?: (status: ImageSyncStatus) => void } = {}
  ): Promise<void> {
    const { timeout = 300000, interval = 5000, onProgress } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getImageSyncStatus(functionId, imageUri);
      onProgress?.(status);

      // API 返回 Succeeded 表示成功
      if (status.Status === 'Succeeded') {
        return;
      }
      if (status.Status === 'Failed' || status.Status === 'Canceled') {
        throw new Error(`Image sync failed: ${status.Description || status.Status}`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Image sync timeout');
  }

  /**
   * 等待发布完成
   */
  async waitForRelease(
    functionId: string,
    options: { timeout?: number; interval?: number; onProgress?: (status: ReleaseInfo) => void } = {}
  ): Promise<void> {
    const { timeout = 300000, interval = 3000, onProgress } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getReleaseStatus(functionId);
      onProgress?.(status);

      if (status.Status === 'done') {
        return;
      }
      if (status.Status === 'failed') {
        throw new Error(`Release failed: ${status.StatusMessage || status.ErrorCode || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Release timeout');
  }
}

