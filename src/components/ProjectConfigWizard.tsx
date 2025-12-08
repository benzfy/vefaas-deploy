import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { Logo, Header } from './Header.js';
import { StatusMessage } from './LogOutput.js';
import {
  loadProjectConfig,
  saveProjectConfig,
  getVolcengineCredentials,
  hasValidGlobalConfig,
} from '../lib/config.js';
import type { ProjectConfig } from '../lib/config.js';
import { FaaSClient, type FunctionListItem } from '../lib/faas-client.js';

type WizardStep =
  | 'check_creds'
  | 'project_name'
  | 'registry_url'
  | 'registry_namespace'
  | 'service_menu'
  | 'service_name'
  | 'service_dockerfile'
  | 'service_context'
  | 'service_image_name'
  | 'loading_functions'
  | 'select_function'
  | 'manual_function_id'
  | 'confirm'
  | 'done';

interface ProjectConfigWizardProps {
  onComplete?: () => void;
}

export function ProjectConfigWizard({ onComplete }: ProjectConfigWizardProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<WizardStep>('check_creds');
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [functions, setFunctions] = useState<FunctionListItem[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
  // 配置状态
  const [config, setConfig] = useState<ProjectConfig>(() => {
    const existing = loadProjectConfig();
    return existing || {
      name: '',
      registry: { url: '', namespace: '' },
      services: {},
    };
  });
  
  // 当前编辑的服务
  const [currentServiceName, setCurrentServiceName] = useState('');
  const [currentService, setCurrentService] = useState({
    functionId: '',
    dockerfile: '',
    context: '.',
    imageName: '',
    platform: 'linux/amd64',
  });

  // 检查凭证 - 没有凭证也可以继续配置
  useEffect(() => {
    if (step === 'check_creds') {
      setStep('project_name');
      setInputValue(config.name || 'my-project');
      if (!hasValidGlobalConfig()) {
        setMessage({
          type: 'info',
          text: '未配置凭证，函数 ID 需要手动输入',
        });
      }
    }
  }, [step, config.name]);

  // 加载函数列表
  useEffect(() => {
    if (step === 'loading_functions') {
      const loadFunctions = async () => {
        try {
          const creds = getVolcengineCredentials();
          const client = new FaaSClient(creds);
          const result = await client.listFunctions({ pageSize: 100 });
          setFunctions(result.Items || []);
          setStep('select_function');
        } catch (err) {
          setLoadingError(err instanceof Error ? err.message : String(err));
          setStep('select_function');
        }
      };
      loadFunctions();
    }
  }, [step]);

  const handleInputSubmit = useCallback(() => {
    switch (step) {
      case 'project_name':
        setConfig(prev => ({ ...prev, name: inputValue }));
        setStep('registry_url');
        setInputValue(config.registry.url || 'xxx.cr.volces.com');
        break;
        
      case 'registry_url':
        setConfig(prev => ({ ...prev, registry: { ...prev.registry, url: inputValue } }));
        setStep('registry_namespace');
        setInputValue(config.registry.namespace || 'my-namespace');
        break;
        
      case 'registry_namespace':
        setConfig(prev => ({ ...prev, registry: { ...prev.registry, namespace: inputValue } }));
        setStep('service_menu');
        break;
        
      case 'service_name':
        setCurrentServiceName(inputValue);
        setStep('service_dockerfile');
        setInputValue(config.services[inputValue]?.dockerfile || 'Dockerfile');
        break;
        
      case 'service_dockerfile':
        setCurrentService(prev => ({ ...prev, dockerfile: inputValue }));
        setStep('service_context');
        // 默认 context 是 "."
        setInputValue(config.services[currentServiceName]?.context || '.');
        break;
        
      case 'service_context':
        setCurrentService(prev => ({ ...prev, context: inputValue }));
        setStep('service_image_name');
        // 自动推断 imageName：api 用项目名，其他用 项目名-服务名
        const defaultImageName = currentServiceName === 'api' 
          ? config.name 
          : `${config.name}-${currentServiceName}`;
        setInputValue(config.services[currentServiceName]?.imageName || defaultImageName || currentServiceName);
        break;
        
      case 'service_image_name':
        setCurrentService(prev => ({ ...prev, imageName: inputValue }));
        // 如果有凭证，加载函数列表；否则手动输入
        if (hasValidGlobalConfig()) {
          setStep('loading_functions');
        } else {
          setStep('manual_function_id');
          setInputValue(config.services[currentServiceName]?.functionId || '');
        }
        break;

      case 'manual_function_id':
        saveService(inputValue);
        break;
    }
  }, [step, inputValue, config, currentServiceName]);

  const saveService = (functionId: string) => {
    const newService = { ...currentService, functionId };
    setConfig(prev => ({
      ...prev,
      services: {
        ...prev.services,
        [currentServiceName]: newService,
      },
    }));
    setMessage({ type: 'success', text: `服务 "${currentServiceName}" 配置完成!` });
    setCurrentServiceName('');
    setCurrentService({
      functionId: '',
      dockerfile: '',
      context: '.',
      imageName: '',
      platform: 'linux/amd64',
    });
    setStep('service_menu');
  };

  const handleFunctionSelect = useCallback((item: { value: string }) => {
    if (item.value === 'skip') {
      saveService('');
    } else if (item.value === 'manual') {
      setStep('manual_function_id');
      setInputValue('');
    } else {
      saveService(item.value);
    }
  }, [currentServiceName, currentService]);

  const handleServiceMenuSelect = useCallback((item: { value: string }) => {
    if (item.value === 'add') {
      setStep('service_name');
      setInputValue('');
    } else if (item.value === 'save') {
      saveProjectConfig(config);
      setMessage({ type: 'success', text: '配置已保存到 deploy.config.json!' });
      setStep('done');
    } else if (item.value === 'cancel') {
      onComplete?.();
      exit();
    } else {
      // 编辑现有服务
      const serviceName = item.value;
      setCurrentServiceName(serviceName);
      const existingService = config.services[serviceName];
      setCurrentService({
        functionId: existingService?.functionId || '',
        dockerfile: existingService?.dockerfile || 'Dockerfile',
        context: existingService?.context || '.',
        imageName: existingService?.imageName || serviceName,
        platform: existingService?.platform || 'linux/amd64',
      });
      setStep('service_dockerfile');
      setInputValue(existingService?.dockerfile || 'Dockerfile');
    }
  }, [config, exit, onComplete]);

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'service_menu' || step === 'done') {
        onComplete?.();
        exit();
      } else if (step !== 'check_creds' && step !== 'loading_functions') {
        setStep('service_menu');
      }
    }
  });

  const getPromptInfo = (): { prompt: string; hint?: string } => {
    switch (step) {
      case 'project_name': 
        return { prompt: '项目名称:', hint: '用于显示，如 liminian' };
      case 'registry_url': 
        return { prompt: '镜像仓库地址:', hint: '如 ai-image-cn-beijing.cr.volces.com' };
      case 'registry_namespace': 
        return { prompt: '镜像仓库命名空间:', hint: '如 ai-image' };
      case 'service_name': 
        return { prompt: '服务名称:', hint: '如 api, worker' };
      case 'service_dockerfile': 
        return { prompt: 'Dockerfile 路径:', hint: '相对于项目根目录' };
      case 'service_context': 
        return { prompt: '构建上下文:', hint: 'docker build 最后的路径参数，通常是 "." 或子目录' };
      case 'service_image_name': 
        return { prompt: '镜像名称:', hint: '不含 registry 和 tag' };
      case 'manual_function_id':
        return { prompt: '函数 ID:', hint: '从 veFaaS 控制台获取，可留空稍后配置' };
      default: 
        return { prompt: '' };
    }
  };

  // 构建服务菜单项
  const serviceMenuItems = [
    { label: '➕ 添加新服务', value: 'add' },
    ...Object.keys(config.services).map(name => ({
      label: `📦 ${name} ${config.services[name].functionId ? `(${config.services[name].functionId.slice(0,8)}...)` : '(未绑定函数)'}`,
      value: name,
    })),
    { label: '💾 保存并退出', value: 'save' },
    { label: '❌ 取消', value: 'cancel' },
  ];

  // 构建函数选择列表
  const functionItems = [
    { label: '⏭️  跳过（稍后配置）', value: 'skip' },
    { label: '✏️  手动输入函数 ID', value: 'manual' },
    ...functions.map(fn => ({
      label: `${fn.Name} (${fn.Id.slice(0, 12)}...)`,
      value: fn.Id,
    })),
  ];

  if (step === 'done') {
    return (
      <Box flexDirection="column" padding={1}>
        <Logo />
        <StatusMessage type="success" message="项目配置完成!" />
        <Box marginTop={1} flexDirection="column">
          <Text>配置已保存到: <Text color="cyan">deploy.config.json</Text></Text>
          <Box marginTop={1}>
            <Text color="gray">下一步: </Text>
            <Text color="cyan">vefaas-deploy deploy --version v0.1.0</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>按任意键退出</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'loading_functions') {
    return (
      <Box flexDirection="column" padding={1}>
        <Logo />
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> 正在从 veFaaS 加载函数列表...</Text>
        </Box>
      </Box>
    );
  }

  const { prompt, hint } = getPromptInfo();

  return (
    <Box flexDirection="column" padding={1}>
      <Logo />
      <Header
        title="项目配置"
        subtitle={currentServiceName ? `正在配置服务: ${currentServiceName}` : undefined}
      />

      {message && (
        <Box marginBottom={1}>
          <StatusMessage type={message.type} message={message.text} />
        </Box>
      )}

      {step === 'service_menu' && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>服务列表:</Text>
          <SelectInput items={serviceMenuItems} onSelect={handleServiceMenuSelect} />
        </Box>
      )}

      {step === 'select_function' && (
        <Box flexDirection="column">
          {loadingError ? (
            <>
              <StatusMessage type="error" message={`加载函数列表失败: ${loadingError}`} />
              <Box marginTop={1}>
                <Text color="gray">可以手动输入函数 ID 或稍后在配置文件中添加</Text>
              </Box>
              <Box marginTop={1}>
                <SelectInput 
                  items={[
                    { label: '✏️  手动输入函数 ID', value: 'manual' },
                    { label: '⏭️  跳过', value: 'skip' },
                  ]} 
                  onSelect={handleFunctionSelect} 
                />
              </Box>
            </>
          ) : functions.length === 0 ? (
            <>
              <Text color="yellow">账号下没有找到函数</Text>
              <Box marginTop={1}>
                <SelectInput 
                  items={[
                    { label: '✏️  手动输入函数 ID', value: 'manual' },
                    { label: '⏭️  跳过', value: 'skip' },
                  ]} 
                  onSelect={handleFunctionSelect} 
                />
              </Box>
            </>
          ) : (
            <>
              <Text color="cyan">为 "{currentServiceName}" 选择函数:</Text>
              <SelectInput items={functionItems} onSelect={handleFunctionSelect} />
            </>
          )}
        </Box>
      )}

      {['project_name', 'registry_url', 'registry_namespace', 'service_name', 
        'service_dockerfile', 'service_context', 'service_image_name', 'manual_function_id'].includes(step) && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="cyan">{prompt}</Text>
          </Box>
          {hint && (
            <Box marginBottom={1}>
              <Text color="gray" dimColor>💡 {hint}</Text>
            </Box>
          )}
          <Box>
            <Text color="gray">{'> '}</Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleInputSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>Enter 确认 | ESC 返回</Text>
          </Box>
        </Box>
      )}

      {/* 当前配置预览 */}
      <Box marginTop={2} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
        <Text color="gray" bold>当前配置:</Text>
        <Text color="gray">项目: {config.name || '(未设置)'}</Text>
        <Text color="gray">仓库: {config.registry.url || '(未设置)'}/{config.registry.namespace || ''}</Text>
        <Text color="gray">服务: {Object.keys(config.services).length > 0 
          ? Object.keys(config.services).join(', ') 
          : '(无)'}</Text>
      </Box>
    </Box>
  );
}
