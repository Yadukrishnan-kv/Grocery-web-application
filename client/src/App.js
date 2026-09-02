import './App.css';
import Dom from './dom/Dom';
import { Toaster } from './utils/toast';

function App() {
  return (
    <div className="App">
  
<Toaster 
  position="top-right"
  toastOptions={{
    duration: 2000,
    style: {
      borderRadius: '10px',
      background: '#333',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
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
