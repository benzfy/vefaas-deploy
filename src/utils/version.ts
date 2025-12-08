/**
 * 版本号工具函数
 * 支持 v0.1.0 和 0.1.0 两种格式，输出统一为 v0.1.0 格式
 */

/**
 * 验证版本号格式 (支持 v0.1.0 和 0.1.0)
 */
export function isValidVersion(version: string): boolean {
  return /^v?\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
}

/**
 * 递增版本号（输出始终带 v 前缀）
 */
export function incrementVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  let [, majorStr, minorStr, patchStr] = match;
  let major = Number(majorStr);
  let minor = Number(minorStr);
  let patch = Number(patchStr);

  switch (type) {
    case 'major':
      major++;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor++;
      patch = 0;
      break;
    case 'patch':
      patch++;
      break;
  }

  return `v${major}.${minor}.${patch}`;
}

/**
 * 比较版本号
 */
export function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const match = v.match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  };

  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/**
 * 生成带时间戳的版本号
 */
export function generateTimestampVersion(base: string = 'v0.0.0'): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 5).replace(':', '');
  return `${base}-${timestamp}.${time}`;
}

/**
 * 从镜像 URI 中解析版本号
 * 例如: ai-image-cn-beijing.cr.volces.com/ai-image/liminian:v0.1.6 => v0.1.6
 * 例如: ai-image-cn-beijing.cr.volces.com/ai-image/liminian:0.1.6 => 0.1.6
 */
export function parseVersionFromImageUri(imageUri: string): string | null {
  const match = imageUri.match(/:([^:]+)$/);
  if (!match) return null;
  
  const tag = match[1];
  if (isValidVersion(tag)) {
    return tag;
  }
  return null;
}

/**
 * 标准化版本号（确保有 v 前缀）
 */
export function normalizeVersion(version: string): string {
  if (version.startsWith('v')) {
    return version;
  }
  return `v${version}`;
}

/**
 * 获取下一个版本号
 */
export function getNextVersion(currentVersion: string | null, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  if (!currentVersion || !isValidVersion(currentVersion)) {
    return 'v0.0.1';
  }
  return incrementVersion(currentVersion, type);
}

