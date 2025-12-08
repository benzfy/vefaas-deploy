#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { DeployApp } from './components/DeployApp.js';
import { ConfigWizard } from './components/ConfigWizard.js';
import { ProjectConfigWizard } from './components/ProjectConfigWizard.js';
import { Guide } from './components/Guide.js';
import { Welcome } from './components/Welcome.js';
import { MainMenu } from './components/MainMenu.js';
import { 
  hasValidGlobalConfig, 
  hasValidProjectConfig,
  loadProjectConfig,
  saveProjectConfig,
  createDefaultProjectConfig,
  findProjectConfigPath,
  getProjectRoot,
  getVolcengineCredentials,
} from './lib/config.js';
import { FaaSClient } from './lib/faas-client.js';
import { getRemoteTags, findLatestVersion, checkDocker, checkSkopeo } from './lib/docker.js';
import { parseVersionFromImageUri, getNextVersion } from './utils/version.js';
import type { DeployOptions } from './lib/types.js';
import { saveDeployGuide } from './lib/guide-generator.js';

/**
 * 从 veFaaS 获取函数当前运行的镜像版本
 */
async function fetchFunctionImages(
  config: ReturnType<typeof loadProjectConfig>
): Promise<Record<string, { functionId: string; imageUri: string | null; version: string | null }>> {
  if (!config) {
    throw new Error('找不到配置文件');
  }

  const credentials = getVolcengineCredentials();
  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('未配置火山引擎凭证，请先运行 `vefaas-deploy config`');
  }

  const faasClient = new FaaSClient(credentials);
  const results: Record<string, { functionId: string; imageUri: string | null; version: string | null }> = {};

  for (const [serviceName, service] of Object.entries(config.services)) {
    if (!service.functionId) {
      results[serviceName] = { functionId: '(未配置)', imageUri: null, version: null };
      continue;
    }

    try {
      const functionInfo = await faasClient.getFunction(service.functionId);
      const imageUri = functionInfo.Source || null;
      const version = imageUri ? parseVersionFromImageUri(imageUri) : null;
      
      results[serviceName] = { functionId: service.functionId, imageUri, version };
    } catch (error) {
      console.error(`获取 ${serviceName} 信息失败: ${error}`);
      results[serviceName] = { functionId: service.functionId, imageUri: null, version: null };
    }
  }

  return results;
}

/**
 * 从 Docker 远端仓库获取最新版本，并计算下一个版本
 */
async function fetchLatestVersionsFromRegistry(
  config: ReturnType<typeof loadProjectConfig>,
  bumpType: 'major' | 'minor' | 'patch' = 'patch'
): Promise<Record<string, { latest: string | null; next: string; tags: string[] }>> {
  if (!config) {
    throw new Error('找不到配置文件');
  }

  const results: Record<string, { latest: string | null; next: string; tags: string[] }> = {};

  for (const [serviceName, service] of Object.entries(config.services)) {
    const imageRef = `${config.registry.url}/${config.registry.namespace}/${service.imageName}`;
    
    console.log(`   正在查询 ${serviceName} 的远端 tags...`);
    const result = await getRemoteTags(imageRef);
    
    if (result.error) {
      console.error(`   ⚠️  ${result.error}`);
      results[serviceName] = { latest: null, next: 'v0.0.1', tags: [] };
    } else {
      const latestVersion = findLatestVersion(result.tags);
      const nextVersion = getNextVersion(latestVersion, bumpType);
      results[serviceName] = { latest: latestVersion, next: nextVersion, tags: result.tags };
    }
  }

  return results;
}

const program = new Command();

program
  .name('vefaas-deploy')
  .description('火山引擎函数服务 (veFaaS) 部署工具 - Build and deploy to Volcengine FaaS')
  .version('1.0.0');

// guide 命令 - 显示中文使用指南
program
  .command('guide')
  .alias('help-cn')
  .description('显示中文使用指南')
  .action(() => {
    render(<Guide />);
  });

