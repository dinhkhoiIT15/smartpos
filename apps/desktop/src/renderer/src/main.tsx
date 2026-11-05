import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('SmartPOS root element is missing');
createRoot(root).render(<App />);
