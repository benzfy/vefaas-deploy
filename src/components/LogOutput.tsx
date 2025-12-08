import React from 'react';
import { Box, Text, Static } from 'ink';

interface LogOutputProps {
  logs: string[];
  maxLines?: number;
  title?: string;
}

export function LogOutput({ logs, maxLines = 8, title }: LogOutputProps) {
  const displayLogs = logs.slice(-maxLines);
  
  return (
    <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="gray" paddingX={1}>
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}
      {displayLogs.map((log, index) => (
        <Text key={index} wrap="truncate">
          {log.slice(0, 100)}
        </Text>
      ))}
      {logs.length > maxLines && (
        <Text dimColor>
          ... ({logs.length - maxLines} more lines)
        </Text>
      )}
    </Box>
  );
}

interface StatusMessageProps {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

const typeColors = {
  info: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
} as const;

const typeIcons = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✗',
};

export function StatusMessage({ type, message }: StatusMessageProps) {
  return (
    <Box>
      <Text color={typeColors[type]}>
        {typeIcons[type]} {message}
      </Text>
    </Box>
  );
}

