import { execa } from 'execa';
import path from 'path';
import type { ProjectConfig } from './config.js';

export interface DockerBuildOptions {
  projectRoot: string;
  dockerfile: string;
  context: string;
  imageTag: string;
  platform?: string;
  onOutput?: (line: string) => void;
}

export interface DockerPushOptions {
  imageTag: string;
  onOutput?: (line: string) => void;
}

/**
 * 构建 Docker 镜像
 */
export async function buildDockerImage(options: DockerBuildOptions): Promise<string> {
  const dockerfilePath = path.join(options.projectRoot, options.dockerfile);
  const contextPath = path.join(options.projectRoot, options.context);

  const args = [
    'build',
    '--platform', options.platform || 'linux/amd64',
    '-f', dockerfilePath,
    '-t', options.imageTag,
    contextPath,
  ];

  const subprocess = execa('docker', args, {
    cwd: options.projectRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  subprocess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => options.onOutput?.(line));
  });

  subprocess.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => options.onOutput?.(line));
  });

  await subprocess;
  return options.imageTag;
}

/**
 * 推送 Docker 镜像
 */
export async function pushDockerImage(options: DockerPushOptions): Promise<void> {
  const subprocess = execa('docker', ['push', options.imageTag], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  subprocess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => options.onOutput?.(line));
  });

  subprocess.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => options.onOutput?.(line));
  });

  await subprocess;
}

/**
 * 检查 Docker 是否可用
 */
export async function checkDocker(): Promise<boolean> {
  try {
    await execa('docker', ['version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查镜像是否存在
 */
export async function imageExists(imageTag: string): Promise<boolean> {
  try {
    await execa('docker', ['inspect', imageTag]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查 skopeo 是否安装
 */
export async function checkSkopeo(): Promise<boolean> {
  try {
    await execa('skopeo', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取远端镜像仓库的所有 tags
 * 使用 skopeo 来获取远端 tags（需要先安装 skopeo）
 */
export async function getRemoteTags(imageRef: string): Promise<{ tags: string[]; error?: string }> {
  // 解析镜像地址: registry/namespace/image
  const match = imageRef.match(/^([^/]+)\/([^/]+)\/([^:]+)$/);
  if (!match) {
    return { tags: [], error: `无效的镜像地址: ${imageRef}` };
  }
  
  const [, registry, namespace, imageName] = match;
  
  // 检查 skopeo 是否安装
  const hasSkopeo = await checkSkopeo();
  if (!hasSkopeo) {
    return { 
      tags: [], 
      error: '需要安装 skopeo 才能查询远端 tags\n   安装方式: brew install skopeo (macOS) 或 apt install skopeo (Linux)' 
    };
  }
  
  // 使用 skopeo 获取 tags（让 skopeo 自己找认证文件）
  // skopeo 默认搜索: ~/.config/containers/auth.json, ~/.docker/config.json
  const skopeoArgs = [
    'list-tags',
    `docker://${registry}/${namespace}/${imageName}`
  ];
  const cmd = `skopeo ${skopeoArgs.join(' ')}`;
  
  try {
    const { stdout } = await execa('skopeo', skopeoArgs);
    const result = JSON.parse(stdout);
    return { tags: result.Tags || [] };
  } catch (err: unknown) {
    // 获取 stderr 或 message
    let errorOutput = '';
    if (err && typeof err === 'object' && 'stderr' in err) {
      errorOutput = String((err as { stderr: unknown }).stderr);
    }
    if (!errorOutput && err instanceof Error) {
      errorOutput = err.message;
    }
    
    return { 
      tags: [], 
      error: `skopeo 失败: ${errorOutput}\n命令: ${cmd}` 
    };
  }
}

/**
 * 从 tags 列表中找到最新的语义化版本
 * 支持 v0.1.19 和 0.1.19 两种格式
 */
export function findLatestVersion(tags: string[]): string | null {
  // 匹配 v0.1.19 或 0.1.19 格式
  const versionRegex = /^v?(\d+)\.(\d+)\.(\d+)$/;
  
  const versionTags = tags
    .filter(tag => versionRegex.test(tag))
    .sort((a, b) => {
      const aMatch = a.match(versionRegex)!;
      const bMatch = b.match(versionRegex)!;
      const [aMajor, aMinor, aPatch] = [aMatch[1], aMatch[2], aMatch[3]].map(Number);
      const [bMajor, bMinor, bPatch] = [bMatch[1], bMatch[2], bMatch[3]].map(Number);
      
      if (aMajor !== bMajor) return bMajor - aMajor;
      if (aMinor !== bMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    });
  
  return versionTags[0] || null;
}

/**
 * 从项目配置构建服务的镜像
 */
export async function buildServiceImage(
  projectRoot: string,
  config: ProjectConfig,
  serviceName: string,
  version: string,
  onOutput?: (line: string) => void
): Promise<string> {
  const service = config.services[serviceName];
  if (!service) {
    throw new Error(`Service "${serviceName}" not found in config`);
  }

  const imageTag = `${config.registry.url}/${config.registry.namespace}/${service.imageName}:${version}`;

  await buildDockerImage({
    projectRoot,
    dockerfile: service.dockerfile,
    context: service.context,
    imageTag,
    platform: service.platform,
    onOutput,
  });

  return imageTag;
}
