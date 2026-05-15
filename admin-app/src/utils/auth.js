export const getUser = () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
};

export const getToken = () => localStorage.getItem('token');

export const logout = () => {
    localStorage.clear();
    window.location.href = '/login';
};

export const isExpired = () => {
    const user = getUser();
    if (!user || !user.expiryDate) return false;
    return new Date() > new Date(user.expiryDate);
};

export const isSuperAdmin = () => {
    const user = getUser();
    return user?.role === 'superadmin';
};
