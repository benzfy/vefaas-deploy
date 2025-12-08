import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { Logo, Header } from './Header.js';
import { StatusMessage } from './LogOutput.js';
import { 
  globalConfig, 
  getGlobalConfig, 
  loadProjectConfig,
  saveProjectConfig,
  createDefaultProjectConfig,
  findProjectConfigPath,
} from '../lib/config.js';
import type { ProjectConfig } from '../lib/config.js';

type ConfigStep =
  | 'menu'
  | 'volcengine_ak'
  | 'volcengine_sk'
  | 'volcengine_region'
  | 'init_name'
  | 'init_registry_url'
  | 'init_registry_ns'
  | 'done';

interface ConfigWizardProps {
  mode?: 'config' | 'init';
  onComplete?: () => void;
}

export function ConfigWizard({ mode = 'config', onComplete }: ConfigWizardProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<ConfigStep>(mode === 'init' ? 'init_name' : 'menu');
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [newConfig, setNewConfig] = useState<Partial<ProjectConfig>>({});

  const currentGlobalConfig = getGlobalConfig();
  const projectConfig = loadProjectConfig();
  const configPath = findProjectConfigPath();

  const handleMenuSelect = useCallback((item: { value: string }) => {
    switch (item.value) {
      case 'volcengine':
        setStep('volcengine_ak');
        setInputValue(currentGlobalConfig.volcengine?.accessKeyId || '');
        break;
      case 'init':
        setStep('init_name');
        setInputValue(projectConfig?.name || 'my-project');
        break;
      case 'show':
        console.log('\n=== Global Config ===');
        console.log(JSON.stringify(currentGlobalConfig, null, 2));
        if (projectConfig) {
          console.log('\n=== Project Config ===');
          console.log(`Path: ${configPath}`);
          console.log(JSON.stringify(projectConfig, null, 2));
        }
        setMessage({ type: 'info', text: 'Config printed to console' });
        break;
      case 'exit':
        onComplete?.();
        exit();
        break;
    }
  }, [currentGlobalConfig, projectConfig, configPath, exit, onComplete]);

  const handleInputSubmit = useCallback(() => {
    switch (step) {
      // Volcengine credentials
      case 'volcengine_ak':
        globalConfig.set('volcengine.accessKeyId', inputValue);
        setStep('volcengine_sk');
        setInputValue(currentGlobalConfig.volcengine?.secretAccessKey || '');
        break;
      case 'volcengine_sk':
        globalConfig.set('volcengine.secretAccessKey', inputValue);
        setStep('volcengine_region');
        setInputValue(currentGlobalConfig.volcengine?.region || 'cn-beijing');
        break;
      case 'volcengine_region':
        globalConfig.set('volcengine.region', inputValue);
        setMessage({ type: 'success', text: 'Volcengine credentials saved!' });
        setStep('menu');
        break;

      // Init project config
      case 'init_name':
        setNewConfig(prev => ({ ...prev, name: inputValue }));
        setStep('init_registry_url');
        setInputValue(projectConfig?.registry?.url || 'your-registry.cr.volces.com');
        break;
      case 'init_registry_url':
        setNewConfig(prev => ({
          ...prev,
          registry: { ...prev.registry, url: inputValue, namespace: prev.registry?.namespace || '' },
        }));
        setStep('init_registry_ns');
        setInputValue(projectConfig?.registry?.namespace || 'your-namespace');
        break;
      case 'init_registry_ns':
        const finalConfig = createDefaultProjectConfig(newConfig.name || 'my-project');
        finalConfig.registry = {
          url: newConfig.registry?.url || 'your-registry.cr.volces.com',
          namespace: inputValue,
        };
        saveProjectConfig(finalConfig);
        setMessage({ type: 'success', text: 'Project config saved to deploy.config.json!' });
        if (mode === 'init') {
          setStep('done');
        } else {
          setStep('menu');
        }
        break;
    }
  }, [step, inputValue, currentGlobalConfig, projectConfig, newConfig, mode]);

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'menu' || step === 'done') {
        exit();
      } else {
        setStep('menu');
      }
    }
  });

  const menuItems = [
    { label: '🔑 Configure Volcengine Credentials (Global)', value: 'volcengine' },
    { label: '📄 Initialize Project Config', value: 'init' },
    { label: '👀 Show Current Config', value: 'show' },
    { label: '❌ Exit', value: 'exit' },
  ];

  const getPromptText = (): string => {
    switch (step) {
      case 'volcengine_ak': return 'Enter Access Key ID:';
      case 'volcengine_sk': return 'Enter Secret Access Key:';
      case 'volcengine_region': return 'Enter Region (default: cn-beijing):';
      case 'init_name': return 'Enter project name:';
      case 'init_registry_url': return 'Enter registry URL:';
      case 'init_registry_ns': return 'Enter registry namespace:';
      default: return '';
    }
  };

  if (step === 'done') {
    return (
      <Box flexDirection="column" padding={1}>
        <Logo />
        <StatusMessage type="success" message="Configuration complete!" />
        <Box marginTop={1}>
          <Text>
            Next steps:{'\n'}
            1. Edit <Text color="cyan">deploy.config.json</Text> to configure your services{'\n'}
            2. Run <Text color="cyan">liminian-deploy deploy --help</Text> to see deployment options
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>Press any key to exit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Logo />
      <Header
        title="Configuration"
        subtitle={mode === 'init' ? 'Initialize project config' : 'Manage deployment settings'}
      />

      {message && (
        <Box marginBottom={1}>
          <StatusMessage type={message.type} message={message.text} />
        </Box>
      )}

      {step === 'menu' ? (
        <Box flexDirection="column">
          <SelectInput items={menuItems} onSelect={handleMenuSelect} />
          <Box marginTop={1}>
            <Text color="gray" dimColor>Press ESC to exit</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="cyan">{getPromptText()}</Text>
          </Box>
          <Box>
            <Text color="gray">{'> '}</Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleInputSubmit}
              mask={step === 'volcengine_sk' ? '*' : undefined}
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>Press Enter to confirm, ESC to go back</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={2} borderStyle="single" borderColor="gray" paddingX={1}>
        <Box flexDirection="column">
          <Text color="gray" bold>Status:</Text>
          <Text color="gray">
            Credentials: {currentGlobalConfig.volcengine?.accessKeyId ? '✓ Configured' : '✗ Not set'}
          </Text>
          <Text color="gray">
            Project Config: {projectConfig ? `✓ ${configPath}` : '✗ Not found'}
          </Text>
          {projectConfig && (
            <>
              <Text color="gray">  Name: {projectConfig.name}</Text>
              <Text color="gray">  Services: {Object.keys(projectConfig.services).join(', ')}</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
