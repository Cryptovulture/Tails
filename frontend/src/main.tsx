import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

interface EBState { error: string | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
    state: EBState = { error: null };
    static getDerivedStateFromError(err: Error) { return { error: err.message }; }
    render() {
        if (this.state.error) {
            return (
                <div style={{ color: '#ff4444', padding: '2rem', fontFamily: 'monospace' }}>
                    <h1>App crashed</h1>
                    <pre>{this.state.error}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>,
);
