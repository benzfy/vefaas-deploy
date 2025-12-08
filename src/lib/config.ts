import fs from 'fs';
import path from 'path';
import Conf from 'conf';

// 项目配置（本地 deploy.config.json）
export interface ProjectConfig {
  // 项目名称
  name: string;
  // 镜像仓库配置
  registry: {
    url: string;
    namespace: string;
  };
  // 服务配置（支持多个服务）
  services: {
    [key: string]: {
      // 函数 ID
      functionId: string;
      // Dockerfile 路径（相对于项目根目录）
      dockerfile: string;
      // 构建上下文路径
      context: string;
      // 镜像名称
      imageName: string;
      // 平台
      platform?: string;
    };
  };
}

// 全局配置（火山引擎凭证等敏感信息）
export interface GlobalConfig {
  volcengine: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
}

// 配置文件名
const PROJECT_CONFIG_FILE = 'deploy.config.json';
const GLOBAL_CONFIG_NAME = 'vefaas-deploy';

// 全局配置存储（使用 conf，存储敏感凭证）
const globalConfig = new Conf<GlobalConfig>({
  projectName: GLOBAL_CONFIG_NAME,
  schema: {
    volcengine: {
      type: 'object',
      properties: {
        accessKeyId: { type: 'string' },
        secretAccessKey: { type: 'string' },
        region: { type: 'string', default: 'cn-beijing' },
      },
    },
  },
});

/**
 * 查找项目配置文件
 * 从当前目录向上查找 deploy.config.json
 */
export function findProjectConfigPath(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;
  
  while (currentDir !== path.dirname(currentDir)) {
    const configPath = path.join(currentDir, PROJECT_CONFIG_FILE);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

/**
 * 获取项目根目录
 */
export function getProjectRoot(startDir: string = process.cwd()): string | null {
  const configPath = findProjectConfigPath(startDir);
  return configPath ? path.dirname(configPath) : null;
}

/**
 * 读取项目配置
 */
export function loadProjectConfig(configPath?: string): ProjectConfig | null {
  const resolvedPath = configPath || findProjectConfigPath();
  
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content) as ProjectConfig;
  } catch (error) {
    console.error(`Failed to load config from ${resolvedPath}:`, error);
    return null;
  }
}

/**
 * 保存项目配置
 */
export function saveProjectConfig(config: ProjectConfig, configPath?: string): void {
  const resolvedPath = configPath || path.join(process.cwd(), PROJECT_CONFIG_FILE);
  fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2));
}

/**
 * 创建默认项目配置
 */
export function createDefaultProjectConfig(projectName: string): ProjectConfig {
  return {
    name: projectName,
    registry: {
      url: 'your-registry.cr.volces.com',
      namespace: 'your-namespace',
    },
    services: {
      api: {
        functionId: '',
        dockerfile: 'deployments/docker/Dockerfile',
        context: '.',
        imageName: `${projectName}-api`,
        platform: 'linux/amd64',
      },
    },
  };
}

/**
 * 获取全局配置
 */
export function getGlobalConfig(): Partial<GlobalConfig> {
  return globalConfig.store;
}

/**
 * 设置全局配置
 */
export function setGlobalConfig(key: string, value: unknown): void {
  globalConfig.set(key, value);
}

/**
 * 获取火山引擎凭证（优先使用环境变量）
 */
export function getVolcengineCredentials() {
  const cfg = getGlobalConfig();
  return {
    accessKeyId: process.env.VOLCENGINE_ACCESS_KEY_ID || cfg.volcengine?.accessKeyId || '',
    secretAccessKey: process.env.VOLCENGINE_SECRET_ACCESS_KEY || cfg.volcengine?.secretAccessKey || '',
    region: process.env.VOLCENGINE_REGION || cfg.volcengine?.region || 'cn-beijing',
  };
}

/**
 * 检查是否有有效的全局配置
 */
export function hasValidGlobalConfig(): boolean {
  const creds = getVolcengineCredentials();
  return !!(creds.accessKeyId && creds.secretAccessKey);
}

/**
 * 检查是否有有效的项目配置
 */
export function hasValidProjectConfig(): boolean {
  const config = loadProjectConfig();
  return !!(config && Object.keys(config.services).length > 0);
}

/**
 * 获取镜像完整标签
 */
export function getImageTag(
  registry: { url: string; namespace: string },
  imageName: string,
  version: string
): string {
  return `${registry.url}/${registry.namespace}/${imageName}:${version}`;
}

export { globalConfig };
