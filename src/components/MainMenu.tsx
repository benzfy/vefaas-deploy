import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { StatusMessage } from './LogOutput.js';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { Logo } from './Header.js';
import { Guide } from './Guide.js';
import { DeployApp } from './DeployApp.js';
import { ConfigWizard } from './ConfigWizard.js';
import { ProjectConfigWizard } from './ProjectConfigWizard.js';
import { 
  loadProjectConfig, 
  findProjectConfigPath,
  hasValidGlobalConfig,
  getProjectRoot,
} from '../lib/config.js';
import { saveDeployGuide } from '../lib/guide-generator.js';
import { getRemoteTags, findLatestVersion } from '../lib/docker.js';
import { getNextVersion } from '../utils/version.js';
import type { DeployOptions } from '../lib/types.js';

type MenuScreen = 
  | 'main'
  | 'deploy_version'
  | 'deploy_service'
  | 'deploying'
  | 'building'
  | 'config'
  | 'init'
  | 'guide';

export function MainMenu() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<MenuScreen>('main');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [version, setVersion] = useState('');
  const [deployOptions, setDeployOptions] = useState<DeployOptions | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 版本信息状态
  const [versionInfo, setVersionInfo] = useState<{
    loading: boolean;
    latest: string | null;
    suggested: string;
    error?: string;
  }>({ loading: false, latest: null, suggested: 'v0.0.1' });

  const configPath = findProjectConfigPath();
  const config = loadProjectConfig();
  const hasCredentials = hasValidGlobalConfig();
  const services = config ? Object.keys(config.services) : [];
  
  // 当进入版本输入界面时，自动查询最新版本
  useEffect(() => {
    if (screen !== 'deploy_version' || !config) return;
    
    // 使用已选中的服务，如果没有则取第一个
    const targetServices = selectedServices.length > 0 
      ? selectedServices 
      : Object.keys(config.services);
    
    if (targetServices.length === 0) return;
    
    // 避免重复查询
    if (versionInfo.loading) return;
    
    setVersionInfo(prev => ({ ...prev, loading: true }));
    
    // 取第一个选中的服务来查询版本
    const firstService = targetServices[0];
    const service = config.services[firstService];
    const imageRef = `${config.registry.url}/${config.registry.namespace}/${service.imageName}`;
    
    getRemoteTags(imageRef).then(result => {
      if (result.error) {
        setVersionInfo({
          loading: false,
          latest: null,
          suggested: 'v0.0.1',
          error: result.error,
        });
      } else {
        const latest = findLatestVersion(result.tags);
        const suggested = getNextVersion(latest, 'patch');
        setVersionInfo({
          loading: false,
          latest,
          suggested,
        });
        // 自动填入建议版本
        setVersion(prev => prev || suggested);
      }
    });
  }, [screen, selectedServices]);

  const handleMainMenuSelect = useCallback((item: { value: string }) => {
    // 清除之前的消息
    setMessage(null);
    
    switch (item.value) {
      case 'deploy':
        if (!configPath) {
          setScreen('init');
        } else if (services.length <= 1) {
          // 只有一个服务，直接进入版本输入
          setSelectedServices(services);
          setScreen('deploy_version');
        } else {
          // 多个服务，先选择服务
          setScreen('deploy_service');
        }
        break;
      case 'build':
        setScreen('deploy_version');
        break;
      case 'init':
        setScreen('init');
        break;
      case 'config':
        setScreen('config');
        break;
      case 'guide':
        setScreen('guide');
        break;
      case 'gen_guide':
        setIsGenerating(true);
        // 假装有个生成过程
        setTimeout(() => {
          try {
            const projectRoot = getProjectRoot() || process.cwd();
            const guidePath = saveDeployGuide(projectRoot, config || undefined);
            setMessage({ type: 'success', text: `✅ 已生成 AI 配置指南: ${guidePath}` });
          } catch (err) {
            setMessage({ type: 'error', text: `生成失败: ${err}` });
          }
          setIsGenerating(false);
        }, 800);
        break;
      case 'exit':
        exit();
        break;
    }
  }, [configPath, config, services, exit]);

  const handleVersionSubmit = useCallback(() => {
    if (!version.trim()) return;
    
    // 使用已选中的服务开始部署
    const targetServices = selectedServices.length > 0 ? selectedServices : services;
    const versions: Record<string, string> = {};
    targetServices.forEach(s => { versions[s] = version; });
    
    setDeployOptions({
      services: targetServices.length === services.length ? undefined : targetServices,
      versions,
      skipBuild: false,
      skipPush: false,
      dryRun: false,
    });
    setScreen('deploying');
  }, [version, services, selectedServices]);

  const handleServiceSelect = useCallback((item: { value: string }) => {
    // 记住选中的服务，然后进入版本输入界面
    if (item.value === 'all') {
      setSelectedServices(services);
    } else {
      setSelectedServices([item.value]);
    }
    setScreen('deploy_version');
  }, [services]);

  useInput((input, key) => {
    if (key.escape) {
      if (screen === 'main') {
        exit();
      } else {
        setScreen('main');
        setVersion('');
        setSelectedServices([]);
        setVersionInfo({ loading: false, latest: null, suggested: 'v0.0.1' });
      }
    }
  });

  // 渲染不同屏幕
  if (screen === 'config') {
    return <ConfigWizard mode="config" onComplete={() => setScreen('main')} />;
  }

  if (screen === 'init') {
    return <ProjectConfigWizard onComplete={() => setScreen('main')} />;
  }

  if (screen === 'guide') {
    return (
      <Box flexDirection="column">
        <Guide />
        <Box marginTop={1} paddingX={1}>
          <Text color="gray" dimColor>按 ESC 返回主菜单</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'deploying' && deployOptions) {
    return <DeployApp options={deployOptions} />;
  }

  // 主菜单
  const mainMenuItems = [
    { 
      label: `🚀 部署 ${config ? `(${config.name})` : ''}`, 
      value: 'deploy',
    },
    { label: '📄 初始化/编辑项目配置', value: 'init' },
    { label: '🔑 配置火山引擎凭证', value: 'config' },
    { label: '📖 使用指南', value: 'guide' },
    { label: '🤖 生成 AI 配置指南', value: 'gen_guide' },
    { label: '❌ 退出', value: 'exit' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Logo />

      {/* 状态栏 */}
      <Box 
        borderStyle="round" 
        borderColor={configPath ? 'green' : 'yellow'} 
        paddingX={2} 
        marginBottom={1}
      >
        <Box flexDirection="column">
          {configPath ? (
            <>
              <Box>
                <Text color="gray">📦 项目: </Text>
                <Text color="cyan" bold>{config?.name}</Text>
              </Box>
              <Box>
                <Text color="gray">🔧 服务: </Text>
                <Text color="white">{services.join(', ') || '无'}</Text>
              </Box>
            </>
          ) : (
            <Text color="yellow">⚠️ 未找到项目配置，请先初始化</Text>
          )}
          <Box>
            <Text color="gray">🔑 凭证: </Text>
            {hasCredentials ? (
              <Text color="green">✓ 已配置</Text>
            ) : (
              <Text color="red">✗ 未配置</Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* 主菜单 */}
      {screen === 'main' && (
        <Box flexDirection="column">
          {/* 生成中提示 */}
          {isGenerating && (
            <Box marginBottom={1}>
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
              <Text color="cyan"> 正在生成 AI 配置指南...</Text>
            </Box>
          )}
          {/* 消息提示 - 放在菜单上方更明显 */}
          {!isGenerating && message && (
            <Box 
              marginBottom={1} 
              borderStyle="round" 
              borderColor={message.type === 'success' ? 'green' : 'red'}
              paddingX={1}
            >
              <Text color={message.type === 'success' ? 'green' : 'red'}>
                {message.text}
              </Text>
            </Box>
          )}
          <Text color="gray" dimColor>选择操作:</Text>
          <SelectInput items={mainMenuItems} onSelect={handleMainMenuSelect} />
        </Box>
      )}

      {/* 版本输入 */}
      {screen === 'deploy_version' && (
        <Box flexDirection="column">
          {/* 显示选中的服务 */}
          <Box marginBottom={1}>
            <Text color="gray">🎯 部署服务: </Text>
            <Text color="cyan" bold>
              {selectedServices.length === services.length 
                ? '全部服务' 
                : selectedServices.join(', ')}
            </Text>
          </Box>
          
          {/* 版本信息提示 */}
          {versionInfo.loading ? (
            <Box marginBottom={1}>
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
              <Text color="gray"> 正在查询 {selectedServices[0]} 的远端最新版本...</Text>
            </Box>
          ) : versionInfo.error ? (
            <Box marginBottom={1}>
              <Text color="yellow">⚠️ 无法获取最新版本: {versionInfo.error.split('\n')[0]}</Text>
            </Box>
          ) : (
            <Box marginBottom={1} flexDirection="column">
              <Box>
                <Text color="gray">📦 当前最新版本: </Text>
                <Text color="green" bold>{versionInfo.latest || '(无)'}</Text>
              </Box>
              <Box>
                <Text color="gray">💡 建议版本: </Text>
                <Text color="cyan" bold>{versionInfo.suggested}</Text>
              </Box>
            </Box>
          )}
          
          <Text color="cyan">输入版本号:</Text>
          <Box marginTop={1}>
            <Text color="gray">{'> '}</Text>
            <TextInput
              value={version}
              onChange={setVersion}
              onSubmit={handleVersionSubmit}
              placeholder={versionInfo.suggested}
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>按 Enter 确认，ESC 返回</Text>
          </Box>
        </Box>
      )}

      {/* 服务选择 */}
      {screen === 'deploy_service' && (
        <Box flexDirection="column">
          <Text color="cyan">选择要部署的服务 (版本: {version}):</Text>
          <SelectInput 
            items={[
              { label: '🌐 全部服务', value: 'all' },
              ...services.map(s => ({ 
                label: `📦 ${s}`, 
                value: s 
              })),
            ]} 
            onSelect={handleServiceSelect} 
          />
          <Box marginTop={1}>
            <Text color="gray" dimColor>ESC 返回</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>ESC 退出</Text>
      </Box>
    </Box>
  );
}

