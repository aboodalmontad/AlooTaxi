import React, { createContext, useState, useContext, ReactNode } from 'react';
import { User, UserRole, SyrianProvinces, Driver, VehicleType } from '../types';

interface AuthContextType {
  user: User | null;
  login: (details: { name: string; phone: string; role: UserRole; province?: SyrianProvinces; }) => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Expanded mock users and exported for seeding the 'database'
export const mockUsers: { [phone: string]: User } = {
    // Customers
    '0912345678': { id: 'cust1', phone: '0912345678', name: 'علي الزبون', role: UserRole.CUSTOMER, province: SyrianProvinces.DAMASCUS },
    '0911111111': { id: 'cust2', phone: '0911111111', name: 'فاطمة العلي', role: UserRole.CUSTOMER, province: SyrianProvinces.ALEPPO },

    // Drivers
    '0987654321': { id: 'driv1', phone: '0987654321', name: 'سامر السائق', role: UserRole.DRIVER, province: SyrianProvinces.DAMASCUS, vehicle: { model: 'Kia Rio', plateNumber: '321789', type: VehicleType.AC_CAR }, rating: 4.8, isOnline: true } as Driver,
    '0988888888': { id: 'driv2', phone: '0988888888', name: 'خالد المصري', role: UserRole.DRIVER, province: SyrianProvinces.DAMASCUS, vehicle: { model: 'Mercedes S-Class', plateNumber: '123123', type: VehicleType.VIP }, rating: 4.9, isOnline: true } as Driver,
    '0977777777': { id: 'driv3', phone: '0977777777', name: 'لينا الحسن', role: UserRole.DRIVER, province: SyrianProvinces.ALEPPO, vehicle: { model: 'Toyota Corolla', plateNumber: '987654', type: VehicleType.NORMAL_CAR }, rating: 4.6, isOnline: false } as Driver,
    '0966666666': { id: 'driv4', phone: '0966666666', name: 'حسن دراج', role: UserRole.DRIVER, province: SyrianProvinces.HOMS, vehicle: { model: 'Vespa', plateNumber: '555444', type: VehicleType.MOTORCYCLE }, rating: 4.7, isOnline: true } as Driver,


    // Admin
    '0999999999': { id: 'admin1', phone: '0999999999', name: 'المدير العام', role: UserRole.ADMIN },
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (details: { name: string, phone: string, role: UserRole, province?: SyrianProvinces }): Promise<User | null> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ADMIN LOGIN: Special case, handled first for security and clarity.
    if (details.role === UserRole.ADMIN) {
        if (details.phone === '0999999999' && details.name === 'admin123') {
            // On successful admin login, create the user object directly.
            // This makes the admin login self-contained and not dependent on the mockUsers object state.
            const adminUser: User = { 
                id: 'admin1', 
                phone: '0999999999', 
                name: 'المدير العام', 
                role: UserRole.ADMIN 
            };
            setUser(adminUser);
            return adminUser;
        } else {
            return null; // Invalid admin credentials
        }
    }

    // CUSTOMER & DRIVER LOGIN / SIGNUP
    const existingUser = mockUsers[details.phone];

    if (existingUser) {
        // User exists: LOGIN attempt.
        if (existingUser.role === details.role) {
            setUser(existingUser);
            return existingUser; // Successful login
        } else {
            // Phone number exists but with a different role.
            return null; 
        }
    } else {
        // User does not exist: SIGNUP attempt.
        const newUser: User = {
            id: `user_${Date.now()}`,
            phone: details.phone,
            name: details.name,
            role: details.role,
            province: details.province
        };

        // For a new driver, add default vehicle info
        if (details.role === UserRole.DRIVER) {
            (newUser as Driver).vehicle = { model: 'Default Car', plateNumber: '123456', type: VehicleType.NORMAL_CAR };
            (newUser as Driver).rating = 4.5;
            (newUser as Driver).isOnline = true;
        }

        mockUsers[details.phone] = newUser;
        setUser(newUser);
        return newUser; // Successful signup
    }
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};