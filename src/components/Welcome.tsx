import React from 'react';
import { Box, Text } from 'ink';
import { Logo } from './Header.js';
import type { ProjectConfig } from '../lib/config.js';

interface WelcomeProps {
  configPath?: string | null;
  config?: ProjectConfig | null;
  hasCredentials: boolean;
  cwd: string;
}

export function Welcome({ configPath, config, hasCredentials, cwd }: WelcomeProps) {
  if (!configPath) {
    return <NoConfigWelcome cwd={cwd} />;
  }
  
  return <HasConfigWelcome configPath={configPath} config={config} hasCredentials={hasCredentials} />;
}

function NoConfigWelcome({ cwd }: { cwd: string }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Logo />
      
      <Box 
        borderStyle="round" 
        borderColor="yellow" 
        paddingX={2} 
        paddingY={1}
        flexDirection="column"
      >
        <Text color="yellow">⚠️  未找到 deploy.config.json 配置文件</Text>
        <Box marginTop={1}>
          <Text color="gray">📍 当前目录: </Text>
          <Text color="white">{cwd}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan" bold>🚀 快速开始:</Text>
        
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Box>
            <Box width={4}><Text color="green" bold>1.</Text></Box>
            <Text>配置凭证</Text>
            <Text color="gray" dimColor>（首次使用）</Text>
          </Box>
          <Box marginLeft={4}>
            <Text color="yellow">$ vefaas-deploy config</Text>
          </Box>
          
          <Box marginTop={1}>
            <Box width={4}><Text color="green" bold>2.</Text></Box>
            <Text>初始化项目配置</Text>
          </Box>
          <Box marginLeft={4}>
            <Text color="yellow">$ vefaas-deploy init</Text>
          </Box>
          
          <Box marginTop={1}>
            <Box width={4}><Text color="green" bold>3.</Text></Box>
            <Text>部署</Text>
          </Box>
          <Box marginLeft={4}>
            <Text color="yellow">$ vefaas-deploy deploy --version v0.1.0</Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text color="gray">💡 运行 </Text>
        <Text color="cyan">vefaas-deploy guide</Text>
        <Text color="gray"> 查看完整使用指南</Text>
      </Box>
    </Box>
  );
}

function HasConfigWelcome({ configPath, config, hasCredentials }: {
  configPath: string;
  config?: ProjectConfig | null;
  hasCredentials: boolean;
}) {
  const services = config ? Object.keys(config.services) : [];
  
  return (
    <Box flexDirection="column" padding={1}>
      <Logo />

      {/* 项目状态 */}
      <Box 
        borderStyle="round" 
        borderColor="green" 
        paddingX={2} 
        paddingY={1}
        flexDirection="column"
      >
        <Box>
          <Text color="gray">📄 配置文件: </Text>
          <Text color="white">{configPath}</Text>
        </Box>
        <Box>
          <Text color="gray">📦 项目名称: </Text>
          <Text color="cyan" bold>{config?.name || 'unknown'}</Text>
        </Box>
        <Box>
          <Text color="gray">🔧 服务列表: </Text>
          {services.map((s, i) => (
            <Text key={s}>
              <Text color="yellow">{s}</Text>
              {i < services.length - 1 && <Text color="gray">, </Text>}
            </Text>
          ))}
          {services.length === 0 && <Text color="gray" dimColor>无</Text>}
        </Box>
        <Box>
          <Text color="gray">🔑 凭证状态: </Text>
          {hasCredentials ? (
            <Text color="green">✓ 已配置</Text>
          ) : (
            <Text color="red">✗ 未配置</Text>
          )}
        </Box>
      </Box>

      {/* 快捷命令 */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan" bold>🎯 快捷命令:</Text>
        
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <QuickCmd label="部署全部" cmd="vefaas-deploy deploy --version v0.1.0" />
          {services.length > 0 && (
            <QuickCmd label={`部署 ${services[0]}`} cmd={`vefaas-deploy deploy -s ${services[0]} --version v0.1.0`} />
          )}
          <QuickCmd label="编辑配置" cmd="vefaas-deploy init" />
          <QuickCmd label="查看帮助" cmd="vefaas-deploy --help" />
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text color="gray">💡 运行 </Text>
        <Text color="cyan">vefaas-deploy guide</Text>
        <Text color="gray"> 查看完整使用指南</Text>
      </Box>
    </Box>
  );
}

function QuickCmd({ label, cmd }: { label: string; cmd: string }) {
  return (
    <Box>
      <Box width={14}>
        <Text color="gray"># {label}</Text>
      </Box>
      <Text color="yellow">$ {cmd}</Text>
    </Box>
  );
}

