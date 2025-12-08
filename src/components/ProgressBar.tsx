import React from 'react';
import { Box, Text } from 'ink';

interface ProgressBarProps {
  percent: number;
  width?: number;
  showPercent?: boolean;
  label?: string;
}

export function ProgressBar({ 
  percent, 
  width = 30, 
  showPercent = true,
  label 
}: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clampedPercent / 100) * width);
  const empty = width - filled;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return (
    <Box>
      {label && (
        <Box marginRight={1}>
          <Text color="gray">{label}</Text>
        </Box>
      )}
      <Text color="cyan">{filledBar}</Text>
      <Text color="gray">{emptyBar}</Text>
      {showPercent && (
        <Box marginLeft={1}>
          <Text color="gray">{clampedPercent.toFixed(0)}%</Text>
        </Box>
      )}
    </Box>
  );
}

