import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { createWebApi } from './webApi';
import { store } from './store';
// mimo Electron (webová verze z odkazu): aplikační vrstva v prohlížeči
if (!window.zs) {
  window.zs = createWebApi();
  (window as unknown as { __zsDirty: () => boolean }).__zsDirty = () => store.state.dirty;
  document.documentElement.classList.add('web');
}
createRoot(document.getElementById('root')!).render(<App />);
