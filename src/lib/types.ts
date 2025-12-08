// 重新导出配置类型
export type { ProjectConfig, GlobalConfig } from './config.js';

// 部署选项
export interface DeployOptions {
  services?: string[];  // 要部署的服务列表，空则部署全部
  versions: Record<string, string>;  // 各服务的版本号
  skipBuild?: boolean;
  skipPush?: boolean;
  dryRun?: boolean;
}

// 步骤状态
export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

// 步骤定义
export interface Step {
  id: string;
  name: string;
  status: StepStatus;
  message?: string;
  duration?: number;
}

// FaaS API 响应类型
export interface FaaSResponse<T> {
  ResponseMetadata: {
    RequestId: string;
    Action: string;
    Version: string;
    Service: string;
    Region: string;
    Error?: {
      Code: string;
      Message: string;
    };
  };
  Result?: T;
}

export interface FunctionInfo {
  Id: string;
  Name: string;
  Runtime: string;
  Description: string;
  // Source 是镜像 URI 字符串，如 "registry/namespace/image:tag"
  Source: string;
  SourceType: string;
}

export interface ReleaseInfo {
  FunctionId: string;
  Status: 'pending' | 'inprogress' | 'done' | 'failed';
  StatusMessage?: string;
  StartTime?: string;
  TargetTrafficWeight?: number;
  CurrentTrafficWeight?: number;
  ErrorCode?: string;
  ReleaseRecordId?: string;
}

export interface ImageSyncStatus {
  Status: 'Pending' | 'Running' | 'Succeeded' | 'Canceled' | 'Failed';
  Description?: string;
  StartTime?: string;
  EndTime?: string;
  ImageCacheEnabled?: boolean;
  ImageCacheStatus?: 'Creating' | 'Ready' | 'Failed';
  ImageCacheDescription?: string;
  ImageCacheExpireDateTime?: string;
  ImagePreloadEnabled?: boolean;
  ImagePreloadStatus?: 'Creating' | 'Ready' | 'Failed';
}

// 服务部署状态
export interface ServiceDeployState {
  service: string;
  imageTag: string;
  steps: Step[];
}
