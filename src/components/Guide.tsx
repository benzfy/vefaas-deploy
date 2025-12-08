import React from 'react';
import { Box, Text } from 'ink';
import { Logo } from './Header.js';

export function Guide() {
  return (
    <Box flexDirection="column" padding={1}>
      <Logo />

      {/* 快速开始 */}
      <Box 
        flexDirection="column" 
        borderStyle="round" 
        borderColor="green" 
        paddingX={2} 
        paddingY={1}
      >
        <Text color="green" bold>🚀 快速开始</Text>
        
        <Box flexDirection="column" marginTop={1}>
          <Step number={1} title="配置凭证" command="vefaas-deploy config">
            输入火山引擎 Access Key（从控制台获取）
          </Step>
          
          <Step number={2} title="初始化项目" command="vefaas-deploy init">
            配置镜像仓库、服务、自动选择函数
          </Step>
          
          <Step number={3} title="部署" command="vefaas-deploy deploy --version v0.1.0">
            构建 → 推送 → 更新函数 → 发布
          </Step>
        </Box>
      </Box>

      {/* 常用命令 */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan" bold>📦 常用命令</Text>
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <CmdRow cmd="deploy --auto" desc="自动递增版本并部署" />
          <CmdRow cmd="deploy -v v0.1.0" desc="指定版本部署" />
          <CmdRow cmd="deploy -s api --auto" desc="只部署 api" />
          <CmdRow cmd="images" desc="查看远端仓库镜像版本" />
          <CmdRow cmd="init" desc="编辑项目配置" />
          <CmdRow cmd="config" desc="修改凭证" />
        </Box>
      </Box>

      {/* 函数管理 */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan" bold>🔧 函数管理 (vefaas-deploy function)</Text>
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <CmdRow cmd="fn list" desc="列出所有 veFaaS 函数" />
          <CmdRow cmd="fn info <id>" desc="查看函数详情" />
          <CmdRow cmd="fn current" desc="查看项目函数当前镜像" />
        </Box>
      </Box>

      {/* AI 辅助配置 */}
      <Box 
        flexDirection="column" 
        borderStyle="round" 
        borderColor="magenta" 
        paddingX={2} 
        paddingY={1}
        marginTop={1}
      >
        <Text color="magenta" bold>🤖 AI 辅助配置</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">如果不想手动配置，可以让 AI 帮你生成 deploy.config.json:</Text>
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text color="cyan">1. </Text>
              <Text>运行 </Text>
              <Text color="yellow">vefaas-deploy gen-guide</Text>
              <Text> 生成配置指南</Text>
            </Box>
            <Box>
              <Text color="cyan">2. </Text>
              <Text>将 </Text>
              <Text color="yellow">deploy_guide.md</Text>
              <Text> 发给 AI，让它分析 Dockerfile</Text>
            </Box>
            <Box>
              <Text color="cyan">3. </Text>
              <Text>AI 会自动生成正确的 </Text>
              <Text color="yellow">deploy.config.json</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">💡 </Text>
        <Text color="gray">vefaas-deploy </Text>
        <Text color="cyan">[命令] --help</Text>
        <Text color="gray"> 查看详细选项</Text>
      </Box>
    </Box>
  );
}

function Step({ number, title, command, children }: { 
  number: number; 
  title: string; 
  command: string; 
  children: React.ReactNode 
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>{number}. </Text>
        <Text bold>{title}</Text>
      </Box>
      <Box marginLeft={3}>
        <Text color="yellow">$ {command}</Text>
      </Box>
      <Box marginLeft={3}>
        <Text color="gray" dimColor>{children}</Text>
      </Box>
    </Box>
  );
}

function CmdRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <Box>
      <Box width={32}>
        <Text color="yellow">$ vefaas-deploy {cmd}</Text>
      </Box>
      <Text color="gray" dimColor># {desc}</Text>
    </Box>
  );
}
