import { create } from 'zustand';

const useStore = create((set) => ({
    employees: [],
    selectedEmployee: null,

    setEmployees: (employeesOrUpdater) => set((state) => ({
        employees: typeof employeesOrUpdater === 'function'
            ? employeesOrUpdater(state.employees)
            : employeesOrUpdater
    })),

    updateEmployeeStatus: (id, status) => set((state) => ({
        employees: state.employees.map(emp =>
            emp.id === id ? { ...emp, status } : emp
        )
    })),

    updateEmployeeBySocket: (socketId, updates) => set((state) => ({
        employees: state.employees.map(emp =>
            emp.socketId === socketId ? { ...emp, ...updates } : emp
        )
    })),

    setSelectedEmployee: (employee) => set({ selectedEmployee: employee }),
}));

export default useStore;
