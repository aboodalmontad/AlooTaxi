import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import CustomerPage from './pages/CustomerPage';
import DriverPage from './pages/DriverPage';
import AdminPage from './pages/AdminPage';
import { RideProvider } from './contexts/RideContext';
import { setMapApiKey } from './services/mapService';

// --- Start of API Context ---
interface ApiContextType {
  apiKey: string;
  updateApiKey: (newKey: string) => void;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'allo-taxi-api-key';
const DEFAULT_API_KEY = '5b3ce3597851110001cf6248e12d4b05e23f4f36be3b1b7f7c69a82a';

const ApiProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [apiKey, setApiKey] = useState<string>(() => {
    const storedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
    return storedKey || DEFAULT_API_KEY;
  });

  useEffect(() => {
    setMapApiKey(apiKey);
  }, [apiKey]);

  const updateApiKey = (newKey: string) => {
    if (newKey && newKey.trim() !== '') {
      setApiKey(newKey);
      localStorage.setItem(LOCAL_STORAGE_KEY, newKey);
      alert('تم تحديث مفتاح API بنجاح!');
    } else {
      alert('مفتاح API لا يمكن أن يكون فارغًا.');
    }
  };

  return (
    <ApiContext.Provider value={{ apiKey, updateApiKey }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};
// --- End of API Context ---


const App: React.FC = () => {
  return (
    <ApiProvider>
      <AuthProvider>
        <RideProvider>
          <div className="bg-slate-900 text-white min-h-screen font-sans">
            <AppRoutes />
          </div>
        </RideProvider>
      </AuthProvider>
    </ApiProvider>
  );
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
        <Route 
          path="/" 
          element={
            user ? (
              user.role === 'ADMIN' ? <Navigate to="/admin" /> :
              user.role === 'DRIVER' ? <Navigate to="/driver" /> :
              <Navigate to="/customer" />
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
        <Route path="/customer" element={user && user.role === 'CUSTOMER' ? <CustomerPage /> : <Navigate to="/login" />} />
        <Route path="/driver" element={user && user.role === 'DRIVER' ? <DriverPage /> : <Navigate to="/login" />} />
        <Route path="/admin/*" element={user && user.role === 'ADMIN' ? <AdminPage /> : <Navigate to="/login" />} />
      </Routes>
    </HashRouter>
  );
};

export default App;