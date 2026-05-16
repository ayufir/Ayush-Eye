import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './components/Login';
import SuperAdmin from './components/SuperAdmin';
import MainDashboard from './pages/MainDashboard';
import { getToken, isExpired, isSuperAdmin } from './utils/auth';

function App() {
    return (
        <BrowserRouter>
            <Toaster position="top-right" />
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/superadmin" element={isSuperAdmin() ? <SuperAdmin /> : <Navigate to="/login" />} />
                <Route path="/" element={
                    !getToken() || isExpired() 
                        ? <Navigate to="/login" /> 
                        : (isSuperAdmin() ? <Navigate to="/superadmin" /> : <MainDashboard />)
                } />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
