import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Logo, Header } from './Header.js';
import { StepIndicator } from './StepIndicator.js';
import { LogOutput, StatusMessage } from './LogOutput.js';
import type { Step, DeployOptions } from '../lib/types.js';
import type { ProjectConfig } from '../lib/config.js';
import { buildServiceImage, pushDockerImage, checkDocker } from '../lib/docker.js';
import { FaaSClient } from '../lib/faas-client.js';
import { 
  loadProjectConfig, 
  getProjectRoot, 
  getVolcengineCredentials,
  getImageTag,
} from '../lib/config.js';

interface DeployAppProps {
  options: DeployOptions;
  configPath?: string;
}

type DeployPhase = 'init' | 'build' | 'push' | 'sync' | 'update' | 'release' | 'done' | 'error';

export function DeployApp({ options, configPath }: DeployAppProps) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<DeployPhase>('init');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentService, setCurrentService] = useState<string | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);

  const addLog = useCallback((log: string) => {
    setLogs(prev => [...prev, log]);
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  // 加载配置并初始化步骤
  useEffect(() => {
    const config = loadProjectConfig(configPath);
    if (!config) {
      setError('No deploy.config.json found. Run `liminian-deploy init` to create one.');
      setPhase('error');
      return;
    }
    setProjectConfig(config);

    // 确定要部署的服务
    const servicesToDeploy = options.services?.length 
      ? options.services 
      : Object.keys(config.services);

    // 生成步骤
    const initialSteps: Step[] = [];
    for (const serviceName of servicesToDeploy) {
      const prefix = `${serviceName}`;
      initialSteps.push(
        { id: `${prefix}-build`, name: `Build ${serviceName}`, status: options.skipBuild ? 'skipped' : 'pending' },
        { id: `${prefix}-push`, name: `Push ${serviceName}`, status: options.skipPush ? 'skipped' : 'pending' },
        { id: `${prefix}-update`, name: `Update ${serviceName}`, status: 'pending' },
        { id: `${prefix}-sync`, name: `Sync ${serviceName}`, status: 'pending' },
        { id: `${prefix}-release`, name: `Release ${serviceName}`, status: 'pending' },
        { id: `${prefix}-wait-release`, name: `Wait Release ${serviceName}`, status: 'pending' },
      );
    }
    setSteps(initialSteps);
  }, [configPath, options.services, options.skipBuild, options.skipPush]);

  // 主部署流程
  useEffect(() => {
    if (!projectConfig || steps.length === 0) return;

    const deploy = async () => {
      try {
        // 检查 Docker
        const dockerAvailable = await checkDocker();
        if (!dockerAvailable) {
          throw new Error('Docker is not available. Please install and start Docker.');
        }

        const projectRoot = getProjectRoot() || process.cwd();
        const credentials = getVolcengineCredentials();

        // 创建 FaaS 客户端
        let faasClient: FaaSClient | null = null;
        if (!options.dryRun && credentials.accessKeyId && credentials.secretAccessKey) {
          faasClient = new FaaSClient(credentials);
        }

        // 确定要部署的服务
        const servicesToDeploy = options.services?.length 
          ? options.services 
          : Object.keys(projectConfig.services);

        for (const serviceName of servicesToDeploy) {
          setCurrentService(serviceName);
          const service = projectConfig.services[serviceName];
          
          if (!service) {
            addLog(`⚠️ Service "${serviceName}" not found, skipping`);
            continue;
          }

          const version = options.versions[serviceName] || 'latest';
          const imageTag = getImageTag(projectConfig.registry, service.imageName, version);
          const prefix = serviceName;

          // Build
          if (!options.skipBuild) {
            setPhase('build');
            const startTime = Date.now();
            updateStep(`${prefix}-build`, { status: 'running' });
            addLog(`🔨 Building ${serviceName}: ${imageTag}`);

            await buildServiceImage(
              projectRoot,
              projectConfig,
              serviceName,
              version,
              addLog
            );

            updateStep(`${prefix}-build`, {
              status: 'success',
              duration: Date.now() - startTime,
              message: imageTag,
            });
          }

          // Push
          if (!options.skipPush) {
            setPhase('push');
            const startTime = Date.now();
            updateStep(`${prefix}-push`, { status: 'running' });
            addLog(`📤 Pushing ${serviceName}: ${imageTag}`);

            await pushDockerImage({
              imageTag,
              onOutput: addLog,
            });

            updateStep(`${prefix}-push`, {
              status: 'success',
              duration: Date.now() - startTime,
            });
          }

          // FaaS 部署
          if (faasClient && service.functionId) {
            // 1. Update function (先告诉 veFaaS 用新镜像)
            setPhase('update');
            const updateStartTime = Date.now();
            updateStep(`${prefix}-update`, { status: 'running' });
            addLog(`🔄 Updating function: ${service.functionId}`);
            addLog(`   Image: ${imageTag}`);

            await faasClient.updateFunction(service.functionId, imageTag);

            updateStep(`${prefix}-update`, {
              status: 'success',
              duration: Date.now() - updateStartTime,
            });

            // 2. Wait for sync (veFaaS 同步镜像)
            setPhase('sync');
            const syncStartTime = Date.now();
            updateStep(`${prefix}-sync`, { status: 'running' });
            addLog(`⏳ Waiting for image sync...`);

            await faasClient.waitForImageSync(service.functionId, imageTag, {
              onProgress: (status) => {
                updateStep(`${prefix}-sync`, { message: status.Status });
              },
            });

            updateStep(`${prefix}-sync`, {
              status: 'success',
              duration: Date.now() - syncStartTime,
            });

            // 3. Release (触发发布)
            setPhase('release');
            const releaseStartTime = Date.now();
            updateStep(`${prefix}-release`, { status: 'running' });
            addLog(`🚀 Releasing function...`);

            await faasClient.release(service.functionId);

            updateStep(`${prefix}-release`, {
              status: 'success',
              duration: Date.now() - releaseStartTime,
            });

            // 4. Wait Release (等待发布完成)
            const waitReleaseStartTime = Date.now();
            updateStep(`${prefix}-wait-release`, { status: 'running' });
            addLog(`⏳ Waiting for release to complete...`);

            await faasClient.waitForRelease(service.functionId, {
              onProgress: (status) => {
                updateStep(`${prefix}-wait-release`, { message: status.Status });
              },
            });

            updateStep(`${prefix}-wait-release`, {
              status: 'success',
              duration: Date.now() - waitReleaseStartTime,
            });
          } else {
            // Skip FaaS steps
            const reason = !faasClient ? 'No credentials' : 'No function ID';
            updateStep(`${prefix}-update`, { status: 'skipped', message: reason });
            updateStep(`${prefix}-sync`, { status: 'skipped', message: reason });
            updateStep(`${prefix}-release`, { status: 'skipped', message: reason });
            updateStep(`${prefix}-wait-release`, { status: 'skipped', message: reason });
          }
        }

        setPhase('done');
        addLog('🎉 Deployment completed successfully!');
      } catch (err) {
        setPhase('error');
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        addLog(`❌ Error: ${message}`);
      }
    };

    deploy();
  }, [projectConfig, steps.length]);

  // 按 q 退出
  useInput((input) => {
    if (input === 'q' || phase === 'done' || phase === 'error') {
      exit();
    }
  });

  const subtitle = options.dryRun 
    ? '(Dry Run Mode)' 
    : currentService 
      ? `Deploying ${currentService}...` 
      : undefined;

  return (
    <Box flexDirection="column" padding={1}>
      <Logo />
      <Header
        title={`Deploy: ${projectConfig?.name || 'Unknown'}`}
        subtitle={subtitle}
      />

      <StepIndicator steps={steps} />

      {logs.length > 0 && (
        <LogOutput
          logs={logs}
          maxLines={6}
          title="Output"
        />
      )}

      {error && (
        <Box marginTop={1}>
          <StatusMessage type="error" message={error} />
        </Box>
      )}

      {phase === 'done' && (
        <Box marginTop={1}>
          <StatusMessage type="success" message="Deployment completed! Press any key to exit." />
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Press 'q' to exit
        </Text>
      </Box>
    </Box>
  );
}
