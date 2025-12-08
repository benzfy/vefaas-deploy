import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>
          {figures.pointer} {title}
        </Text>
      </Box>
      {subtitle && (
        <Box marginLeft={2}>
          <Text color="gray" dimColor>
            {subtitle}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="cyan">╭</Text>
        <Text color="cyan">{'─'.repeat(35)}</Text>
        <Text color="cyan">╮</Text>
      </Text>
      <Text>
        <Text color="cyan">│</Text>
        <Text color="white" bold>  🚀 </Text>
        <Text color="magenta" bold>veFaaS</Text>
        <Text color="white" bold> Deploy CLI</Text>
        <Text>          </Text>
        <Text color="cyan">│</Text>
      </Text>
      <Text>
        <Text color="cyan">│</Text>
        <Text color="gray">  火山引擎函数服务部署工具      </Text>
        <Text color="cyan">│</Text>
      </Text>
      <Text>
        <Text color="cyan">╰</Text>
        <Text color="cyan">{'─'.repeat(35)}</Text>
        <Text color="cyan">╯</Text>
      </Text>
    </Box>
  );
}

