import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {ReactFlowProvider } from '@xyflow/react'

import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";

const themeOptions = createTheme({
  components: {
  },
  palette: {
    mode: 'dark',
    primary: {
      main: '#ffb300',
    },
    secondary: {
      main: '#00695f',
    },
    background: {
      default: '#121212',
      paper: '#1a1a1a',
    },
  },
  typography: {
    fontSize: 13,
    fontFamily: 'JetBrains Mono',
  },
  /* Disable all transitions
  transitions: {
    create: () => 'none',
  }
  */
});

import App from './App.tsx'
import Box from '@mui/material/Box';
import ToolBar from './components/ToolBar.tsx';
import ActionBar from './components/ActionBar.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={themeOptions}>
      <CssBaseline />
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}>
        <ActionBar />
        <Box sx={{
          display: 'flex',
          flex: 1,
        }}>
          <ToolBar />
          <Box sx={{ flex: 1, height: '100%' }}>
            <ReactFlowProvider>
              <App />
            </ReactFlowProvider>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  </StrictMode>
)