// deploy 命令
program
  .command('deploy')
  .description('构建并部署到 FaaS (Build → Push → Update → Release)')
  .option('-s, --services <services>', '要部署的服务，逗号分隔 (Services to deploy)')
  .option('-v, --version <version>', '所有服务的版本号 (e.g., v0.1.6)')
  .option('--versions <versions>', '各服务单独指定版本 (e.g., api:v0.1.6,worker:v0.1.3)')
  .option('--auto', '自动递增 patch 版本 (v0.1.6 → v0.1.7)')
  .option('--auto-minor', '自动递增 minor 版本 (v0.1.6 → v0.2.0)')
  .option('--auto-major', '自动递增 major 版本 (v0.1.6 → v1.0.0)')
  .option('--skip-build', '跳过构建步骤 (Skip Docker build)')
  .option('--skip-push', '跳过推送步骤 (Skip Docker push)')
  .option('--dry-run', '试运行，不实际部署 (Dry run mode)')
  .option('-c, --config <path>', '配置文件路径 (Path to deploy.config.json)')
  .action(async (opts) => {
    const versions: Record<string, string> = {};
    const config = loadProjectConfig(opts.config);

    // 自动获取版本（基于远端仓库最新 tag）
    if (opts.auto || opts.autoMinor || opts.autoMajor) {
      const bumpType = opts.autoMajor ? 'major' : opts.autoMinor ? 'minor' : 'patch';
      console.log(`🔍 正在从远端仓库获取最新版本...`);
      
      try {
        const versionInfo = await fetchLatestVersionsFromRegistry(config, bumpType);
        
        console.log('');
        console.log('📦 版本信息:');
        for (const [service, info] of Object.entries(versionInfo)) {
          console.log(`   ${service}: ${info.latest || '(无)'} → ${info.next}`);
          versions[service] = info.next;
        }
        console.log('');
      } catch (error) {
        console.error(`❌ 错误: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    }
    
    if (opts.versions) {
      opts.versions.split(',').forEach((pair: string) => {
        const [service, version] = pair.split(':');
        if (service && version) {
          versions[service.trim()] = version.trim();
        }
      });
    }
    
    if (opts.version) {
      if (config) {
        Object.keys(config.services).forEach(service => {
          if (!versions[service]) {
            versions[service] = opts.version;
          }
        });
      }
    }

    if (Object.keys(versions).length === 0 && !opts.skipBuild) {
      console.error('❌ 错误: 请指定版本号');
      console.error('');
      console.error('示例:');
      console.error('  vefaas-deploy deploy --version v0.1.6    # 指定版本');
      console.error('  vefaas-deploy deploy --auto              # 自动递增 patch');
      console.error('  vefaas-deploy deploy --auto-minor        # 自动递增 minor');
      process.exit(1);
    }

    const options: DeployOptions = {
      services: opts.services ? opts.services.split(',').map((s: string) => s.trim()) : undefined,
      versions,
      skipBuild: opts.skipBuild,
      skipPush: opts.skipPush,
      dryRun: opts.dryRun,
    };

    render(<DeployApp options={options} configPath={opts.config} />);
  });

// build 命令
program
  .command('build')
  .description('只构建 Docker 镜像 (Build only)')
  .option('-s, --services <services>', '要构建的服务')
  .option('-v, --version <version>', '版本号')
  .option('--versions <versions>', '各服务单独指定版本')
  .option('-c, --config <path>', '配置文件路径')
  .action((opts) => {
    const versions: Record<string, string> = {};
    
    if (opts.versions) {
      opts.versions.split(',').forEach((pair: string) => {
        const [service, version] = pair.split(':');
        if (service && version) {
          versions[service.trim()] = version.trim();
        }
      });
    }
    
    if (opts.version) {
      const config = loadProjectConfig(opts.config);
      if (config) {
        Object.keys(config.services).forEach(service => {
          if (!versions[service]) {
            versions[service] = opts.version;
          }
        });
      }
    }

    if (Object.keys(versions).length === 0) {
      console.error('❌ 错误: 请指定版本号 --version');
      process.exit(1);
    }

    const options: DeployOptions = {
      services: opts.services ? opts.services.split(',').map((s: string) => s.trim()) : undefined,
      versions,
      skipPush: true,
      dryRun: true,
    };

    render(<DeployApp options={options} configPath={opts.config} />);
  });

// push 命令
program
  .command('push')
  .description('只推送镜像 (Push only)')
  .option('-s, --services <services>', '要推送的服务')
  .option('-v, --version <version>', '版本号')
  .option('--versions <versions>', '各服务单独指定版本')
  .option('-c, --config <path>', '配置文件路径')
  .action((opts) => {
    const versions: Record<string, string> = {};
    
    if (opts.versions) {
      opts.versions.split(',').forEach((pair: string) => {
        const [service, version] = pair.split(':');
        if (service && version) {
          versions[service.trim()] = version.trim();
        }
      });
    }
    
    if (opts.version) {
      const config = loadProjectConfig(opts.config);
      if (config) {
        Object.keys(config.services).forEach(service => {
          if (!versions[service]) {
            versions[service] = opts.version;
          }
        });
      }
    }

    const options: DeployOptions = {
      services: opts.services ? opts.services.split(',').map((s: string) => s.trim()) : undefined,
      versions,
      skipBuild: true,
      dryRun: true,
    };

    render(<DeployApp options={options} configPath={opts.config} />);
  });

// init 命令
program
  .command('init')
  .description('初始化项目配置 (交互式向导)')
  .option('-n, --name <name>', '项目名称（非交互模式）')
  .option('--simple', '创建简单模板，不启动向导')
  .action((opts) => {
    if (opts.simple && opts.name) {
      const config = createDefaultProjectConfig(opts.name);
      saveProjectConfig(config);
      console.log('✅ 已创建 deploy.config.json');
      console.log('📝 请编辑文件配置你的服务');
    } else {
      render(<ProjectConfigWizard />);
    }
  });

// config 命令
program
  .command('config')
  .description('配置火山引擎凭证 (全局设置)')
  .action(() => {
    render(<ConfigWizard mode="config" />);
  });

// check 命令 - 一键检查所有配置状态
program
  .command('check')
  .description('检查部署环境和配置状态')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (opts) => {
    console.log('🔍 正在检查部署环境...\n');
    
    const results: { name: string; status: 'ok' | 'warning' | 'error'; message: string }[] = [];

    // 1. 检查 Docker
    const dockerOk = await checkDocker();
    results.push({
      name: 'Docker',
      status: dockerOk ? 'ok' : 'error',
      message: dockerOk ? '已安装并运行' : '未安装或未启动，请先安装 Docker',
    });

    // 2. 检查 skopeo
    const skopeoOk = await checkSkopeo();
    results.push({
      name: 'Skopeo',
      status: skopeoOk ? 'ok' : 'warning',
      message: skopeoOk 
        ? '已安装' 
        : '未安装 (--auto 版本递增功能不可用)\n   安装: brew install skopeo (macOS) 或 apt install skopeo (Linux)',
    });

    // 3. 检查火山引擎凭证
    const credentials = getVolcengineCredentials();
    const credentialsOk = !!(credentials.accessKeyId && credentials.secretAccessKey);
    results.push({
      name: '火山引擎凭证',
      status: credentialsOk ? 'ok' : 'error',
      message: credentialsOk 
        ? `已配置 (AK: ${credentials.accessKeyId.slice(0, 8)}...)` 
        : '未配置，请运行: vefaas-deploy config',
    });

    // 4. 检查项目配置文件
    const config = loadProjectConfig(opts.config);
    const configPath = findProjectConfigPath(opts.config);
    
    if (config) {
      results.push({
        name: '项目配置',
        status: 'ok',
        message: `已找到 ${configPath}`,
      });

      // 5. 检查镜像仓库配置
      results.push({
        name: '镜像仓库',
        status: 'ok',
        message: `${config.registry.url}/${config.registry.namespace}`,
      });

      // 6. 检查各服务配置
      for (const [serviceName, service] of Object.entries(config.services)) {
        const hasFunctionId = !!service.functionId;
        results.push({
          name: `服务 [${serviceName}]`,
          status: hasFunctionId ? 'ok' : 'warning',
          message: hasFunctionId 
            ? `函数ID: ${service.functionId}, 镜像: ${service.imageName}`
            : `镜像: ${service.imageName} (未配置函数ID，只能构建不能部署)`,
        });
      }

      // 7. 如果凭证OK且有函数ID，尝试验证函数是否存在
      if (credentialsOk) {
        const faasClient = new FaaSClient(credentials);
        for (const [serviceName, service] of Object.entries(config.services)) {
          if (service.functionId) {
            try {
              const fn = await faasClient.getFunction(service.functionId);
              results.push({
                name: `函数验证 [${serviceName}]`,
                status: 'ok',
                message: `函数 "${fn.Name}" 存在且可访问`,
              });
            } catch (error) {
              results.push({
                name: `函数验证 [${serviceName}]`,
                status: 'error',
                message: `函数 ${service.functionId} 不存在或无权访问`,
              });
            }
          }
        }
      }
    } else {
      results.push({
        name: '项目配置',
        status: 'error',
        message: '未找到 deploy.config.json，请运行: vefaas-deploy init',
      });
    }

    // 输出结果
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ 检查项                    │ 状态                               │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    
    for (const result of results) {
      const icon = result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️ ' : '❌';
      const name = result.name.padEnd(22);
      console.log(`│ ${icon} ${name} │ ${result.message.split('\n')[0].slice(0, 35).padEnd(35)} │`);
      // 如果有多行消息，输出额外行
      const extraLines = result.message.split('\n').slice(1);
      for (const line of extraLines) {
        console.log(`│    ${' '.repeat(22)} │ ${line.slice(0, 35).padEnd(35)} │`);
      }
    }
    
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // 总结
    const errors = results.filter(r => r.status === 'error');
    const warnings = results.filter(r => r.status === 'warning');
    
    console.log('');
    if (errors.length === 0 && warnings.length === 0) {
      console.log('🎉 所有检查通过！可以开始部署。');
    } else if (errors.length === 0) {
      console.log(`⚠️  有 ${warnings.length} 个警告，但不影响基本部署功能。`);
    } else {
      console.log(`❌ 有 ${errors.length} 个错误需要修复：`);
      for (const err of errors) {
        console.log(`   - ${err.name}: ${err.message}`);
      }
    }
  });

// function 命令组 - veFaaS 函数管理
const functionCmd = program
  .command('function')
  .alias('fn')
  .description('veFaaS 函数管理');

// function list - 列出所有函数
functionCmd
  .command('list')
  .alias('ls')
  .description('列出所有 veFaaS 函数')
  .option('-n, --name <name>', '按名称筛选')
  .action(async (opts) => {
    const credentials = getVolcengineCredentials();
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      console.error('❌ 未配置火山引擎凭证，请先运行 `vefaas-deploy config`');
      process.exit(1);
    }

    console.log('🔍 正在获取函数列表...\n');

    try {
      const faasClient = new FaaSClient(credentials);
      const result = await faasClient.listFunctions({ name: opts.name });
      
      if (result.Items.length === 0) {
        console.log('(没有找到函数)');
        return;
      }

      console.log('┌────────────────────────────────────────────────────────────────┐');
      console.log('│ 函数名称                  │ 函数 ID        │ Runtime          │');
      console.log('├────────────────────────────────────────────────────────────────┤');
      
      for (const fn of result.Items) {
        const name = fn.Name.slice(0, 24).padEnd(25);
        const id = fn.Id.padEnd(14);
        const runtime = (fn.Runtime || '-').padEnd(16);
        console.log(`│ ${name} │ ${id} │ ${runtime} │`);
      }
      
      console.log('└────────────────────────────────────────────────────────────────┘');
      console.log(`\n共 ${result.Total} 个函数`);
    } catch (error) {
      console.error(`❌ 错误: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// function info - 查看函数详情
functionCmd
  .command('info <functionId>')
  .description('查看函数详情')
  .action(async (functionId) => {
    const credentials = getVolcengineCredentials();
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      console.error('❌ 未配置火山引擎凭证，请先运行 `vefaas-deploy config`');
      process.exit(1);
    }

    console.log(`🔍 正在获取函数 ${functionId} 的信息...\n`);

    try {
      const faasClient = new FaaSClient(credentials);
      const fn = await faasClient.getFunction(functionId);
      
      console.log('┌─────────────────────────────────────────────────────────────────────┐');
      console.log(`│ 函数详情                                                            │`);
      console.log('├─────────────────────────────────────────────────────────────────────┤');
      console.log(`│ 名称:     ${fn.Name.padEnd(58)} │`);
      console.log(`│ ID:       ${fn.Id.padEnd(58)} │`);
      console.log(`│ Runtime:  ${(fn.Runtime || '-').padEnd(58)} │`);
      console.log(`│ 描述:     ${(fn.Description || '-').slice(0, 58).padEnd(58)} │`);
      console.log('├─────────────────────────────────────────────────────────────────────┤');
      
      const imageUri = fn.Source;
      if (imageUri) {
        console.log(`│ 镜像类型: ${(fn.SourceType || 'image').padEnd(58)} │`);
        console.log(`│ 镜像 URI: ${imageUri.slice(0, 58).padEnd(58)} │`);
        if (imageUri.length > 58) {
          console.log(`│           ${imageUri.slice(58).padEnd(58)} │`);
        }
        const version = parseVersionFromImageUri(imageUri);
        if (version) {
          console.log(`│ 版本:     ${version.padEnd(58)} │`);
        }
      } else {
        console.log(`│ 镜像:     (未配置)${' '.repeat(49)} │`);
      }
      
      console.log('└─────────────────────────────────────────────────────────────────────┘');
    } catch (error) {
      console.error(`❌ 错误: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// function current - 查看项目配置的函数当前镜像
functionCmd
  .command('current')
  .description('查看项目配置的函数当前运行的镜像')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (opts) => {
    const config = loadProjectConfig(opts.config);
    if (!config) {
      console.error('❌ 找不到 deploy.config.json');
      process.exit(1);
    }

    console.log(`🔍 正在获取 ${config.name} 函数的镜像信息...\n`);

    try {
      const imageInfo = await fetchFunctionImages(config);
      
      console.log('┌───────────────────────────────────────────────────────────────────────┐');
      console.log('│ 服务             │ 函数 ID        │ 当前运行的镜像版本                 │');
      console.log('├───────────────────────────────────────────────────────────────────────┤');
      
      for (const [service, info] of Object.entries(imageInfo)) {
        const svcPadded = service.padEnd(16);
        const fidPadded = (info.functionId.slice(0, 12) + (info.functionId.length > 12 ? '..' : '')).padEnd(14);
        const verPadded = (info.version || info.imageUri || '(未部署)').slice(0, 34).padEnd(34);
        console.log(`│ ${svcPadded} │ ${fidPadded} │ ${verPadded} │`);
      }
      
      console.log('└───────────────────────────────────────────────────────────────────────┘');
      console.log('');
      console.log('💡 这是函数当前正在运行的镜像');
      console.log('   使用 vefaas-deploy images 查看远端仓库的版本');
    } catch (error) {
      console.error(`❌ 错误: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// images 命令 - 查看远端仓库的镜像版本
program
  .command('images')
  .description('查看远端仓库的镜像版本')
  .option('-c, --config <path>', '配置文件路径')
  .option('-a, --all', '显示所有 tags，不仅限于语义化版本')
  .action(async (opts) => {
    const config = loadProjectConfig(opts.config);
    if (!config) {
      console.error('❌ 找不到 deploy.config.json');
      process.exit(1);
    }

    console.log(`🔍 正在查询 ${config.name} 的镜像版本...\n`);

    try {
      const versionInfo = await fetchLatestVersionsFromRegistry(config, 'patch');
      
      for (const [service, info] of Object.entries(versionInfo)) {
        const imageRef = `${config.registry.url}/${config.registry.namespace}/${config.services[service].imageName}`;
        console.log(`📦 ${service}`);
        console.log(`   镜像: ${imageRef}`);
        console.log(`   最新版本: ${info.latest || '(无)'}`);
        console.log(`   下一版本: ${info.next}`);
        
        if (info.tags.length > 0) {
          const versionTags = info.tags.filter(t => /^v\d+\.\d+\.\d+$/.test(t)).sort().reverse();
          const displayTags = opts.all ? info.tags : versionTags.slice(0, 10);
          console.log(`   历史版本: ${displayTags.join(', ') || '(无)'}`);
          if (!opts.all && versionTags.length > 10) {
            console.log(`   ... 共 ${versionTags.length} 个版本，使用 --all 查看全部`);
          }
        } else {
          console.log(`   历史版本: (查询失败，详见上方错误信息)`);
        }
        console.log('');
      }
      
      console.log('💡 使用 --auto 基于最新版本自动递增:');
      console.log('   vefaas-deploy deploy --auto');
    } catch (error) {
      console.error(`❌ 错误: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// gen-guide 命令 - 生成 AI 友好的配置指南
program
  .command('gen-guide')
  .description('生成 deploy_guide.md (供 AI 理解配置文件)')
  .action(() => {
    const projectRoot = getProjectRoot() || process.cwd();
    const config = loadProjectConfig();
    const guidePath = saveDeployGuide(projectRoot, config || undefined);
    console.log(`✅ 已生成配置指南: ${guidePath}`);
    console.log('');
    console.log('这个文件用于帮助 AI 理解如何生成 deploy.config.json');
    console.log('你可以把它放在项目中，让 AI 参考生成配置。');
  });

// 默认行为：显示交互式主菜单
program.action(() => {
  render(<MainMenu />);
});

program.parse();
