import './style.css';
import './poster.css';
import './upgrades.css';
import { App } from './app.ts';

const root = document.getElementById('app');
if (root) new App(root);
