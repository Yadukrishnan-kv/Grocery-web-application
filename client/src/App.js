import { useEffect, useState } from 'react';
import './App.css';
import Dom from './dom/Dom';
import { Toaster } from './utils/toast';

function App() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="App">

<Toaster
  position={isMobile ? 'top-center' : 'top-right'}
  containerStyle={{
    top: isMobile ? 12 : 16,
    left: isMobile ? 12 : 16,
    right: isMobile ? 12 : 16,
  }}
  toastOptions={{
    duration: 2000,
    style: {
      borderRadius: '10px',
      background: '#333',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      maxWidth: isMobile ? 'calc(100vw - 24px)' : '350px',
      width: isMobile ? '100%' : 'auto',
      wordBreak: 'break-word',
      fontSize: isMobile ? '0.8125rem' : '0.875rem',
      boxSizing: 'border-box',
    },
    success: {
      style: {
        background: '#10b981',
        color: 'white',
      },
      iconTheme: {
        primary: 'white',
        secondary: '#10b981',
      },
    },
    error: {
      style: {
        background: '#ef4444',
        color: 'white',
      },
    },
  }}
/>
      <Dom />
    </div>
  );
}

export default App;
