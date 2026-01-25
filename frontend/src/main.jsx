import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client' // Correct React 18 API
import './index.css'
import App from './App.jsx'
import { SnackbarProvider } from './components/Snackbar';
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SnackbarProvider>
    <App />
    </SnackbarProvider>
  </StrictMode>,
)