import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';  // Sửa từ "src/index.css" thành "./index.css"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);