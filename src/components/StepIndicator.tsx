import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import type { Step } from '../lib/types.js';

interface StepIndicatorProps {
  steps: Step[];
  showDuration?: boolean;
}

const statusIcons: Record<string, { icon: string; color: string }> = {
  pending: { icon: figures.circle, color: 'gray' },
  running: { icon: '', color: 'cyan' },
  success: { icon: figures.tick, color: 'green' },
  error: { icon: figures.cross, color: 'red' },
  skipped: { icon: figures.arrowRight, color: 'yellow' },
};

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function StepIndicator({ steps, showDuration = true }: StepIndicatorProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      {steps.map((step, index) => {
        const { icon, color } = statusIcons[step.status];
        const isRunning = step.status === 'running';
        const duration = formatDuration(step.duration);

        return (
          <Box key={step.id} marginBottom={index < steps.length - 1 ? 0 : 0}>
            <Box width={3}>
              {isRunning ? (
                <Text color={color}>
                  <Spinner type="dots" />
                </Text>
              ) : (
                <Text color={color}>{icon}</Text>
              )}
            </Box>
            <Box flexGrow={1}>
              <Text color={step.status === 'pending' ? 'gray' : 'white'}>
                {step.name}
              </Text>
              {step.message && (
                <Text color="gray" dimColor>
                  {' '}— {step.message}
                </Text>
              )}
            </Box>
            {showDuration && duration && (
              <Box marginLeft={2}>
                <Text color="gray" dimColor>
                  {duration}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

