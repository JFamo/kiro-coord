import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TERMINAL_CONFIG } from './config';

export const createTerminal = (theme, containerRef) => {
  const terminal = new Terminal({
    ...TERMINAL_CONFIG,
    theme
  });
  
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(containerRef);
  
  fitAddon.fit();
  if (terminal.cols > TERMINAL_CONFIG.cols) {
    terminal.resize(TERMINAL_CONFIG.cols, terminal.rows);
  }
  
  return { terminal, fitAddon };
};

export const setupResizeHandler = (containerRef, fitAddon) => {
  let resizeTimeout;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore resize errors
      }
    }, 100);
  });
  resizeObserver.observe(containerRef);
  return resizeObserver;
};

export const normalizeLineEndings = (content) => {
  // Convert LF to CRLF for proper xterm rendering
  return content.replace(/\r?\n/g, '\r\n');
};
