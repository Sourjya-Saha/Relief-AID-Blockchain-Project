import { BrowserRouter } from 'react-router-dom';
import { Web3Provider, AuthProvider, ContractProvider, ThemeProvider } from './context/Contexts';
import { ErrorBoundary } from './components/Common';
import AppRoutes from './routes';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <Web3Provider>
            <AuthProvider>
              <ContractProvider>
                <AppRoutes />
              </ContractProvider>
            </AuthProvider>
          </Web3Provider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;