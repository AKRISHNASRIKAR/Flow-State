import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastContainer } from './components/ui';
import { AdminPage } from './pages/AdminPage';
import { ExecutionDetailPage } from './pages/executions/ExecutionDetailPage';
import { ExecutionsPage } from './pages/executions/ExecutionsPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { WorkflowDetailPage } from './pages/workflows/WorkflowDetailPage';
import { WorkflowsListPage } from './pages/workflows/WorkflowsListPage';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/workflows" replace />} />
            <Route path="/workflows" element={<WorkflowsListPage />} />
            <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
            <Route path="/executions/:id" element={<ExecutionDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/workflows" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
